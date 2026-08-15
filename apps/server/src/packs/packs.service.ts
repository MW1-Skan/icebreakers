/**
 * Chargeur de packs (PRD §4) : lit `packs/builtin/` (committés, mode normal)
 * ET `data/packs/` (uploadés à chaud, gitignorés) dès maintenant — la page
 * /admin viendra plus tard. Un pack invalide est rejeté au chargement avec un
 * rapport lisible, jamais de crash.
 */
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { entryElementId, normalizeText, shuffled, validatePack } from '../shared';
import type {
  AdminPackInfo,
  AdminUploadResult,
  ContentMode,
  GameId,
  ItoPackEntry,
  JustOnePackEntry,
  Pack,
  PackMode,
  Rng,
  SpyfallPackEntry,
  TabooCard,
  UndercoverPackEntry,
  WavelengthPackEntry,
} from '../shared';
import { AppConfigService } from '../config/app-config.service';
import { NoopTeamHistoryStore } from './team-history';

export interface LoadReportEntry {
  file: string;
  packId?: string;
  ok: boolean;
  errors: string[];
}

interface LoadedPack {
  pack: Pack;
  source: 'builtin' | 'data';
  file: string;
  enabled: boolean;
}

export interface DrawnElement<E> {
  elementId: string;
  entry: E;
  /** Pool épuisé → cycle recommencé (bandeau « contenu recyclé » côté host). */
  recycled: boolean;
}

interface IndexedElement {
  elementId: string;
  packId: string;
  mode: PackMode;
  index: number;
}

@Injectable()
export class PacksService implements OnModuleInit {
  private readonly logger = new Logger('Packs');
  private packs = new Map<string, LoadedPack>(); // par id
  private disabledIds = new Set<string>();
  readonly loadReport: LoadReportEntry[] = [];

  constructor(
    private readonly appConfig: AppConfigService,
    private readonly teamHistory: NoopTeamHistoryStore,
  ) {}

  onModuleInit(): void {
    this.loadAll();
  }

  /** Liste persistée des packs désactivés (à côté de data/packs/). */
  private get disabledFile(): string {
    return path.join(path.dirname(this.appConfig.dataPacksDir), 'packs-disabled.json');
  }

  private loadDisabledIds(): void {
    this.disabledIds.clear();
    try {
      if (fs.existsSync(this.disabledFile)) {
        const parsed = JSON.parse(fs.readFileSync(this.disabledFile, 'utf-8'));
        if (Array.isArray(parsed)) parsed.forEach((id) => this.disabledIds.add(String(id)));
      }
    } catch {
      this.logger.warn('packs-disabled.json illisible — tous les packs actifs.');
    }
  }

  private persistDisabledIds(): void {
    fs.mkdirSync(path.dirname(this.disabledFile), { recursive: true });
    fs.writeFileSync(this.disabledFile, JSON.stringify([...this.disabledIds], null, 2));
  }

  loadAll(): void {
    this.packs.clear();
    this.loadReport.length = 0;
    this.loadDisabledIds();
    this.loadDir(this.appConfig.builtinPacksDir, 'builtin');
    this.loadDir(this.appConfig.dataPacksDir, 'data');
    const loaded = [...this.packs.values()];
    this.logger.log(
      `${loaded.length} pack(s) chargé(s) : ${loaded.map((p) => `${p.pack.id} (${p.pack.game}/${p.pack.mode}, ${p.pack.entries.length} entrées${p.enabled ? '' : ', INACTIF'})`).join(', ') || 'aucun'}`,
    );
    for (const report of this.loadReport.filter((r) => !r.ok)) {
      this.logger.warn(`Pack rejeté « ${report.file} » :\n  - ${report.errors.join('\n  - ')}`);
    }
  }

