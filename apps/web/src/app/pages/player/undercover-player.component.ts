/**
 * Écrans joueur par phase (fiche 5.1) : mot derrière un bouton (anti regard
 * par-dessus l'épaule), « c'est à toi », vote secret, spectateur si éliminé,
 * guess de Mr. White, révélation finale avec son propre rôle en grand.
 */
import { Component, computed, effect, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import type { ClientView, UndercoverMeView, UndercoverPublicView } from '@icebreakers/shared';
import { roleLabel } from '../../core/ui';
import { SocketService } from '../../core/socket.service';
import { EndRevealComponent } from '../../components/end-reveal.component';
import { TimerBadgeComponent } from '../../components/timer-badge.component';

@Component({
  selector: 'app-undercover-player',
  imports: [FormsModule, EndRevealComponent, TimerBadgeComponent],
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
            @if (g.phase !== 'end' && !m.alive) {
              <div class="card dead-card">✖ Tu es éliminé·e — tu regardes, motus !</div>
            }

            <!-- Rappel 🔒 du mot, repliable, dans toutes les phases de jeu -->
            @if (g.phase !== 'end' && m.alive) {
              <section class="card word-card">
                @if (revealed()) {
                  @if (m.isMrWhite) {
                    <div class="word mrwhite">🃏 Tu es <strong>Mr. White</strong></div>
                    <p class="muted">Tu n'as pas de mot : improvise et fonds-toi dans la masse !</p>
                  } @else {
                    <div class="muted small">Ton mot secret :</div>
                    <div class="word">{{ m.word }}</div>
                    <p class="muted small">Tu ne sais pas si c'est celui des civils ou des undercover 😉</p>
                  }
                  <button (click)="revealed.set(false)">Cacher</button>
                } @else {
                  <button class="primary see-word" (click)="showWord()">👁 Voir mon mot</button>
                  <p class="muted small">L'écran reste neutre tant que tu n'appuies pas.</p>
                }
              </section>
            }

            @switch (g.phase) {
              @case ('distribute') {
                <p class="hint muted">Consulte ton mot puis regarde la TV — le tour de parole arrive.</p>
              }
              @case ('describe') {
                @if (m.isMyTurn) {
                  <div class="card my-turn">🎤 C'est à toi ! Décris ton mot à voix haute, en un mot ou une phrase.</div>
                } @else {
                  <p class="hint muted">Écoute les descriptions — l'ordre est affiché sur la TV.</p>
                }
              }
              @case ('discuss') {
                <div class="row-center">
                  <app-timer-badge [timer]="view().room.timers[0]" [big]="true" />
                </div>
                <p class="hint muted">Débattez à l'oral : qui sonne faux ?</p>
              }
              @case ('vote') {
                @if (m.canVote) {
                  <section class="card">
                    <h2>
                      Vote pour éliminer
                      @if (g.revoteCandidates) {
                        <span class="tag">re-vote (égalité)</span>
                      }
                    </h2>
                    <div class="vote-grid">
                      @for (id of m.voteOptions; track id) {
                        <button
                          class="vote-option"
                          [class.chosen]="m.myVote === id"
                          [attr.aria-pressed]="m.myVote === id"
                          (click)="vote(id)"
                        >
                          {{ nameOf(id) }}
                          @if (m.myVote === id) {
                            <span aria-hidden="true">✓</span>
                          }
                        </button>
                      }
                    </div>
                    @if (m.myVote) {
                      <p class="muted small">Vote enregistré — modifiable jusqu'à la clôture.</p>
                    } @else {
                      <p class="muted small">Pas de vote au timeout = vote blanc.</p>
                    }
                    <div class="row-center">
                      <app-timer-badge [timer]="view().room.timers[0]" />
                    </div>
                  </section>
                } @else {
                  <p class="hint muted">Vote en cours — regarde la TV.</p>
                }
              }
              @case ('reveal') {
                <p class="hint muted">Révélation sur la TV 📺</p>
              }
              @case ('whiteGuess') {
                @if (m.canGuess) {
                  <section class="card guess-card">
                    <h2>🃏 Dernière chance !</h2>
                    <p>Devine le mot des civils : <strong>le mot exact</strong> — les fautes de frappe pardonnent, pas les synonymes.</p>
                    <form (ngSubmit)="submitGuess()">
                      <input
                        name="guess"
                        [(ngModel)]="guessInput"
                        maxlength="60"
                        autocomplete="off"
                        placeholder="Le mot des civils…"
                        aria-label="Ta proposition"
                      />
                      <button class="primary" type="submit" [disabled]="guessInput.trim().length === 0">Valider</button>
                    </form>
                    <div class="row-center">
                      <app-timer-badge [timer]="view().room.timers[0]" />
                    </div>
                  </section>
                } @else {
                  <p class="hint muted">Mr. White tente sa chance — verdict sur la TV.</p>
                }
              }
              @case ('end') {
                @if (myEndRole(); as mine) {
                  <div class="card my-role" [attr.data-role]="mine.role">
                    <div class="muted">Tu étais</div>
                    <div class="role-name">{{ roleLabel(mine.role) }}</div>
                    @if (mine.word) {
                      <div class="muted">avec le mot « {{ mine.word }} »</div>
                    }
                  </div>
                }
                @if (g.end; as end) {
                  @if (!end.isFinalManche) {
                    <p class="hint muted">Manche {{ g.mancheIndex }}/{{ g.manchesTotal }} terminée — la suivante arrive ! 🔁</p>
                  }
                  <app-end-reveal [end]="end" [players]="view().room.players" [showCumulative]="g.manchesTotal > 1" />
                }
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
      .center-card,
      .dead-card {
        text-align: center;
        font-size: 1.2rem;
      }
      .dead-card {
        border-color: var(--danger);
      }
      .word-card {
        text-align: center;
      }
      .word {
        font-size: 2.2rem;
        font-weight: 900;
        margin: 0.4rem 0;
      }
      .word.mrwhite {
        color: var(--accent);
      }
      .see-word {
        font-size: 1.3rem;
        width: 100%;
        padding: 1em;
      }
      .small {
        font-size: 0.85rem;
      }
      .hint {
        text-align: center;
        font-size: 1.1rem;
      }
      .my-turn {
        border-color: var(--accent);
        background: var(--accent-soft);
        font-size: 1.35rem;
        font-weight: 700;
        text-align: center;
      }
      .vote-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
        gap: 0.6rem;
        margin: 0.8rem 0;
      }
      .vote-option {
        font-size: 1.15rem;
        padding: 0.9em 0.6em;
      }
      .vote-option.chosen {
        border-color: var(--accent);
        background: var(--accent-soft);
        font-weight: 800;
      }
      .row-center {
        display: flex;
        justify-content: center;
        margin-top: 0.6rem;
      }
      .guess-card form {
        display: flex;
        gap: 0.6rem;
        margin: 0.8rem 0;
      }
      .guess-card input {
        flex: 1;
      }
      .my-role {
        text-align: center;
      }
      .my-role .role-name {
        font-size: 2.4rem;
        font-weight: 900;
      }
      .my-role[data-role='civilian'] .role-name {
        color: var(--ok);
      }
      .my-role[data-role='undercover'] .role-name {
        color: var(--danger);
      }
      .my-role[data-role='mrwhite'] .role-name {
        color: var(--accent);
      }
    `,
  ],
})
export class UndercoverPlayerComponent {
  private readonly socket = inject(SocketService);
  readonly view = input.required<ClientView>();
  protected readonly roleLabel = roleLabel;

  readonly revealed = signal(false);
  guessInput = '';

  constructor() {
    // Nouvelle manche = nouveau mot : la carte se re-masque (anti regard par-dessus l'épaule).
    let lastManche: number | undefined;
    effect(() => {
      const manche = this.game()?.mancheIndex;
      if (manche !== lastManche) {
        lastManche = manche;
        this.revealed.set(false);
      }
    });
  }

  readonly game = computed<UndercoverPublicView | undefined>(() => {
    const g = this.view().room.game;
    return g?.kind === 'undercover' ? g : undefined;
  });
  readonly me = computed<UndercoverMeView | undefined>(() => this.view().me?.game?.undercover);
  readonly myEndRole = computed(() => {
    const end = this.game()?.end;
    const myId = this.view().me?.playerId;
    return end?.roles.find((r) => r.playerId === myId);
  });

  nameOf(id: string): string {
    const p = this.view().room.players.find((x) => x.id === id);
    return p ? `${p.avatar} ${p.name}` : '???';
  }

  showWord(): void {
    this.revealed.set(true);
    if (!this.me()?.hasSeenWord) {
      void this.socket.gameAction({ type: 'seenWord' });
    }
  }

  vote(target: string): void {
    void this.socket.gameAction({ type: 'vote', target });
  }

  submitGuess(): void {
    const guess = this.guessInput.trim();
    if (!guess) return;
    void this.socket.gameAction({ type: 'guess', guess });
    this.guessInput = '';
  }
}
