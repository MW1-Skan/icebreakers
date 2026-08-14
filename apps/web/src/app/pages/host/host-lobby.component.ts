/**
 * Lobby projeté : QR géant + code + joueurs qui arrivent, et dans la zone de
 * contrôle : choix du jeu/mode/paramètres + lancement (fiche 5.1 + §3.1).
 */
import { Component, computed, effect, inject, input } from '@angular/core';
import { FormsModule } from '@angular/forms';
import type { ClientView, ContentMode, UndercoverParams } from '@icebreakers/shared';
import { SocketService } from '../../core/socket.service';
import { PlayersGridComponent } from '../../components/players-grid.component';
import { QrCodeComponent } from '../../components/qr-code.component';
import { RecapBannerComponent } from '../../components/recap-banner.component';

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
        <h2>Undercover 🕵️ <span class="tag">4–10 joueurs</span></h2>
        <div class="row">
          <label for="mode">Contenu</label>
          <select id="mode" name="mode" [ngModel]="selectedMode()" (ngModelChange)="setMode($event)">
            @for (m of view().room.availableModes; track m) {
              <option [value]="m">{{ modeLabel(m) }}</option>
            }
          </select>

          <label for="uc">Undercover</label>
          <select id="uc" name="uc" [ngModel]="params().undercoverCount" (ngModelChange)="patch({ undercoverCount: +$event })">
            @for (n of [1, 2, 3]; track n) {
              <option [value]="n">{{ n }}</option>
            }
          </select>

          <label for="white">Mr. White</label>
          <input
            id="white"
            name="white"
            type="checkbox"
            [ngModel]="params().mrWhite"
            (ngModelChange)="patch({ mrWhite: $event })"
          />

          <label for="discuss">Discussion</label>
          <select id="discuss" name="discuss" [ngModel]="params().discussSeconds" (ngModelChange)="patch({ discussSeconds: +$event })">
            @for (s of [30, 45, 60, 90, 120]; track s) {
              <option [value]="s">{{ s }} s</option>
            }
          </select>

          <label for="vote">Vote</label>
          <select id="vote" name="vote" [ngModel]="params().voteSeconds" (ngModelChange)="patch({ voteSeconds: +$event })">
            @for (s of [30, 45, 60, 90]; track s) {
              <option [value]="s">{{ s }} s</option>
            }
          </select>

          <label for="pv">Votes publics</label>
          <input
            id="pv"
            name="pv"
            type="checkbox"
            [ngModel]="params().publicVotes"
            (ngModelChange)="patch({ publicVotes: $event })"
          />
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
  readonly params = computed(() => {
    const selection = this.view().room.selection;
    return (
      selection?.params ?? {
        undercoverCount: 1,
        mrWhite: false,
        discussSeconds: 60,
        voteSeconds: 45,
        whiteGuessSeconds: 30,
        publicVotes: false,
      }
    );
  });
  readonly selectedMode = computed<ContentMode>(
    () => this.view().room.selection?.contentMode ?? this.view().room.availableModes[0] ?? 'normal',
  );
  readonly joinUrl = computed(() => `${location.origin}/join/${this.view().room.code}`);

  constructor() {
    // Auto-sélection d'Undercover à l'arrivée au lobby (seul jeu de l'étape 1).
    let autoSelected = false;
    effect(() => {
      const v = this.view();
      if (!autoSelected && !v.room.selection && v.room.availableModes.length > 0) {
        autoSelected = true;
        void this.socket.selectGame(this.selectedMode(), {});
      }
    });
  }

  modeLabel(mode: ContentMode): string {
    if (mode === 'interne') return this.view().room.config.internalModeLabel;
    if (mode === 'normal') return 'Normal';
    return 'Random (mélange)';
  }

  setMode(mode: ContentMode): void {
    void this.socket.selectGame(mode, this.overridesFromCurrent());
  }

  patch(change: Partial<UndercoverParams>): void {
    void this.socket.selectGame(this.selectedMode(), { ...this.overridesFromCurrent(), ...change });
  }

  /** Les valeurs affichées deviennent les surcharges explicites du host. */
  private overridesFromCurrent(): Partial<UndercoverParams> {
    const p = this.params();
    return {
      undercoverCount: p.undercoverCount,
      mrWhite: p.mrWhite,
      discussSeconds: p.discussSeconds,
      voteSeconds: p.voteSeconds,
      publicVotes: p.publicVotes,
    };
  }

  start(): void {
    void this.socket.start();
  }
}