  private loadDir(dir: string, source: 'builtin' | 'data'): void {
    if (!fs.existsSync(dir)) return;
    const files = fs
      .readdirSync(dir)
      .filter((f) => f.endsWith('.json'))
      .sort();
    for (const file of files) {
      const fullPath = path.join(dir, file);
      let parsed: unknown;
      try {
        parsed = JSON.parse(fs.readFileSync(fullPath, 'utf-8'));
      } catch (err) {
        this.loadReport.push({ file, ok: false, errors: [`JSON invalide : ${String(err)}`] });
        continue;
      }
      const result = validatePack(parsed);
      if (!result.ok) {
        this.loadReport.push({ file, ok: false, errors: result.errors });
        continue;
      }
      if (this.packs.has(result.pack.id)) {
        this.loadReport.push({
          file,
          packId: result.pack.id,
          ok: false,
          errors: [`id de pack en doublon : « ${result.pack.id} » déjà chargé`],
        });
        continue;
      }
      this.packs.set(result.pack.id, {
        pack: result.pack,
        source,
        file,
        enabled: !this.disabledIds.has(result.pack.id),
      });
      this.loadReport.push({ file, packId: result.pack.id, ok: true, errors: [] });
    }
  }

  /** Packs ACTIFS uniquement — les inactifs n'alimentent ni tirages ni modes. */
  packsFor(game: GameId, mode?: PackMode): Pack[] {
    return [...this.packs.values()]
      .filter((p) => p.enabled && p.pack.game === game && (mode === undefined || p.pack.mode === mode))
      .map((p) => p.pack);
  }

  /** Modes de contenu réellement disponibles pour un jeu (pilote l'UI host). */
  availableModesFor(game: GameId): ContentMode[] {
    const modes: ContentMode[] = [];
    if (this.packsFor(game, 'interne').length > 0) modes.push('interne');
    if (this.packsFor(game, 'normal').length > 0) modes.push('normal');
    if (modes.length === 2) modes.push('random');
    return modes;
  }

  drawUndercoverEntry(
    contentMode: ContentMode,
    usedEntryIds: Set<string>,
    rng: Rng,
    randomWeight: number,
    teamName?: string,
  ): DrawnElement<UndercoverPackEntry> | { error: 'NO_CONTENT' } {
    return this.drawEntry<UndercoverPackEntry>('undercover', contentMode, usedEntryIds, rng, randomWeight, teamName);
  }

  drawJustOneEntry(
    contentMode: ContentMode,
    usedEntryIds: Set<string>,
    rng: Rng,
    randomWeight: number,
    teamName?: string,
  ): DrawnElement<JustOnePackEntry> | { error: 'NO_CONTENT' } {
    return this.drawEntry<JustOnePackEntry>('justone', contentMode, usedEntryIds, rng, randomWeight, teamName);
  }

  drawWavelengthEntry(
    contentMode: ContentMode,
    usedEntryIds: Set<string>,
    rng: Rng,
    randomWeight: number,
    teamName?: string,
  ): DrawnElement<WavelengthPackEntry> | { error: 'NO_CONTENT' } {
    return this.drawEntry<WavelengthPackEntry>('wavelength', contentMode, usedEntryIds, rng, randomWeight, teamName);
  }

  drawItoEntry(
    contentMode: ContentMode,
    usedEntryIds: Set<string>,
    rng: Rng,
    randomWeight: number,
    teamName?: string,
  ): DrawnElement<ItoPackEntry> | { error: 'NO_CONTENT' } {
    return this.drawEntry<ItoPackEntry>('ito', contentMode, usedEntryIds, rng, randomWeight, teamName);
  }

  private modesInScope(contentMode: ContentMode): PackMode[] {
    return contentMode === 'random' ? ['interne', 'normal'] : [contentMode];
  }

