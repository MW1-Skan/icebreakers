/**
 * Chargeur de packs (PRD §4) : lit `packs/builtin/` (committés, mode normal)
 * ET `data/packs/` (uploadés à chaud, gitignorés) dès maintenant — la page
 * /admin viendra plus tard. Un pack invalide est rejeté au chargement avec un
 * rapport lisible, jamais de crash.
 */
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { entryElementId, normalizeText, validatePack } from '../shared';
import type {
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
  private packs = new Map<string, Pack>(); // par id
  readonly loadReport: LoadReportEntry[] = [];

  constructor(
    private readonly appConfig: AppConfigService,
    private readonly teamHistory: NoopTeamHistoryStore,
  ) {}

  onModuleInit(): void {
    this.loadAll();
  }

  loadAll(): void {
    this.packs.clear();
    this.loadReport.length = 0;
    for (const dir of [this.appConfig.builtinPacksDir, this.appConfig.dataPacksDir]) {
      this.loadDir(dir);
    }
    const loaded = [...this.packs.values()];
    this.logger.log(
      `${loaded.length} pack(s) chargé(s) : ${loaded.map((p) => `${p.id} (${p.game}/${p.mode}, ${p.entries.length} entrées)`).join(', ') || 'aucun'}`,
    );
    for (const report of this.loadReport.filter((r) => !r.ok)) {
      this.logger.warn(`Pack rejeté « ${report.file} » :\n  - ${report.errors.join('\n  - ')}`);
    }
  }

  private loadDir(dir: string): void {
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
      this.packs.set(result.pack.id, result.pack);
      this.loadReport.push({ file, packId: result.pack.id, ok: true, errors: [] });
    }
  }

  packsFor(game: GameId, mode?: PackMode): Pack[] {
    return [...this.packs.values()].filter((p) => p.game === game && (mode === undefined || p.mode === mode));
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
    const pack = this.packs.get(chosen.packId)!;
    const entry = pack.entries[chosen.index] as E;
    return { elementId: chosen.elementId, entry, recycled };
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
