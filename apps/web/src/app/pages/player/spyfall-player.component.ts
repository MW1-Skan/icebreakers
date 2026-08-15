/**
 * Spyfall — écran joueur (fiche 5.4) : carte 🔒 repliable (ou « Tu es
 * l'ESPION »), accusation unique, votes Oui/Non, grille cliquable pour le
 * coup de l'espion, vote final.
 */
import { Component, computed, effect, inject, input, signal } from '@angular/core';
import type { ClientView, SpyfallMeView, SpyfallPublicView } from '@icebreakers/shared';
import { SocketService } from '../../core/socket.service';
import { TimerBadgeComponent } from '../../components/timer-badge.component';

@Component({
  selector: 'app-spyfall-player',
  imports: [TimerBadgeComponent],
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
            @if (g.frozen && !m.isSpy) {
              <div class="card frozen">⏸ Manche gelée : un joueur-clé est déconnecté.</div>
            }

            <!-- 🔒 Carte repliable (ou ESPION) pendant toute la manche -->
            @if (g.phase !== 'reveal' && g.phase !== 'end') {
              <section class="card word-card">
                @if (revealed()) {
                  @if (m.isSpy) {
                    <div class="spy-card">🕶️ Tu es <strong>l'ESPION</strong></div>
                    <p class="muted small">Tu ne connais pas la carte — déduis-la des réponses, fonds-toi dans la masse !</p>
                  } @else {
                    <div class="muted small">Ta carte (thème : {{ g.category }}) :</div>
                    <div class="word">{{ m.card }}</div>
                  }
                  <button (click)="revealed.set(false)">Cacher</button>
                } @else {
                  <button class="primary see-word" (click)="showCard()">👁 Voir ma carte</button>
                }
              </section>
            }

            @switch (g.phase) {
              @case ('brief') {
                <p class="hint muted">La grille des cartes possibles est sur la TV (et ci-dessous) — l'interrogatoire arrive.</p>
                <div class="grid">
                  @for (item of g.grid; track item) {
                    <span class="grid-item">{{ item }}</span>
                  }
                </div>
              }
              @case ('interrogate') {
                <div class="actions">
                  @if (m.canAccuse) {
                    @if (!accusing()) {
                      <button class="danger" (click)="accusing.set(true)">☝️ Accuser quelqu'un (1 par manche)</button>
                    } @else {
                      <section class="card">
                        <h3>Qui accuses-tu d'être l'espion ?</h3>
                        <div class="target-grid">
                          @for (p of accusables(); track p.id) {
                            <button (click)="accuse(p.id)">{{ p.avatar }} {{ p.name }}</button>
                          }
                        </div>
                        <button (click)="accusing.set(false)">Annuler</button>
                      </section>
                    }
                  } @else if (!m.isSpy) {
                    <p class="muted small">Accusation déjà utilisée cette manche.</p>
                  }
                  @if (m.canSpyReveal) {
                    <button class="primary" (click)="spyReveal()">🎯 Deviner la carte (je me révèle !)</button>
                  }
                </div>
                <div class="row-center"><app-timer-badge [timer]="view().room.timers[0]" [big]="true" /></div>
              }
              @case ('accusationVote') {
                @if (m.isAccused) {
                  <div class="card center-card accused">😳 {{ nameOf(g.accusation!.accuserId) }} t'accuse — les autres votent…</div>
                } @else if (m.canVoteAccusation) {
                  <section class="card center-card">
                    <h3>{{ nameOf(g.accusation!.accuserId) }} accuse {{ nameOf(g.accusation!.accusedId) }}</h3>
                    <p class="muted small">Unanimité de Oui = carte révélée. Erreur = victoire de l'espion !</p>
                    <div class="actions center">
                      <button class="primary" (click)="voteAccusation(true)">✔ Oui, c'est l'espion</button>
                      <button class="danger" (click)="voteAccusation(false)">✘ Non</button>
                    </div>
                    <app-timer-badge [timer]="view().room.timers[0]" />
                  </section>
                } @else {
                  <p class="hint muted">Vote enregistré ({{ myVoteLabel() }}) — regarde la TV.</p>
                }
              }
              @case ('spyGuess') {
                @if (m.canSpyGuess) {
                  <section class="card">
                    <h3>Choisis la carte de l'équipe :</h3>
                    <div class="target-grid">
                      @for (item of g.grid; track item) {
                        <button (click)="spyGuess(item)">{{ item }}</button>
                      }
                    </div>
                  </section>
                } @else {
                  <p class="hint muted">{{ nameOf(g.revealedSpyId!) }} était l'espion — il tente sa chance…</p>
                }
              }
              @case ('finalVote') {
                @if (m.canVoteFinal) {
                  <section class="card">
                    <h3>Qui est l'espion ?</h3>
                    <div class="target-grid">
                      @for (p of finalTargets(); track p.id) {
                        <button (click)="voteFinal(p.id)">{{ p.avatar }} {{ p.name }}</button>
                      }
                    </div>
                    <div class="row-center"><app-timer-badge [timer]="view().room.timers[0]" /></div>
                  </section>
                } @else {
                  <p class="hint muted">Suspect désigné{{ m.myFinalVote ? ' : ' + nameOf(m.myFinalVote) : '' }} — regarde la TV.</p>
                }
              }
              @case ('reveal') {
                <section class="card center-card">
                  @if (g.lastOutcome; as o) {
                    <div class="verdict" [class.team]="o.winner === 'team'" [class.spy]="o.winner === 'spy'">
                      {{ o.reason === 'aborted' ? 'Manche annulée' : o.winner === 'team' ? '🎉 L’équipe gagne !' : '🕶️ L’espion gagne !' }}
                    </div>
                    <p class="muted">Détails et points sur la TV 📺</p>
                  }
                </section>
              }
              @case ('end') {
                <section class="card center-card">
                  <div class="final-points">{{ myTotal() }} pts</div>
                  <p class="muted">Classement complet sur la TV 📺</p>
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
      .word-card {
        text-align: center;
      }
      .word {
        font-size: 1.9rem;
        font-weight: 900;
        margin: 0.3rem 0 0.5rem;
      }
      .spy-card {
        font-size: 1.6rem;
        color: var(--danger);
        margin-bottom: 0.3rem;
      }
      .see-word {
        font-size: 1.2rem;
        width: 100%;
        padding: 0.9em;
      }
      .small {
        font-size: 0.85rem;
      }
      .hint {
        text-align: center;
        font-size: 1.05rem;
      }
      .grid,
      .target-grid {
        display: flex;
        flex-wrap: wrap;
        gap: 0.45rem;
        justify-content: center;
        margin: 0.6rem 0;
      }
      .grid-item {
        border: 1px solid var(--border);
        border-radius: 10px;
        padding: 0.25rem 0.7rem;
        font-size: 0.95rem;
        background: var(--bg-raised);
      }
      .target-grid button {
        font-size: 1.05rem;
      }
      .actions {
        display: flex;
        flex-direction: column;
        gap: 0.7rem;
      }
      .actions.center {
        flex-direction: row;
        justify-content: center;
      }
      .row-center {
        display: flex;
        justify-content: center;
        margin-top: 0.5rem;
      }
      .accused {
        border-color: var(--danger);
        font-size: 1.2rem;
      }
      .verdict {
        font-size: 1.8rem;
        font-weight: 900;
      }
      .team {
        color: var(--ok);
      }
      .spy {
        color: var(--danger);
      }
      .final-points {
        font-size: 2.4rem;
        font-weight: 900;
        color: var(--game-color, var(--accent));
      }
    `,
  ],
})
export class SpyfallPlayerComponent {
  private readonly socket = inject(SocketService);
  readonly view = input.required<ClientView>();

  readonly revealed = signal(false);
  readonly accusing = signal(false);

  readonly game = computed<SpyfallPublicView | undefined>(() => {
    const g = this.view().room.game;
    return g?.kind === 'spyfall' ? g : undefined;
  });
  readonly me = computed<SpyfallMeView | undefined>(() => this.view().me?.game?.spyfall);

  constructor() {
    let lastManche: number | undefined;
    effect(() => {
      const manche = this.game()?.mancheIndex;
      if (manche !== lastManche) {
        lastManche = manche;
        this.revealed.set(false);
        this.accusing.set(false);
      }
    });
  }

  nameOf(id: string): string {
    const p = this.view().room.players.find((x) => x.id === id);
    return p ? `${p.avatar} ${p.name}` : '???';
  }

  accusables(): Array<{ id: string; name: string; avatar: string }> {
    const myId = this.view().me?.playerId;
    return this.view().room.players.filter((p) => p.id !== myId);
  }

  finalTargets(): Array<{ id: string; name: string; avatar: string }> {
    return this.accusables();
  }

  myVoteLabel(): string {
    const vote = this.me()?.myAccusationVote;
    return vote === undefined ? '—' : vote ? 'Oui' : 'Non';
  }

  myTotal(): number {
    const myId = this.view().me?.playerId;
    return this.game()?.totals.find((t) => t.playerId === myId)?.points ?? 0;
  }

  showCard(): void {
    this.revealed.set(true);
    if (!this.me()?.hasSeenCard) {
      void this.socket.gameAction({ type: 'seenWord' });
    }
  }

  accuse(accusedId: string): void {
    this.accusing.set(false);
    void this.socket.gameAction({ type: 'accuse', accusedId });
  }

  voteAccusation(yes: boolean): void {
    void this.socket.gameAction({ type: 'voteAccusation', yes });
  }

  spyReveal(): void {
    if (confirm('Te révéler comme espion et tenter de deviner la carte ? Le jeu se fige.')) {
      void this.socket.gameAction({ type: 'spyGuess' });
    }
  }

  spyGuess(card: string): void {
    void this.socket.gameAction({ type: 'spyGuess', card });
  }

  voteFinal(target: string): void {
    void this.socket.gameAction({ type: 'vote', target });
  }
}
