/**
 * Codenames — écran joueur. Le maître-espion voit la clé (🔒 sa vue à lui,
 * jamais la TV) et donne l'indice ; les devineurs actifs touchent la grille
 * (tap → confirmation) ou s'arrêtent. Les autres suivent en spectateurs.
 */
import { Component, computed, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import type { ClientView, CodenamesMeView, CodenamesPublicView, CodenamesTeam } from '@icebreakers/shared';
import { CODENAMES_TEAM_LABELS } from '@icebreakers/shared';
import { SocketService } from '../../core/socket.service';
import { CodenamesGridComponent } from '../../components/codenames-grid.component';
import { TimerBadgeComponent } from '../../components/timer-badge.component';

@Component({
  selector: 'app-codenames-player',
  imports: [FormsModule, CodenamesGridComponent, TimerBadgeComponent],
  template: `
    @if (game(); as g) {
      <div class="screen">
        <div class="role-banner" [attr.data-team]="me()?.team">
          @if (me()?.isSpymaster) {
            🎩 Maître-espion des {{ teamLabel(me()!.team!) }}s
          } @else if (me()?.inGame) {
            Devineur — équipe {{ teamLabel(me()!.team!) }}
          } @else {
            Spectateur — tu joueras la prochaine !
          }
          <span class="spacer"></span>
          @if (g.manchesTotal > 1) {
            <span class="tag">Manche {{ g.mancheIndex }}/{{ g.manchesTotal }}</span>
          }
          <app-timer-badge [timer]="view().room.timers[0]" />
        </div>

        @if (g.frozen) {
          <p class="frozen card">⏸ Déconnexion dans l'équipe active — le jeu est en pause.</p>
        }

        @switch (g.phase) {
          @case ('brief') {
            @if (me()?.isSpymaster) {
              @if (keyVisible()) {
                <div class="card key-card">
                  <p class="hint">🔒 Ta clé (personne d'autre ne la voit) — ☠️ = l'assassin, à éviter absolument.</p>
                  <app-codenames-grid [cards]="g.cards" [key]="me()?.key" />
                  <button (click)="keyVisible.set(false)">Cacher</button>
                </div>
              } @else {
                <div class="card center-card">
                  <p>Tu es maître-espion : mémorise la clé avant le lancement.</p>
                  <button class="primary" (click)="showKey()">Voir la clé</button>
                </div>
              }
            } @else {
              <p class="muted">Regarde la TV 📺 — les maîtres-espions étudient la clé, la partie arrive.</p>
              <app-codenames-grid [cards]="g.cards" />
            }
          }
          @case ('clue') {
            @if (me()?.canGiveClue) {
              <div class="card">
                <p class="hint">À toi : UN mot (hors grille) + un nombre de mots visés.</p>
                <app-codenames-grid [cards]="g.cards" [key]="me()?.key" />
                <form class="clue-form" (ngSubmit)="submitClue()">
                  <input
                    name="clueWord"
                    [(ngModel)]="clueWord"
                    maxlength="30"
                    autocomplete="off"
                    placeholder="soleil"
                    aria-label="Ton indice"
                  />
                  <select id="cncount" name="cncount" [(ngModel)]="clueCount" aria-label="Nombre de mots visés">
                    @for (n of [1, 2, 3, 4, 5, 6, 7, 8, 9]; track n) {
                      <option [ngValue]="n">{{ n }}</option>
                    }
                  </select>
                  <button class="primary" type="submit" [disabled]="!clueWord.trim()">Envoyer</button>
                </form>
                @if (clueError(); as err) {
                  <p class="error" role="alert">{{ err }}</p>
                }
              </div>
            } @else if (me()?.isSpymaster) {
              <p class="muted">🎩 {{ nameOf(g.spymasters[g.activeTeam]) }} prépare son indice — poker face 😐</p>
              <app-codenames-grid [cards]="g.cards" [key]="me()?.key" />
            } @else {
              <p class="muted">
                {{ nameOf(g.spymasters[g.activeTeam]) }} ({{ teamLabel(g.activeTeam) }}s) prépare un indice…
              </p>
              <app-codenames-grid [cards]="g.cards" />
            }
          }
          @case ('guess') {
            @if (g.currentClue; as clue) {
              <div class="clue-line" [attr.data-team]="g.activeTeam">
                « {{ clue.word }} » — {{ clue.count }}
                <span class="tag">{{ clue.guessesLeft }} touche{{ clue.guessesLeft > 1 ? 's' : '' }}</span>
              </div>
            }
            @if (me()?.canReveal) {
              <app-codenames-grid
                [cards]="g.cards"
                [interactive]="true"
                [selectedIndex]="selectedIndex()"
                (pick)="selectedIndex.set($event)"
              />
              @if (selectedIndex() !== null) {
                <div class="confirm-bar card">
                  Révéler « <strong>{{ g.cards[selectedIndex()!].word }}</strong> » ?
                  <button class="primary" (click)="confirmReveal()">Confirmer</button>
                  <button (click)="selectedIndex.set(null)">Annuler</button>
                </div>
              }
              @if (me()?.canStop) {
                <button class="stop" (click)="stop()">✋ On s'arrête là</button>
              }
              @if (revealError(); as err) {
                <p class="error" role="alert">{{ err }}</p>
              }
            } @else if (me()?.isSpymaster) {
              <p class="muted">Tes devineurs réfléchissent — poker face 😐</p>
              <app-codenames-grid [cards]="g.cards" [key]="me()?.key" />
            } @else {
              <p class="muted">L'équipe {{ teamLabel(g.activeTeam) }} devine…</p>
              <app-codenames-grid [cards]="g.cards" />
            }
          }
          @case ('end') {
            <div class="end card center-card" [attr.data-team]="g.winner">
              <div class="verdict" [class.win]="me()?.team === g.winner" [class.lose]="me()?.inGame && me()?.team !== g.winner">
                @if (!me()?.inGame) {
                  Les {{ teamLabel(g.winner!) }}s gagnent !
                } @else if (me()?.team === g.winner) {
                  🎉 Victoire des {{ teamLabel(g.winner!) }}s !
                } @else {
                  Défaite… les {{ teamLabel(g.winner!) }}s l'emportent.
                }
              </div>
              @if (g.endedByAssassin) {
                <p class="muted">☠️ L'assassin a été touché par les {{ teamLabel(g.assassinTeam!) }}s.</p>
              }
              <p class="muted">La clé complète est sur la TV 📺{{ g.mancheIndex < g.manchesTotal ? ' — la manche suivante arrive.' : '.' }}</p>
            </div>
            <app-codenames-grid [cards]="g.cards" [key]="g.keyReveal" />
          }
        }
      </div>
    }
  `,
  styles: [
    `
      .screen {
        display: flex;
        flex-direction: column;
        gap: 0.9rem;
      }
      .role-banner {
        display: flex;
        align-items: center;
        gap: 0.6rem;
        flex-wrap: wrap;
        font-size: 1.15rem;
        font-weight: 700;
      }
      .role-banner[data-team='0'] {
        color: var(--cn-red);
      }
      .role-banner[data-team='1'] {
        color: var(--cn-blue);
      }
      .spacer {
        flex: 1;
      }
      .frozen {
        border-color: var(--accent);
        margin: 0;
        padding: 0.6rem 1rem;
      }
      .hint {
        margin-top: 0;
        color: var(--fg-muted);
      }
      .center-card {
        text-align: center;
      }
      .key-card button {
        margin-top: 0.8rem;
      }
      .clue-form {
        display: flex;
        gap: 0.5rem;
        margin-top: 0.8rem;
      }
      .clue-form input {
        flex: 1;
        min-width: 0;
      }
      .clue-line {
        text-align: center;
        font-family: var(--font-display);
        font-size: 1.5rem;
        font-weight: 700;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 0.6rem;
        flex-wrap: wrap;
      }
      .clue-line[data-team='0'] {
        color: var(--cn-red);
      }
      .clue-line[data-team='1'] {
        color: var(--cn-blue);
      }
      .confirm-bar {
        display: flex;
        align-items: center;
        gap: 0.7rem;
        flex-wrap: wrap;
        padding: 0.7rem 1rem;
      }
      .stop {
        align-self: center;
      }
      .error {
        color: var(--danger);
        margin: 0;
      }
      .end .verdict {
        font-family: var(--font-display);
        font-size: 1.8rem;
        font-weight: 700;
      }
      .end .verdict.win {
        color: var(--ok);
      }
      .end .verdict.lose {
        color: var(--fg-muted);
      }
    `,
  ],
})
export class CodenamesPlayerComponent {
  private readonly socket = inject(SocketService);
  readonly view = input.required<ClientView>();

  readonly game = computed<CodenamesPublicView | undefined>(() => {
    const g = this.view().room.game;
    return g?.kind === 'codenames' ? g : undefined;
  });

  readonly me = computed<CodenamesMeView | undefined>(() => this.view().me?.game?.codenames);

  readonly keyVisible = signal(false);
  readonly selectedIndex = signal<number | null>(null);
  readonly clueError = signal<string | null>(null);
  readonly revealError = signal<string | null>(null);
  clueWord = '';
  clueCount = 1;

  teamLabel(team: number | CodenamesTeam): string {
    return CODENAMES_TEAM_LABELS[team as CodenamesTeam];
  }

  nameOf(id: string): string {
    const p = this.view().room.players.find((x) => x.id === id);
    return p ? `${p.avatar} ${p.name}` : '???';
  }

  showKey(): void {
    this.keyVisible.set(true);
    if (!this.me()?.hasSeenKey) void this.socket.gameAction({ type: 'seenWord' });
  }

  async submitClue(): Promise<void> {
    const word = this.clueWord.trim();
    if (!word) return;
    this.clueError.set(null);
    const ack = await this.socket.gameAction({ type: 'giveClue', word, count: this.clueCount });
    if (!ack.ok) {
      this.clueError.set(ack.error.message);
      return;
    }
    this.clueWord = '';
    this.clueCount = 1;
  }

  async confirmReveal(): Promise<void> {
    const index = this.selectedIndex();
    if (index === null) return;
    this.revealError.set(null);
    this.selectedIndex.set(null);
    const ack = await this.socket.gameAction({ type: 'revealCard', cardIndex: index });
    if (!ack.ok) this.revealError.set(ack.error.message);
  }

  stop(): void {
    void this.socket.gameAction({ type: 'stopGuessing' });
  }
}