  /**
   * Spyfall : tire un THÈME (anti-répétition sur l'entrée), puis construit la
   * grille = union des items de ce thème sur tous les packs actifs du mode
   * (fiche 5.4 — en Random, les items internes et normaux se mélangent).
   */
  drawSpyfallTheme(
    contentMode: ContentMode,
    usedEntryIds: Set<string>,
    rng: Rng,
    randomWeight: number,
    teamName?: string,
  ): (DrawnElement<SpyfallPackEntry> & { category: string; grid: string[] }) | { error: 'NO_CONTENT' } {
    const drawn = this.drawEntry<SpyfallPackEntry>('spyfall', contentMode, usedEntryIds, rng, randomWeight, teamName);
    if ('error' in drawn) return drawn;
    return {
      ...drawn,
      category: drawn.entry.category,
      grid: this.spyfallGridFor(drawn.entry.category, contentMode),
    };
  }

  /** Union dédupliquée (normalisée) des items d'un thème sur les packs du mode. */
  spyfallGridFor(category: string, contentMode: ContentMode): string[] {
    const normalizedCategory = normalizeText(category);
    const seen = new Set<string>();
    const grid: string[] = [];
    for (const mode of this.modesInScope(contentMode)) {
      for (const pack of this.packsFor('spyfall', mode)) {
        for (const entry of pack.entries as SpyfallPackEntry[]) {
          if (normalizeText(entry.category) !== normalizedCategory) continue;
          for (const item of entry.items) {
            const key = normalizeText(item);
            if (!seen.has(key)) {
              seen.add(key);
              grid.push(item);
            }
          }
        }
      }
    }
    return grid;
  }

  /**
   * Taboo : le deck entier du mode (union, dédupliqué par mot). Le jeu consomme
   * des dizaines de cartes par partie — l'anti-répétition par élément ne
   * s'applique pas (cf. DECISIONS.md).
   */
  tabooCards(contentMode: ContentMode): TabooCard[] {
    const seen = new Set<string>();
    const cards: TabooCard[] = [];
    for (const mode of this.modesInScope(contentMode)) {
      for (const pack of this.packsFor('taboo', mode)) {
        for (const entry of pack.entries as Array<{ word: string; forbidden: string[] }>) {
          const key = normalizeText(entry.word);
          if (!seen.has(key)) {
            seen.add(key);
            cards.push({ word: entry.word, forbidden: [...entry.forbidden] });
          }
        }
      }
    }
    return cards;
  }

  /**
   * Codenames : tire `count` MOTS DISTINCTS (normalisés) pour une grille, en
   * privilégiant les éléments jamais joués (anti-répétition intra-salon) puis
   * en recyclant si besoin. NO_CONTENT s'il n'existe pas assez de mots
   * distincts, tous packs actifs du mode confondus.
   */
  drawCodenamesGrid(
    count: number,
    contentMode: ContentMode,
    usedEntryIds: Set<string>,
    rng: Rng,
    randomWeight: number,
    teamName?: string,
  ): { words: string[]; recycled: boolean } | { error: 'NO_CONTENT' } {
    void teamName; // anti-répétition inter-rétros : par élément, non pertinente pour une grille entière
    interface Candidate {
      elementId: string;
      word: string;
      normalized: string;
      mode: PackMode;
    }
    const byMode = (mode: PackMode): Candidate[] =>
      this.indexElements('codenames', mode).map((e) => {
        const entry = this.packs.get(e.packId)!.pack.entries[e.index] as { word: string };
        return { elementId: e.elementId, word: entry.word, normalized: normalizeText(entry.word), mode };
      });
    const scope = this.modesInScope(contentMode).flatMap(byMode);
    // Dédoublonnage inter-packs par mot normalisé (un même mot dans deux packs = un seul candidat).
    const distinct = new Map<string, Candidate[]>();
    for (const c of scope) {
      distinct.set(c.normalized, [...(distinct.get(c.normalized) ?? []), c]);
    }
    if (distinct.size < count) return { error: 'NO_CONTENT' };

    // En Random, la pondération s'applique mot par mot quand les deux modes proposent le mot.
    const pool = [...distinct.values()].map((variants) => {
      if (variants.length === 1) return variants[0];
      const interne = variants.find((v) => v.mode === 'interne');
      const normal = variants.find((v) => v.mode === 'normal');
      if (!interne || !normal) return variants[0];
      return rng() < randomWeight ? interne : normal;
    });

    const fresh = shuffled(pool.filter((c) => !usedEntryIds.has(c.elementId)), rng);
    let recycled = false;
    let chosen = fresh.slice(0, count);
    if (chosen.length < count) {
      // Pool épuisé : on complète avec des mots déjà joués (re-mélange signalé).
      recycled = true;
      const used = shuffled(pool.filter((c) => usedEntryIds.has(c.elementId)), rng);
      const missing = count - chosen.length;
      chosen = [...chosen, ...used.slice(0, missing)];
      for (const c of used.slice(0, missing)) usedEntryIds.delete(c.elementId);
    }
    for (const c of chosen) usedEntryIds.add(c.elementId);
    return { words: shuffled(chosen.map((candidate) => candidate.word), rng), recycled };
  }

