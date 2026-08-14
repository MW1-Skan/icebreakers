/**
 * Lobby projeté : QR géant + code + joueurs qui arrivent, et dans la zone de
 * contrôle : choix du jeu, du mode de contenu et des paramètres (§3.1).
 */
import { Component, computed, effect, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import type {
  ClientView,
  ContentMode,
  ItoParams,
  JustOneParams,
  PlayerId,
  SpyfallParams,
  TabooParams,
  UndercoverParams,
  WavelengthParams,
} from '@icebreakers/shared';
import { SocketService } from '../../core/socket.service';
import { PlayersGridComponent } from '../../components/players-grid.component';
import { QrCodeComponent } from '../../components/qr-code.component';
import { RecapBannerComponent } from '../../components/recap-banner.component';

const UC_DEFAULTS: UndercoverParams = {
  undercoverCount: 1,
  mrWhite: false,
  discussSeconds: 60,
  voteSeconds: 45,
  whiteGuessSeconds: 30,
  publicVotes: false,
  manchesCount: 1,
  describePasses: 1,
};

const JO_DEFAULTS: JustOneParams = {
  manchesCount: 8,
  writeSeconds: 45,
  validateSeconds: 30,
  guessSeconds: 60,
  arbitrateSeconds: 30,
  softPenalty: false,
};

const WL_DEFAULTS: WavelengthParams = { manchesCount: 5, placeSeconds: 45, zoneWidth: 5 };
const ITO_DEFAULTS: ItoParams = { manchesCount: 3, livesCount: 3, rangeMax: 100, minGap: 8 };
const SF_DEFAULTS: SpyfallParams = {
  mancheSeconds: 360,
  manchesCount: 1,
  accusationVoteSeconds: 30,
  finalVoteSeconds: 45,
  spyGuessSeconds: 45,
};
const TB_DEFAULTS: TabooParams = { passageSeconds: 60, passesPerTeam: 2, hardPass: false };

const TEAM_LETTERS = ['A', 'B', 'C', 'D', 'E'];

type SelectableGame = 'undercover' | 'justone' | 'wavelength' | 'ito' | 'spyfall' | 'taboo';

const GAME_TABS: Array<{ id: SelectableGame; label: string; hint: string }> = [
  { id: 'undercover', label: '🕵️ Undercover', hint: '4–10 j' },
  { id: 'justone', label: '☝️ Just One', hint: '4–10 j · coop' },
  { id: 'wavelength', label: '🌊 Wavelength', hint: '3–10 j' },
  { id: 'ito', label: '🔢 Ito', hint: '3–10 j · coop' },
  { id: 'spyfall', label: '🔎 Spyfall', hint: '4–10 j' },
  { id: 'taboo', label: '⏱️ Taboo', hint: '4–10 j · binômes' },
];

@Component({
  selector: 'app-host-lobby',
  imports: [FormsModule, PlayersGridComponent, QrCodeComponent, RecapBannerComponent],
  template: `
    <div class="lobby">
      <section class="join-zone">
        <app-qr-code [text]="joinUrl()" [size]="260" />
        <div class="join-info">
          <div class="tv-huge code">{{ view().room.code }}</div>
          <div class="url">{{ joinUrl() }}</div>
          <p class="muted">Scannez pour rejoindre — prénom + avatar, et c'est parti.</p>
        </div>
      </section>

      <section>
        <h2>
          Joueurs
          <span class="count">{{ view().room.players.length }}</span>
          <span class="muted hint">(l'animateur ne joue pas)</span>
        </h2>
        @if (view().room.players.length === 0) {
          <p class="muted">Personne pour l'instant — la TV attend les premiers arrivants…</p>
        }
        <app-players-grid [players]="view().room.players" />
      </section>

      <app-recap-banner [recap]="view().room.recap" />

      <section class="card setup" aria-label="Configuration de la partie (animateur)">
        <div class="game-picker" role="tablist" aria-label="Choix du jeu">
          @for (tab of gameTabs; track tab.id) {
            <button
              role="tab"
              [attr.aria-selected]="selectedGame() === tab.id"
              [class.active]="selectedGame() === tab.id"
              (click)="setGame(tab.id)"
            >
              {{ tab.label }} <span class="muted">{{ tab.hint }}</span>
            </button>
          }
        </div>

        <div class="row">
          <label for="mode">Contenu</label>
          <select id="mode" name="mode" [ngModel]="selectedMode()" (ngModelChange)="setMode($event)">
            @for (m of view().room.availableModes; track m) {
              <option [value]="m">{{ modeLabel(m) }}</option>
            }
          </select>

          @if (selectedGame() === 'undercover') {
            <label for="manches">Manches</label>
            <select id="manches" name="manches" [ngModel]="ucParams().manchesCount" (ngModelChange)="patchUc({ manchesCount: +$event })">
              @for (n of [1, 2, 3, 4, 5]; track n) {
                <option [value]="n">{{ n }}</option>
              }
            </select>

            <label for="passes" title="Passes de description avant chaque vote">Tours de parole</label>
            <select id="passes" name="passes" [ngModel]="ucParams().describePasses" (ngModelChange)="patchUc({ describePasses: +$event })">
              @for (n of [1, 2, 3]; track n) {
                <option [value]="n">{{ n }}</option>
              }
            </select>

            <label for="uc">Undercover</label>
            <select id="uc" name="uc" [ngModel]="ucParams().undercoverCount" (ngModelChange)="patchUc({ undercoverCount: +$event })">
              @for (n of [1, 2, 3]; track n) {
                <option [value]="n">{{ n }}</option>
              }
            </select>

            <label for="white">Mr. White</label>
            <input id="white" name="white" type="checkbox" [ngModel]="ucParams().mrWhite" (ngModelChange)="patchUc({ mrWhite: $event })" />

            <label for="discuss">Discussion</label>
            <select id="discuss" name="discuss" [ngModel]="ucParams().discussSeconds" (ngModelChange)="patchUc({ discussSeconds: +$event })">
              @for (s of [30, 45, 60, 90, 120]; track s) {
                <option [value]="s">{{ s }} s</option>
              }
            </select>

            <label for="vote">Vote</label>
            <select id="vote" name="vote" [ngModel]="ucParams().voteSeconds" (ngModelChange)="patchUc({ voteSeconds: +$event })">
              @for (s of [30, 45, 60, 90]; track s) {
                <option [value]="s">{{ s }} s</option>
              }
            </select>

            <label for="pv">Votes publics</label>
            <input id="pv" name="pv" type="checkbox" [ngModel]="ucParams().publicVotes" (ngModelChange)="patchUc({ publicVotes: $event })" />
          } @else if (selectedGame() === 'wavelength') {
            <label for="wlmanches">Manches</label>
            <select id="wlmanches" name="wlmanches" [ngModel]="wlParams().manchesCount" (ngModelChange)="patchWl({ manchesCount: +$event })">
              @for (n of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]; track n) {
                <option [value]="n">{{ n }}</option>
              }
            </select>

            <label for="wlplace">Placement</label>
            <select id="wlplace" name="wlplace" [ngModel]="wlParams().placeSeconds" (ngModelChange)="patchWl({ placeSeconds: +$event })">
              @for (s of [30, 45, 60, 90]; track s) {
                <option [value]="s">{{ s }} s</option>
              }
            </select>

            <label for="wlzone" title="±w → 4 pts, ±2w → 3 pts, ±3w → 2 pts">Zones ±</label>
            <select id="wlzone" name="wlzone" [ngModel]="wlParams().zoneWidth" (ngModelChange)="patchWl({ zoneWidth: +$event })">
              @for (w of [3, 5, 8]; track w) {
                <option [value]="w">{{ w }}</option>
              }
            </select>
          } @else if (selectedGame() === 'ito') {
            <label for="itomanches">Manches</label>
            <select id="itomanches" name="itomanches" [ngModel]="itoParams().manchesCount" (ngModelChange)="patchIto({ manchesCount: +$event })">
              @for (n of [1, 2, 3, 4, 5]; track n) {
                <option [value]="n">{{ n }}</option>
              }
            </select>

            <label for="itolives">Vies</label>
            <select id="itolives" name="itolives" [ngModel]="itoParams().livesCount" (ngModelChange)="patchIto({ livesCount: +$event })">
              @for (n of [1, 2, 3, 4, 5]; track n) {
                <option [value]="n">{{ n }}</option>
              }
            </select>

            <label for="itorange">Plage</label>
            <select id="itorange" name="itorange" [ngModel]="itoParams().rangeMax" (ngModelChange)="patchIto({ rangeMax: +$event })">
              @for (r of [50, 100]; track r) {
                <option [value]="r">1–{{ r }}</option>
              }
            </select>

            <label for="itogap" title="Écart minimal garanti entre deux nombres">Écart min</label>
            <select id="itogap" name="itogap" [ngModel]="itoParams().minGap" (ngModelChange)="patchIto({ minGap: +$event })">
              @for (gap of [4, 6, 8, 10, 12]; track gap) {
                <option [value]="gap">{{ gap }}</option>
              }
            </select>
          } @else if (selectedGame() === 'spyfall') {
            <label for="sfmanche">Durée de manche</label>
            <select id="sfmanche" name="sfmanche" [ngModel]="sfParams().mancheSeconds" (ngModelChange)="patchSf({ mancheSeconds: +$event })">
              @for (s of [240, 300, 360, 480, 600]; track s) {
                <option [value]="s">{{ s / 60 }} min</option>
              }
            </select>

            <label for="sfcount">Manches</label>
            <select id="sfcount" name="sfcount" [ngModel]="sfParams().manchesCount" (ngModelChange)="patchSf({ manchesCount: +$event })">
              @for (n of [1, 2, 3]; track n) {
                <option [value]="n">{{ n }}</option>
              }
            </select>
          } @else if (selectedGame() === 'taboo') {
            <label for="tbpassage">Passage</label>
            <select id="tbpassage" name="tbpassage" [ngModel]="tbParams().passageSeconds" (ngModelChange)="patchTb({ passageSeconds: +$event })">
              @for (s of [45, 60, 90]; track s) {
                <option [value]="s">{{ s }} s</option>
              }
            </select>

            <label for="tbpasses">Passages/binôme</label>
            <select id="tbpasses" name="tbpasses" [ngModel]="tbParams().passesPerTeam" (ngModelChange)="patchTb({ passesPerTeam: +$event })">
              @for (n of [1, 2, 3]; track n) {
                <option [value]="n">{{ n }}</option>
              }
            </select>

            <label for="tbhard" title="La passe coûte −1">Mode dur</label>
            <input id="tbhard" name="tbhard" type="checkbox" [ngModel]="tbParams().hardPass" (ngModelChange)="patchTb({ hardPass: $event })" />
          } @else {
            <label for="jomanches">Manches</label>
            <select id="jomanches" name="jomanches" [ngModel]="joParams().manchesCount" (ngModelChange)="patchJo({ manchesCount: +$event })">
              @for (n of [5, 6, 7, 8, 9, 10, 11, 12, 13]; track n) {
                <option [value]="n">{{ n }}</option>
              }
            </select>

            <label for="write">Écriture</label>
            <select id="write" name="write" [ngModel]="joParams().writeSeconds" (ngModelChange)="patchJo({ writeSeconds: +$event })">
              @for (s of [30, 45, 60, 90]; track s) {
                <option [value]="s">{{ s }} s</option>
              }
            </select>

            <label for="guess">Devinette</label>
            <select id="guess" name="guess" [ngModel]="joParams().guessSeconds" (ngModelChange)="patchJo({ guessSeconds: +$event })">
              @for (s of [45, 60, 90, 120]; track s) {
                <option [value]="s">{{ s }} s</option>
              }
            </select>

            <label for="soft" title="Mauvaise réponse : 0 au lieu de −1">Mode doux</label>
            <input id="soft" name="soft" type="checkbox" [ngModel]="joParams().softPenalty" (ngModelChange)="patchJo({ softPenalty: $event })" />
          }
        </div>

        @if (selectedGame() === 'taboo' && view().room.players.length >= 4) {
          <div class="teams-editor">
            <span class="muted">Binômes :</span>
            <button (click)="clearTeams()" [class.active]="!manualTeams()">🎲 Aléatoires au lancement</button>
            <button (click)="startManualTeams()" [class.active]="manualTeams()">✍️ Composer</button>
            @if (manualTeams()) {
              @for (p of view().room.players; track p.id) {
                <span class="team-assign">
                  {{ p.avatar }} {{ p.name }}
                  <select [ngModel]="teamOf(p.id)" (ngModelChange)="assignTeam(p.id, $event)" [name]="'team-' + p.id">
                    @for (letter of teamLetters; track letter) {
                      <option [value]="letter">Éq. {{ letter }}</option>
                    }
                  </select>
                </span>
              }
              @if (teamsHint(); as hint) {
                <span class="blocker">{{ hint }}</span>
              }
            }
          </div>
        }

        <div class="start-row">
          <button class="primary start" (click)="start()" [disabled]="!controls()?.canStart">
            Lancer la partie
          </button>
          @for (blocker of controls()?.startBlockers ?? []; track blocker) {
            <span class="blocker">{{ blocker }}</span>
          }
        </div>
      </section>
    </div>
  `,
  styles: [
    `
      .lobby {
        display: flex;
        flex-direction: column;
        gap: 1.6rem;
      }
      .join-zone {
        display: flex;
        gap: 2rem;
        align-items: center;
        flex-wrap: wrap;
        justify-content: center;
        padding: 1rem;
      }
      .code {
        color: var(--accent);
      }
      .url {
        font-size: 1.3rem;
        font-weight: 600;
      }
      .count {
        display: inline-block;
        min-width: 1.6em;
        text-align: center;
        background: var(--accent);
        color: var(--accent-fg);
        border-radius: 999px;
        font-size: 0.8em;
        margin-left: 0.3em;
      }
      .hint {
        font-size: 0.75em;
        font-weight: 400;
      }
      .game-picker {
        display: flex;
        gap: 0.6rem;
        margin-bottom: 1rem;
        flex-wrap: wrap;
      }
      .game-picker button {
        font-size: 1.15rem;
        font-weight: 700;
      }
      .game-picker button.active {
        border-color: var(--accent);
        background: #2b2a1a;
      }
      .setup .row {
        display: flex;
        flex-wrap: wrap;
        gap: 0.6rem 1rem;
        align-items: center;
      }
      .setup label {
        font-weight: 600;
        color: var(--fg-muted);
      }
      .teams-editor {
        display: flex;
        align-items: center;
        gap: 0.6rem;
        flex-wrap: wrap;
        margin-top: 0.8rem;
      }
      .teams-editor button.active {
        border-color: var(--accent);
        background: #2b2a1a;
      }
      .team-assign {
        display: inline-flex;
        align-items: center;
        gap: 0.35rem;
        border: 1px solid var(--border);
        border-radius: 999px;
        padding: 0.2rem 0.6rem;
      }
      .start-row {
        margin-top: 1rem;
        display: flex;
        align-items: center;
        gap: 1rem;
        flex-wrap: wrap;
      }
      .start {
        font-size: 1.2rem;
      }
      .blocker {
        color: var(--danger);
      }
    `,
  ],
})
export class HostLobbyComponent {
  private readonly socket = inject(SocketService);
  readonly view = input.required<ClientView>();

  readonly controls = computed(() => this.view().hostControls);
  readonly selectedGame = computed(() => this.view().room.selection?.game ?? 'undercover');
  readonly selectedMode = computed<ContentMode>(
    () => this.view().room.selection?.contentMode ?? this.view().room.availableModes[0] ?? 'normal',
  );
  readonly joinUrl = computed(() => `${location.origin}/join/${this.view().room.code}`);

  readonly ucParams = computed<UndercoverParams>(() => {
    const selection = this.view().room.selection;
    return selection?.game === 'undercover' ? selection.params : UC_DEFAULTS;
  });

  readonly joParams = computed<JustOneParams>(() => {
    const selection = this.view().room.selection;
    return selection?.game === 'justone' ? selection.params : JO_DEFAULTS;
  });

  readonly wlParams = computed<WavelengthParams>(() => {
    const selection = this.view().room.selection;
    return selection?.game === 'wavelength' ? selection.params : WL_DEFAULTS;
  });

  readonly itoParams = computed<ItoParams>(() => {
    const selection = this.view().room.selection;
    return selection?.game === 'ito' ? selection.params : ITO_DEFAULTS;
  });

  readonly sfParams = computed<SpyfallParams>(() => {
    const selection = this.view().room.selection;
    return selection?.game === 'spyfall' ? selection.params : SF_DEFAULTS;
  });

  readonly tbParams = computed<TabooParams>(() => {
    const selection = this.view().room.selection;
    return selection?.game === 'taboo' ? selection.params : TB_DEFAULTS;
  });

  readonly gameTabs = GAME_TABS;
  readonly teamLetters = TEAM_LETTERS;
  /** Éditeur de binômes Taboo : lettre d'équipe par joueur (vide = aléatoire). */
  readonly teamAssignments = signal<Record<PlayerId, string>>({});
  readonly manualTeams = computed(() => Object.keys(this.teamAssignments()).length > 0);

  constructor() {
    // Auto-sélection du premier jeu à l'arrivée au lobby.
    let autoSelected = false;
    effect(() => {
      const v = this.view();
      if (!autoSelected && !v.room.selection && v.room.availableModes.length > 0) {
        autoSelected = true;
        void this.socket.selectGame('undercover', this.selectedMode(), {});
      }
    });
  }

  modeLabel(mode: ContentMode): string {
    if (mode === 'interne') return this.view().room.config.internalModeLabel;
    if (mode === 'normal') return 'Normal';
    return 'Random (mélange)';
  }

  setGame(game: SelectableGame): void {
    if (game === this.selectedGame()) return;
    // Changement de jeu : repartir des défauts (surcharges remises à zéro).
    void this.socket.selectGame(game, this.selectedMode(), {});
  }

  setMode(mode: ContentMode): void {
    void this.socket.selectGame(this.selectedGame(), mode, this.currentOverrides());
  }

  patchUc(change: Partial<UndercoverParams>): void {
    void this.socket.selectGame('undercover', this.selectedMode(), { ...this.ucOverrides(), ...change });
  }

  patchJo(change: Partial<JustOneParams>): void {
    void this.socket.selectGame('justone', this.selectedMode(), { ...this.joOverrides(), ...change });
  }

  patchWl(change: Partial<WavelengthParams>): void {
    void this.socket.selectGame('wavelength', this.selectedMode(), { ...this.wlOverrides(), ...change });
  }

  patchIto(change: Partial<ItoParams>): void {
    void this.socket.selectGame('ito', this.selectedMode(), { ...this.itoOverrides(), ...change });
  }

  private currentOverrides():
    | Partial<UndercoverParams>
    | Partial<JustOneParams>
    | Partial<WavelengthParams>
    | Partial<ItoParams>
    | Partial<SpyfallParams>
    | Partial<TabooParams> {
    switch (this.selectedGame()) {
      case 'undercover':
        return this.ucOverrides();
      case 'justone':
        return this.joOverrides();
      case 'wavelength':
        return this.wlOverrides();
      case 'ito':
        return this.itoOverrides();
      case 'spyfall':
        return this.sfOverrides();
      case 'taboo':
        return this.tbOverrides();
      default:
        return {};
    }
  }

  private wlOverrides(): Partial<WavelengthParams> {
    const p = this.wlParams();
    return { manchesCount: p.manchesCount, placeSeconds: p.placeSeconds, zoneWidth: p.zoneWidth };
  }

  private itoOverrides(): Partial<ItoParams> {
    const p = this.itoParams();
    return { manchesCount: p.manchesCount, livesCount: p.livesCount, rangeMax: p.rangeMax, minGap: p.minGap };
  }

  patchSf(change: Partial<SpyfallParams>): void {
    void this.socket.selectGame('spyfall', this.selectedMode(), { ...this.sfOverrides(), ...change });
  }

  patchTb(change: Partial<TabooParams>): void {
    void this.socket.selectGame('taboo', this.selectedMode(), { ...this.tbOverrides(), ...change });
  }

  private sfOverrides(): Partial<SpyfallParams> {
    const p = this.sfParams();
    return { mancheSeconds: p.mancheSeconds, manchesCount: p.manchesCount };
  }

  private tbOverrides(): Partial<TabooParams> {
    const p = this.tbParams();
    const base: Partial<TabooParams> = {
      passageSeconds: p.passageSeconds,
      passesPerTeam: p.passesPerTeam,
      hardPass: p.hardPass,
    };
    const teams = this.buildTeams();
    if (teams) base.teams = teams;
    return base;
  }

  // ─── Éditeur de binômes Taboo ─────────────────────────────────────────────

  teamOf(playerId: string): string {
    return this.teamAssignments()[playerId] ?? 'A';
  }

  assignTeam(playerId: string, letter: string): void {
    this.teamAssignments.set({ ...this.teamAssignments(), [playerId]: letter });
    this.patchTb({});
  }

  startManualTeams(): void {
    // Pré-remplissage : paires dans l'ordre d'arrivée (A, A, B, B, …).
    const assignments: Record<string, string> = {};
    this.view().room.players.forEach((p, i) => {
      assignments[p.id] = TEAM_LETTERS[Math.floor(i / 2)] ?? 'E';
    });
    this.teamAssignments.set(assignments);
    this.patchTb({});
  }

  clearTeams(): void {
    this.teamAssignments.set({});
    this.patchTb({});
  }

  /** Groupes d'équipes valides à envoyer, ou undefined (= aléatoire côté serveur). */
  private buildTeams(): PlayerId[][] | undefined {
    const assignments = this.teamAssignments();
    if (Object.keys(assignments).length === 0) return undefined;
    const groups = new Map<string, PlayerId[]>();
    for (const p of this.view().room.players) {
      const letter = assignments[p.id] ?? 'A';
      groups.set(letter, [...(groups.get(letter) ?? []), p.id]);
    }
    const teams = [...groups.values()];
    return teams.every((t) => t.length >= 2 && t.length <= 3) ? teams : undefined;
  }

  teamsHint(): string | undefined {
    if (!this.manualTeams()) return undefined;
    return this.buildTeams()
      ? undefined
      : 'Chaque équipe doit avoir 2 joueurs (3 pour un seul trio si effectif impair) — sinon tirage aléatoire.';
  }

  /** Les valeurs affichées deviennent les surcharges explicites du host. */
  private ucOverrides(): Partial<UndercoverParams> {
    const p = this.ucParams();
    return {
      undercoverCount: p.undercoverCount,
      mrWhite: p.mrWhite,
      discussSeconds: p.discussSeconds,
      voteSeconds: p.voteSeconds,
      publicVotes: p.publicVotes,
      manchesCount: p.manchesCount,
      describePasses: p.describePasses,
    };
  }

  private joOverrides(): Partial<JustOneParams> {
    const p = this.joParams();
    return {
      manchesCount: p.manchesCount,
      writeSeconds: p.writeSeconds,
      guessSeconds: p.guessSeconds,
      softPenalty: p.softPenalty,
    };
  }

  start(): void {
    void this.socket.start();
  }
}
