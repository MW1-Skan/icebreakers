/**
 * Just One — écrans joueur par phase (fiche 5.3) : devineur (attente → saisie),
 * donneurs (mot 🔒 + indice un-seul-mot, validation collective avec toggles),
 * arbitre de manche (mot injouable, forcer la clôture, accepter/refuser).
 */
import { Component, computed, effect, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import type { ClientView, JustOneMeView, JustOnePublicView } from '@icebreakers/shared';
import { SocketService } from '../../core/socket.service';
import { TimerBadgeComponent } from '../../components/timer-badge.component';

@Component({
  selector: 'app-justone-player',
  imports: [FormsModule, TimerBadgeComponent],
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
            @if (g.guesserFrozen && !m.isGuesser) {
              <div class="card frozen">⏸ Manche gelée : le devineur est déconnecté.</div>
            }

            <div class="role-banner" [class.guesser]="m.isGuesser">
              @if (m.isGuesser) {
                🎯 À toi de deviner !
              } @else if (m.isArbiter) {
                ⚖️ Tu donnes un indice ET tu arbitres cette manche
              } @else {
                ✍️ Tu donnes un indice
              }
              <span class="muted manche">Manche {{ g.mancheIndex }}/{{ g.manchesTotal }} · Score {{ g.score }}</span>
            </div>

            <!-- 🔒 Mot mystère pour les donneurs -->
            @if (!m.isGuesser && m.word && g.phase !== 'resolve' && g.phase !== 'end') {
              <section class="card word-card">
                <div class="muted small">Le mot mystère (chut !) :</div>
                <div class="word">{{ m.word }}</div>
                @if (m.canRedraw) {
                  <button (click)="redraw()">🎲 Mot injouable — en tirer un autre</button>
                }
              </section>
            }

            @switch (g.phase) {
              @case ('write') {
                @if (m.isGuesser) {
                  <div class="card center-card">
                    <p>Les autres écrivent leurs indices… détends-toi 😌</p>
                    <div class="row-center"><app-timer-badge [timer]="view().room.timers[0]" [big]="true" /></div>
                  </div>
                } @else {
                  <section class="card">
                    <h2>Ton indice <span class="tag">un seul mot</span></h2>
                    <form (ngSubmit)="submitClue()">
                      <input
                        name="clue"
                        [(ngModel)]="clueInput"
                        maxlength="30"
                        autocomplete="off"
                        placeholder="Un-seul-mot"
                        aria-label="Ton indice"
                      />
                      <button class="primary" type="submit" [disabled]="!clueValid()">
                        {{ m.myClue ? 'Corriger' : 'Envoyer' }}
                      </button>
                    </form>
                    @if (clueError(); as err) {
                      <p class="error" role="alert">{{ err }}</p>
                    }
                    @if (m.myClue) {
                      <p class="muted small">Indice envoyé : « {{ m.myClue }} » — modifiable jusqu'à la clôture.</p>
                    }
                    <p class="muted small">Identique ou trop proche d'un autre indice = annulé pour le devineur !</p>
                  </section>
                }
              }
              @case ('validate') {
                @if (m.isGuesser) {
                  <div class="card center-card"><p>Vérification des indices… encore un instant 🤫</p></div>
                } @else if (m.clues) {
                  <section class="card">
                    <h2>Validation collective</h2>
                    <p class="muted small">
                      Annulez ce que l'automatique ne voit pas : même famille de mots, traduction, synonyme flagrant.
                    </p>
                    <ul class="clue-list">
                      @for (c of m.clues; track c.giverId) {
                        <li [class.cancelled]="c.cancelledAuto || c.cancelledManual">
                          <span class="clue-text">{{ c.text }}</span>
                          <span class="clue-author muted">{{ nameOf(c.giverId) }}</span>
                          @if (c.cancelledAuto) {
                            <span class="tag">annulé (ressemblance)</span>
                          } @else {
                            <button (click)="flag(c.giverId, !c.cancelledManual)">
                              {{ c.cancelledManual ? 'Ré-autoriser' : 'Annuler' }}
                            </button>
                          }
                        </li>
                      }
                    </ul>
                    <div class="actions">
                      <button class="primary" (click)="ready()" [disabled]="m.isReady">
                        {{ m.isReady ? '✓ Prêt' : 'Prêt !' }}
                      </button>
                      @if (m.canForceClose) {
                        <button (click)="forceClose()">⚖️ Forcer la clôture</button>
                      }
                      <app-timer-badge [timer]="view().room.timers[0]" />
                    </div>
                  </section>
                }
              }
              @case ('guess') {
                @if (m.isGuesser) {
                  <section class="card">
                    <h2>Les indices</h2>
                    @if ((m.remainingCluesForGuesser ?? []).length === 0) {
                      <p class="all-cancelled">😱 Tous les indices ont été annulés ! Tente ta chance à l'aveugle… ou passe.</p>
                    }
                    <ul class="clue-list guessing">
                      @for (c of m.remainingCluesForGuesser ?? []; track c.giverId) {
                        <li>
                          <span class="clue-text big">{{ c.text }}</span>
                          <span class="clue-author muted">{{ nameOf(c.giverId) }}</span>
                        </li>
                      }
                      @for (i of maskedArray(); track i) {
                        <li class="masked" title="indice annulé, masqué">▓▓▓▓▓</li>
                      }
                    </ul>
                    <form (ngSubmit)="submitGuess()">
                      <input
                        name="guess"
                        [(ngModel)]="guessInput"
                        maxlength="60"
                        autocomplete="off"
                        placeholder="Ta réponse…"
                        aria-label="Ta réponse"
                      />
                      <button class="primary" type="submit" [disabled]="guessInput.trim().length === 0">Valider</button>
                      <button type="button" (click)="pass()">Passer (0 pt)</button>
                    </form>
                    <div class="row-center"><app-timer-badge [timer]="view().room.timers[0]" /></div>
                  </section>
                } @else if (m.clues) {
                  <section class="card">
                    <h2>{{ nameOf(g.guesserId) }} réfléchit…</h2>
                    <ul class="clue-list">
                      @for (c of m.clues; track c.giverId) {
                        <li [class.cancelled]="c.cancelledAuto || c.cancelledManual">
                          <span class="clue-text">{{ c.text }}</span>
                          <span class="clue-author muted">{{ nameOf(c.giverId) }}</span>
                        </li>
                      }
                    </ul>
                    <div class="row-center"><app-timer-badge [timer]="view().room.timers[0]" /></div>
                  </section>
                }
              }
              @case ('arbitrate') {
                <section class="card center-card">
                  <p class="muted">Réponse proposée :</p>
                  <div class="proposal">« {{ g.guess }} »</div>
                  @if (m.canArbitrate) {
                    <p>Le mot est « <strong>{{ m.word }}</strong> » — tu tranches ⚖️ (faute de frappe pardonnée, pas les synonymes)</p>
                    <div class="actions center">
                      <button class="primary" (click)="arbitrate('accept')">✔ Accepter</button>
                      <button class="danger" (click)="arbitrate('reject')">✘ Refuser</button>
                    </div>
                  } @else if (m.isGuesser) {
                    <p>C'est tout proche… l'arbitre tranche !</p>
                  } @else {
                    <p>{{ nameOf(g.arbiterId) }} tranche…</p>
                  }
                </section>
              }
              @case ('resolve') {
                <section class="card center-card">
                  <p class="muted">Le mot était</p>
                  <div class="word">{{ g.revealedWord }}</div>
                  <div class="verdict" [attr.data-outcome]="g.outcome">{{ verdictLine() }}</div>
                  <p class="muted small">Regarde la TV — l'animateur enchaîne.</p>
                </section>
              }
              @case ('end') {
                <section class="card center-card">
                  <div class="final-score">{{ g.score }}/{{ g.manchesTotal }}</div>
                  <div class="final-label">{{ g.scoreLabel }}</div>
                  <p class="muted small">Le récap complet des mots et indices est sur la TV 📺</p>
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
      .frozen {
        border-color: var(--accent);
        text-align: center;
        font-weight: 600;
      }
      .role-banner {
        display: flex;
        align-items: baseline;
        gap: 0.8rem;
        flex-wrap: wrap;
        font-size: 1.25rem;
        font-weight: 700;
      }
      .role-banner.guesser {
        color: var(--game-color, var(--accent));
      }
      .role-banner .manche {
        font-size: 0.9rem;
        font-weight: 400;
        margin-left: auto;
      }
      .word-card {
        text-align: center;
      }
      .word {
        font-size: 2.2rem;
        font-weight: 900;
        margin: 0.3rem 0 0.6rem;
      }
      .small {
        font-size: 0.85rem;
      }
      form {
        display: flex;
        gap: 0.6rem;
        margin: 0.6rem 0;
        flex-wrap: wrap;
      }
      form input {
        flex: 1;
        min-width: 160px;
      }
      .error {
        color: var(--danger);
        margin: 0.2rem 0 0;
      }
      .clue-list {
        list-style: none;
        margin: 0.6rem 0;
        padding: 0;
        display: flex;
        flex-direction: column;
        gap: 0.45rem;
      }
      .clue-list li {
        display: flex;
        align-items: center;
        gap: 0.7rem;
        border: 1px solid var(--border);
        border-radius: 10px;
        padding: 0.45rem 0.8rem;
      }
      .clue-list li.cancelled .clue-text {
        text-decoration: line-through;
        opacity: 0.55;
      }
      .clue-list li.masked {
        color: var(--fg-muted);
        letter-spacing: 0.2em;
        justify-content: center;
      }
      .clue-text {
        font-weight: 700;
        font-size: 1.15rem;
      }
      .clue-text.big {
        font-size: 1.5rem;
      }
      .clue-author {
        font-size: 0.85rem;
        margin-left: auto;
      }
      .clue-list li button {
        font-size: 0.85rem;
        padding: 0.25em 0.7em;
      }
      .actions {
        display: flex;
        gap: 0.7rem;
        align-items: center;
        flex-wrap: wrap;
      }
      .actions.center {
        justify-content: center;
      }
      .row-center {
        display: flex;
        justify-content: center;
        margin-top: 0.5rem;
      }
      .all-cancelled {
        font-weight: 700;
        color: var(--accent);
      }
      .proposal {
        font-size: 1.8rem;
        font-weight: 800;
        color: var(--game-color, var(--info));
        margin: 0.4rem 0;
      }
      .verdict {
        font-size: 1.6rem;
        font-weight: 900;
        margin-top: 0.4rem;
      }
      .verdict[data-outcome='correct'] {
        color: var(--ok);
      }
      .verdict[data-outcome='wrong'] {
        color: var(--danger);
      }
      .final-score {
        font-size: 3rem;
        font-weight: 900;
        color: var(--game-color, var(--accent));
      }
      .final-label {
        font-size: 1.5rem;
        font-weight: 800;
      }
    `,
  ],
})
export class JustOnePlayerComponent {
  private readonly socket = inject(SocketService);
  readonly view = input.required<ClientView>();

  clueInput = '';
  guessInput = '';
  readonly clueError = signal<string | null>(null);

  readonly game = computed<JustOnePublicView | undefined>(() => {
    const g = this.view().room.game;
    return g?.kind === 'justone' ? g : undefined;
  });
  readonly me = computed<JustOneMeView | undefined>(() => this.view().me?.game?.justone);

  constructor() {
    // Nouvelle manche : champs remis à zéro.
    let lastManche: number | undefined;
    effect(() => {
      const manche = this.game()?.mancheIndex;
      if (manche !== lastManche) {
        lastManche = manche;
        this.clueInput = '';
        this.guessInput = '';
        this.clueError.set(null);
      }
    });
  }

  nameOf(id: string): string {
    const p = this.view().room.players.find((x) => x.id === id);
    return p ? `${p.avatar} ${p.name}` : '???';
  }

  verdictLine(): string {
    const g = this.game();
    const mine = this.me()?.isGuesser;
    switch (g?.outcome) {
      case 'correct':
        return mine ? '✔ Bien joué, +1 !' : '✔ Trouvé ! +1';
      case 'wrong':
        return '✘ Raté…';
      case 'pass':
        return '→ Passé (0 pt)';
      case 'timeout':
        return '⏱ Temps écoulé (0 pt)';
      case 'aborted':
        return 'Manche annulée';
      default:
        return '';
    }
  }

  clueValid(): boolean {
    return this.clueInput.trim().length > 0;
  }

  maskedArray(): number[] {
    return Array.from({ length: this.me()?.maskedCluesCount ?? 0 }, (_, i) => i);
  }

  async submitClue(): Promise<void> {
    const text = this.clueInput.trim();
    if (!text) return;
    if (/\s/.test(text)) {
      this.clueError.set('Un seul mot ! (les traits d’union sont admis)');
      return;
    }
    this.clueError.set(null);
    const ack = await this.socket.gameAction({ type: 'clue', text });
    if (!ack.ok) this.clueError.set(ack.error.message);
  }

  flag(giverId: string, cancelled: boolean): void {
    void this.socket.gameAction({ type: 'flagClue', giverId, cancelled });
  }

  ready(): void {
    void this.socket.gameAction({ type: 'ready' });
  }

  forceClose(): void {
    void this.socket.gameAction({ type: 'arbitrate', decision: 'forceClose' });
  }

  redraw(): void {
    void this.socket.gameAction({ type: 'arbitrate', decision: 'unplayable' });
  }

  submitGuess(): void {
    const guess = this.guessInput.trim();
    if (!guess) return;
    void this.socket.gameAction({ type: 'guess', guess });
    this.guessInput = '';
  }

  pass(): void {
    void this.socket.gameAction({ type: 'pass' });
  }

  arbitrate(decision: 'accept' | 'reject'): void {
    void this.socket.gameAction({ type: 'arbitrate', decision });
  }
}