  /**
   * Tire un élément de contenu en respectant le mode (§3.5) et l'anti-répétition
   * intra-salon. Pool épuisé → re-mélange signalé (« contenu recyclé »).
   */
  private drawEntry<E>(
    game: GameId,
    contentMode: ContentMode,
    usedEntryIds: Set<string>,
    rng: Rng,
    randomWeight: number,
    teamName?: string,
  ): DrawnElement<E> | { error: 'NO_CONTENT' } {
    const byMode = (mode: PackMode) => this.indexElements(game, mode);
    let pool: IndexedElement[];
    if (contentMode === 'random') {
      const interne = byMode('interne');
      const normal = byMode('normal');
      if (interne.length === 0 && normal.length === 0) return { error: 'NO_CONTENT' };
      // Le mode s'applique au tirage de chaque élément : pondération 50/50 par défaut.
      if (interne.length === 0) pool = normal;
      else if (normal.length === 0) pool = interne;
      else pool = rng() < randomWeight ? interne : normal;
    } else {
      pool = byMode(contentMode);
      if (pool.length === 0) return { error: 'NO_CONTENT' };
    }

    let candidates = pool.filter((e) => !usedEntryIds.has(e.elementId));
    if (teamName) {
      const allowed = new Set(
        this.teamHistory.filterUnplayed(
          teamName,
          candidates.map((c) => c.elementId),
        ),
      );
      const filtered = candidates.filter((c) => allowed.has(c.elementId));
      if (filtered.length > 0) candidates = filtered;
    }

    let recycled = false;
    if (candidates.length === 0) {
      // Pack épuisé : on le signale et on recommence le cycle (re-mélange).
      for (const e of pool) usedEntryIds.delete(e.elementId);
      candidates = pool;
      recycled = true;
    }

    const chosen = candidates[Math.floor(rng() * candidates.length)];
    usedEntryIds.add(chosen.elementId);
    if (teamName) this.teamHistory.markPlayed(teamName, [chosen.elementId]);
    const pack = this.packs.get(chosen.packId)!.pack;
    const entry = pack.entries[chosen.index] as E;
    return { elementId: chosen.elementId, entry, recycled };
  }

  // ─── Administration (PRD §4.3) ────────────────────────────────────────────

  adminList(): AdminPackInfo[] {
    return [...this.packs.values()]
      .map((p) => ({
        id: p.pack.id,
        game: p.pack.game,
        mode: p.pack.mode,
        name: p.pack.name,
        author: p.pack.author,
        entriesCount: p.pack.entries.length,
        source: p.source,
        enabled: p.enabled,
        file: p.file,
      }))
      .sort((a, b) => a.game.localeCompare(b.game) || a.id.localeCompare(b.id));
  }

