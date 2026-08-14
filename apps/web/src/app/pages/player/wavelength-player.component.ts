/**
 * Wavelength — écrans joueur (fiche 5.2) : télépathe (cible 🔒 + saisie
 * d'indice, puis motus), placeur (curseur secret 0–100, modifiable).
 */
import { Component, computed, effect, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import type { ClientView, WavelengthMeView, WavelengthPublicView } from '@icebreakers/shared';
import { SocketService } from '../../core/socket.service';
import { TimerBadgeComponent } from '../../components/timer-badge.component';
import { WavelengthDialComponent } from '../../components/wavelength-dial.component';

@Component({
  selector: 'app-wavelength-player',
  imports: [FormsModule, TimerBadgeComponent, WavelengthDialComponent],
  template: `
    @if (game(); as g) {
      @if (me(); as m) {
        @if (!m.inGame) {
          <div class="card center-card">
            <h2>Partie en cours 🍿</h2>
            <p class="muted">Tu joueras la prochaine — regarde la TV en attendant.</p>
          </div>
        } @else {
          <div class="stack">
            <div class="role-banner" [class.telepath]="m.isTelepath">
              @if (m.isTelepath) {
                🧠 Tu es le télépathe
              } @else {
                🎯 Place ta cible
              }
              <span class="muted manche">Manche {{ g.mancheNumber }}/{{ g.manchesPlanned }}</span>
            </div>

            @switch (g.phase) {
              @case ('clue') {
                @if (m.isTelepath) {
                  <section class="card">
                    <p class="muted small">🔒 Ta cible (personne d'autre ne la voit) :</p>
                    <app-wavelength-dial
                      [left]="g.axis.left"
                      [right]="g.axis.right"
                      [target]="m.target"
                      [zoneWidth]="g.zoneWidth"
                    />
                    <div class="target-value">{{ m.target }}</div>
                    <form (ngSubmit)="submitClue()">
                      <input
                        name="clue"
                        [(ngModel)]="clueInput"
                        maxlength="60"
                        autocomplete="off"
                        placeholder="Un mot ou une courte expression…"
                        aria-label="Ton indice"
                      />
                      <button class="primary" type="submit" [disabled]="clueInput.trim().length === 0">Envoyer</button>
                    </form>
                    @if (clueError(); as err) {
                      <p class="error" role="alert">{{ err }}</p>
                    }
                    <p class="muted small">Règles : pas de nombre, pas les mots des pôles.</p>
                  </section>
                } @else {
                  <div class="card center-card">
                    <app-wavelength-dial [left]="g.axis.left" [right]="g.axis.right" />
                    <p class="muted">Le télépathe cherche son indice…</p>
                  </div>
                }
              }
              @case ('place') {
                @if (m.isTelepath) {
                  <section class="card center-card">
                    <p>🤐 <strong>Motus !</strong> Tu restes muet jusqu'à la révélation.</p>
                    <p class="muted small">Rappel de ta cible : <strong>{{ m.target }}</strong></p>
                    <div class="row-center"><app-timer-badge [timer]="view().room.timers[0]" /></div>
                  </section>
                } @else {
                  <section class="card">
                    <div class="clue-banner">« {{ g.clue }} »</div>
                    <app-wavelength-dial [left]="g.axis.left" [right]="g.axis.right" />
                    <div class="slider-row">
                      <input
                        type="range"
                        name="cursor"
                        min="0"
                        max="100"
                        [(ngModel)]="cursorValue"
                        aria-label="Ton curseur 0 à 100"
                      />
                      <span class="cursor-value">{{ cursorValue }}</span>
                    </div>
                    <div class="actions">
                      <button class="primary" (click)="place()">
                        {{ m.hasPlaced ? 'Déplacer ici' : 'Placer ma cible ici' }}
                      </button>
                      @if (m.hasPlaced) {
                        <span class="muted small">Placée à {{ m.myPlacement }} — modifiable jusqu'à la clôture. Personne ne la voit.</span>
                      }
                      <app-timer-badge [timer]="view().room.timers[0]" />
                    </div>
                  </section>
                }
              }
              @case ('reveal') {
                <section class="card center-card">
                  @if (myRevealLine(); as line) {
                    <div class="my-points">{{ line }}</div>
                  }
                  <p class="muted">Le détail est sur la TV 📺 — discussion libre !</p>
                </section>
              }
              @case ('aborted') {
                <div class="card center-card"><p>Manche annulée — regarde la TV.</p></div>
              }
              @case ('end') {
                <section class="card center-card">
                  <div class="my-points big">{{ myTotal() }} pts</div>
                  <p class="muted">Classement final et récap des indices sur la TV 📺</p>
                </section>
              }
            }
          </div>
        }
      }
    }
  `,
  styles: [
    `
      .stack {
        display: flex;
        flex-direction: column;
        gap: 1rem;
      }
      .center-card {
        text-align: center;
      }
      .role-banner {
        display: flex;
        align-items: baseline;
        gap: 0.8rem;
        font-size: 1.25rem;
        font-weight: 700;
      }
      .role-banner.telepath {
        color: var(--accent);
      }
      .role-banner .manche {
        font-size: 0.9rem;
        font-weight: 400;
        margin-left: auto;
      }
      .small {
        font-size: 0.85rem;
      }
      .target-value {
        text-align: center;
        font-size: 2.2rem;
        font-weight: 900;
        color: var(--accent);
      }
      form {
        display: flex;
        gap: 0.6rem;
        margin: 0.7rem 0 0.3rem;
      }
      form input {
        flex: 1;
      }
      .error {
        color: var(--danger);
      }
      .clue-banner {
        text-align: center;
        font-size: 1.5rem;
        font-weight: 800;
        color: var(--info);
        margin-bottom: 0.4rem;
      }
      .slider-row {
        display: flex;
        align-items: center;
        gap: 1rem;
        margin: 0.8rem 0;
      }
      .slider-row input[type='range'] {
        flex: 1;
        accent-color: var(--accent);
        height: 2.2rem;
      }
      .cursor-value {
        font-size: 1.8rem;
        font-weight: 900;
        min-width: 2.2em;
        text-align: center;
        font-variant-numeric: tabular-nums;
      }
      .actions {
        display: flex;
        gap: 0.8rem;
        align-items: center;
        flex-wrap: wrap;
      }
      .my-points {
        font-size: 1.6rem;
        font-weight: 900;
        color: var(--ok);
      }
      .my-points.big {
        font-size: 2.4rem;
        color: var(--accent);
      }
      .row-center {
        display: flex;
        justify-content: center;
      }
    `,
  ],
})
export class WavelengthPlayerComponent {
  private readonly socket = inject(SocketService);
  readonly view = input.required<ClientView>();

  clueInput = '';
  cursorValue = 50;
  readonly clueError = signal<string | null>(null);

  readonly game = computed<WavelengthPublicView | undefined>(() => {
    const g = this.view().room.game;
    return g?.kind === 'wavelength' ? g : undefined;
  });
  readonly me = computed<WavelengthMeView | undefined>(() => this.view().me?.game?.wavelength);

  constructor() {
    let lastManche: number | undefined;
    effect(() => {
      const manche = this.game()?.mancheNumber;
      if (manche !== lastManche) {
        lastManche = manche;
        this.clueInput = '';
        this.cursorValue = 50;
        this.clueError.set(null);
      }
    });
  }

  async submitClue(): Promise<void> {
    const text = this.clueInput.trim();
    if (!text) return;
    this.clueError.set(null);
    const ack = await this.socket.gameAction({ type: 'clue', text });
    if (!ack.ok) this.clueError.set(ack.error.message);
  }

  place(): void {
    void this.socket.gameAction({ type: 'placeSlider', value: Number(this.cursorValue) });
  }

  myRevealLine(): string | undefined {
    const g = this.game();
    const myId = this.view().me?.playerId;
    if (!g?.lastResult || !myId) return undefined;
    if (g.lastResult.telepathId === myId) return `Ton indice rapporte +${g.lastResult.telepathPoints} pts 🧠`;
    const mine = g.lastResult.results.find((r) => r.playerId === myId);
    if (!mine) return 'Pas de curseur cette manche (0 pt)';
    return `Ta cible : ${mine.value} → +${mine.points} pt${mine.points > 1 ? 's' : ''}`;
  }

  myTotal(): number {
    const myId = this.view().me?.playerId;
    return this.game()?.totals.find((t) => t.playerId === myId)?.points ?? 0;
  }
}
