/**
 * Lobby projeté : QR géant + code + joueurs qui arrivent, et dans la zone de
 * contrôle : choix du jeu, du mode de contenu et des paramètres (§3.1).
 */
import { Component, computed, effect, inject, input } from '@angular/core';
import { FormsModule } from '@angular/forms';
import type { ClientView, ContentMode, JustOneParams, UndercoverParams } from '@icebreakers/shared';
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
          <button
            role="tab"
            [attr.aria-selected]="selectedGame() === 'undercover'"
            [class.active]="selectedGame() === 'undercover'"
            (click)="setGame('undercover')"
          >
            🕵️ Undercover <span class="muted">4–10 j</span>
          </button>
          <button
            role="tab"
            [attr.aria-selected]="selectedGame() === 'justone'"
            [class.active]="selectedGame() === 'justone'"
            (click)="setGame('justone')"
          >
            ☝️ Just One <span class="muted">4–10 j · coop</span>
          </button>
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

  setGame(game: 'undercover' | 'justone'): void {
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

  private currentOverrides(): Partial<UndercoverParams> | Partial<JustOneParams> {
    return this.selectedGame() === 'undercover' ? this.ucOverrides() : this.joOverrides();
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