  /**
   * Upload d'un pack : validation Zod avec rapport lisible, écriture dans
   * `data/packs/<id>.json` (survit au redémarrage, jamais dans Git), rechargement.
   * Un id de pack `data` existant est REMPLACÉ (mise à jour) ; un id builtin
   * est protégé.
   */
  uploadPack(raw: unknown): AdminUploadResult {
    const result = validatePack(raw);
    if (!result.ok) return { ok: false, errors: result.errors };
    const existing = this.packs.get(result.pack.id);
    if (existing?.source === 'builtin') {
      return {
        ok: false,
        errors: [`L'id « ${result.pack.id} » est celui d'un pack intégré au code — choisis un autre id.`],
      };
    }
    const replaced = existing !== undefined;
    fs.mkdirSync(this.appConfig.dataPacksDir, { recursive: true });
    // L'id est validé ^[a-z0-9][a-z0-9-]*$ : sûr comme nom de fichier.
    const filePath = path.join(this.appConfig.dataPacksDir, `${result.pack.id}.json`);
    if (replaced && existing.file !== `${result.pack.id}.json`) {
      // L'ancien fichier portait un autre nom : on le retire pour éviter un doublon d'id.
      fs.rmSync(path.join(this.appConfig.dataPacksDir, existing.file), { force: true });
    }
    fs.writeFileSync(filePath, JSON.stringify(raw, null, 2));
    this.loadAll();
    this.logger.log(`Pack « ${result.pack.id} » ${replaced ? 'remplacé' : 'ajouté'} via /admin.`);
    return { ok: true, packId: result.pack.id, entriesCount: result.pack.entries.length, replaced };
  }

  setEnabled(id: string, enabled: boolean): { ok: true } | { ok: false; error: string } {
    const pack = this.packs.get(id);
    if (!pack) return { ok: false, error: `Pack « ${id} » introuvable.` };
    if (enabled) this.disabledIds.delete(id);
    else this.disabledIds.add(id);
    this.persistDisabledIds();
    pack.enabled = enabled;
    this.logger.log(`Pack « ${id} » ${enabled ? 'activé' : 'désactivé'}.`);
    return { ok: true };
  }

  deletePack(id: string): { ok: true } | { ok: false; error: string } {
    const pack = this.packs.get(id);
    if (!pack) return { ok: false, error: `Pack « ${id} » introuvable.` };
    if (pack.source !== 'data') {
      return { ok: false, error: 'Un pack intégré au code ne se supprime pas — désactive-le.' };
    }
    fs.rmSync(path.join(this.appConfig.dataPacksDir, pack.file), { force: true });
    this.disabledIds.delete(id);
    this.persistDisabledIds();
    this.loadAll();
    this.logger.log(`Pack « ${id} » supprimé via /admin.`);
    return { ok: true };
  }

  /** Template vide par jeu (Annexe A), prêt à remplir puis uploader. */
  templateFor(game: GameId): Record<string, unknown> {
    const envelope = {
      formatVersion: 1,
      id: `${game}-mon-equipe-01`,
      game,
      name: 'Nom lisible du pack',
      mode: 'interne',
      lang: 'fr',
      author: 'Mon équipe',
    };
    const entries: Record<GameId, unknown[]> = {
      undercover: [{ a: 'Premier mot', b: 'Mot très proche', difficulty: 1 }],
      wavelength: [{ left: 'Pôle gauche', right: 'Pôle droit' }],
      justone: [{ word: 'Mot à deviner', difficulty: 1 }],
      spyfall: [
        {
          category: 'Nom du thème',
          items: ['Item 1', 'Item 2', 'Item 3', 'Item 4', 'Item 5', 'Item 6', 'Item 7', 'Item 8'],
        },
      ],
      ito: [{ theme: 'Une échelle subjective' }],
      taboo: [{ word: 'Mot cible', forbidden: ['interdit 1', 'interdit 2', 'interdit 3'], difficulty: 1 }],
      codenames: [{ word: 'Mot de grille', difficulty: 1 }],
    };
    return { ...envelope, entries: entries[game] };
  }

  private indexElements(game: GameId, mode: PackMode): IndexedElement[] {
    const elements: IndexedElement[] = [];
    for (const pack of this.packsFor(game, mode)) {
      pack.entries.forEach((_, index) => {
        elements.push({ elementId: entryElementId(pack.id, index), packId: pack.id, mode, index });
      });
    }
    return elements;
  }
}
