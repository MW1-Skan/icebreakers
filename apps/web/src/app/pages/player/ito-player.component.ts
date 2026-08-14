/**
 * Ito — écran joueur (fiche 5.5) : son nombre 🔒 en grand + « Je pose » avec
 * double confirmation (anti-mispose) ; posé/défaussé → spectateur.
 */
import { Component, computed, effect, inject, input, signal } from '@angular/core';
import type { ClientView, ItoMeView, ItoPublicView } from '@icebreakers/shared';
import { SocketService } from '../../core/socket.service';

@Component({
  selector: 'app-ito-player',
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
            <div class="role-banner">
              🔢 Manche {{ g.mancheIndex }}/{{ g.manchesTotal }}
              <span class="lives">
                @for (i of livesArray(); track $index) {
                  <span>{{ $index < g.lives ? '❤️' : '🖤' }}</span>
                }
              </span>
            </div>

            @switch (g.phase) {
              @case ('play') {
                <div class="card theme-card">
                  <div class="muted small">Thème</div>
                  <div class="theme">{{ g.theme }}</div>
                  <div class="muted small">1 = le moins · 100 = le plus</div>
                </div>

                @if (m.holding) {
                  <section class="card number-card">
                    <div class="muted small">🔒 Ton nombre :</div>
                    <div class="number">{{ m.myNumber }}</div>
                    <p class="muted small">Décris-le à travers le thème, à voix haute — sans jamais le dire !</p>
                    @if (!confirming()) {
                      <button class="primary pose" (click)="askConfirm()">Je pose ma carte</button>
                    } @else {
                      <div class="confirm-row">
                        <button class="primary pose confirm" (click)="confirmPose()">✓ Confirmer : j'ai le plus petit</button>
                        <button (click)="confirming.set(false)">Annuler</button>
                      </div>
                    }
                    <p class="muted small">Pose = révélation immédiate, pas d'annulation possible.</p>
                  </section>
                } @else {
                  <section class="card center-card">
                    @if (myFate(); as fate) {
                      <div class="fate" [attr.data-kind]="fate.kind">{{ fateLine(fate.kind) }}</div>
                      <div class="my-number-out">{{ fate.number }}</div>
                    }
                    <p class="muted">Tu regardes la suite sur la TV 📺</p>
                  </section>
                }
              }
              @case ('mancheEnd') {
                <section class="card center-card">
                  <p>Manche terminée ! La frise complète est sur la TV 📺</p>
                </section>
              }
              @case ('end') {
                <section class="card center-card">
                  <div class="lives big">
                    @for (i of livesArray(); track $index) {
                      <span>{{ $index < g.lives ? '❤️' : '🖤' }}</span>
                    }
                  </div>
                  <div class="verdict" [class.win]="g.verdict?.victory" [class.lose]="!g.verdict?.victory">
                    {{ g.verdict?.label }}
                  </div>
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
        font-size: 1.2rem;
        font-weight: 700;
      }
      .lives {
        margin-left: auto;
        letter-spacing: 0.1em;
      }
      .lives.big {
        font-size: 2rem;
        margin: 0;
      }
      .small {
        font-size: 0.85rem;
      }
      .theme-card {
        text-align: center;
      }
      .theme {
        font-size: 1.5rem;
        font-weight: 800;
        color: var(--accent);
      }
      .number-card {
        text-align: center;
      }
      .number {
        font-size: clamp(3.5rem, 18vw, 6rem);
        font-weight: 900;
        font-variant-numeric: tabular-nums;
        line-height: 1.1;
      }
      .pose {
        font-size: 1.25rem;
        width: 100%;
        padding: 0.9em;
        margin-top: 0.5rem;
      }
      .pose.confirm {
        background: var(--danger);
        border-color: var(--danger);
        color: white;
      }
      .confirm-row {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
        margin-top: 0.5rem;
      }
      .fate {
        font-size: 1.3rem;
        font-weight: 800;
      }
      .fate[data-kind='posed'] {
        color: var(--ok);
      }
      .fate[data-kind='error'],
      .fate[data-kind='discarded'] {
        color: var(--danger);
      }
      .my-number-out {
        font-size: 2.6rem;
        font-weight: 900;
      }
      .verdict {
        font-size: 2rem;
        font-weight: 900;
      }
      .win {
        color: var(--ok);
      }
      .lose {
        color: var(--danger);
      }
    `,
  ],
})
export class ItoPlayerComponent {
  private readonly socket = inject(SocketService);
  readonly view = input.required<ClientView>();

  /** « Je pose » demande une confirmation (anti-mispose, fiche 5.5). */
  readonly confirming = signal(false);
  private confirmTimeout?: ReturnType<typeof setTimeout>;

  readonly game = computed<ItoPublicView | undefined>(() => {
    const g = this.view().room.game;
    return g?.kind === 'ito' ? g : undefined;
  });
  readonly me = computed<ItoMeView | undefined>(() => this.view().me?.game?.ito);

  constructor() {
    let lastManche: number | undefined;
    effect(() => {
      const manche = this.game()?.mancheIndex;
      if (manche !== lastManche) {
        lastManche = manche;
        this.confirming.set(false);
      }
    });
  }

  livesArray(): number[] {
    return Array.from({ length: this.game()?.livesTotal ?? 0 }, (_, i) => i);
  }

  askConfirm(): void {
    this.confirming.set(true);
    clearTimeout(this.confirmTimeout);
    this.confirmTimeout = setTimeout(() => this.confirming.set(false), 3000);
  }

  confirmPose(): void {
    clearTimeout(this.confirmTimeout);
    this.confirming.set(false);
    void this.socket.gameAction({ type: 'playCard' });
  }

  myFate(): { kind: string; number: number } | undefined {
    const myId = this.view().me?.playerId;
    const card = this.game()?.frise.find((c) => c.playerId === myId);
    return card ? { kind: card.kind, number: card.number } : undefined;
  }

  fateLine(kind: string): string {
    switch (kind) {
      case 'posed':
        return '✅ Bien posée !';
      case 'error':
        return '❌ Posée trop tôt… −1 vie';
      case 'discarded':
        return 'Ta carte a été défaussée';
      case 'released':
        return 'Ta carte a été libérée';
      default:
        return '';
    }
  }
}
