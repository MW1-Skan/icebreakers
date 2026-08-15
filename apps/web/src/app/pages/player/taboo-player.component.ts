/**
 * Taboo — écran joueur (fiche 5.6) : orateur (carte + Trouvé/Passer),
 * arbitres (même carte + gros BUZZ), devineur (chrono neutre, jamais la carte).
 */
import { Component, computed, inject, input } from '@angular/core';
import type { ClientView, TabooMeView, TabooPublicView } from '@icebreakers/shared';
import { SocketService } from '../../core/socket.service';
import { TimerBadgeComponent } from '../../components/timer-badge.component';

@Component({
  selector: 'app-taboo-player',
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
            <div class="role-banner">
              @if (m.isOrator) {
                🎤 Tu fais deviner
              } @else if (m.isGuesser) {
                🧠 Tu devines !
              } @else if (m.isArbiter) {
                👀 Tu arbitres
              } @else {
                🔢 Taboo
              }
              @if (m.teamIndex !== undefined) {
                <span class="muted small">Ton binôme : {{ teamLabel(m.teamIndex) }}</span>
              }
            </div>

            @if (g.frozen) {
              <div class="card frozen">⏸ Chrono en pause — un joueur du binôme est déconnecté.</div>
            }

            @switch (g.phase) {
              @case ('prep') {
                @if (m.canGo) {
                  <section class="card center-card">
                    <p>Prêt ? La première carte s'affiche dès que tu lances.</p>
                    <p class="muted small">Interdits : le mot, les 3 mots rouges, dérivés, traductions, « ça rime avec »…</p>
                    <button class="primary go" (click)="go()">🚀 Go !</button>
                  </section>
                } @else if (m.isGuesser) {
                  <div class="card center-card"><h2>Devine !</h2><p class="muted">Éloigne-toi des écrans des arbitres 👀</p></div>
                } @else if (m.isArbiter) {
                  <div class="card center-card"><p>La carte arrivera ici — prêt à buzzer 🔔</p></div>
                } @else {
                  <div class="card center-card"><p class="muted">Regarde la TV 📺</p></div>
                }
              }
              @case ('live') {
                @if (m.isOrator && m.currentCard) {
                  <section class="card taboo-card">
                    <div class="target-word">{{ m.currentCard.word }}</div>
                    <div class="forbidden">
                      @for (f of m.currentCard.forbidden; track f) {
                        <span>{{ f }}</span>
                      }
                    </div>
                    <div class="orator-actions">
                      <button class="primary found" (click)="found()">✓ Trouvé</button>
                      <button (click)="pass()">→ Passer{{ g.params.hardPass ? ' (−1)' : '' }}</button>
                    </div>
                    <div class="row-center"><app-timer-badge [timer]="view().room.timers[0]" /></div>
                  </section>
                } @else if (m.isArbiter && m.currentCard) {
                  <section class="card taboo-card arbiter">
                    <div class="target-word">{{ m.currentCard.word }}</div>
                    <div class="forbidden">
                      @for (f of m.currentCard.forbidden; track f) {
                        <span>{{ f }}</span>
                      }
                    </div>
                    <button class="buzz" (click)="buzz()" [disabled]="!m.canBuzz">🔔 BUZZ</button>
                    <p class="muted small">Un seul buzz suffit — la carte saute et le binôme prend −1.</p>
                  </section>
                } @else {
                  <section class="card center-card">
                    <div class="row-center"><app-timer-badge [timer]="view().room.timers[0]" [big]="true" /></div>
                    <p class="muted">Écoute bien — la TV ne montre pas la carte (toi non plus 😄)</p>
                  </section>
                }
              }
              @case ('recap') {
                <div class="card center-card">
                  <p>Récap du passage sur la TV 📺 {{ m.isGuesser ? '— découvre enfin les cartes !' : '' }}</p>
                </div>
              }
              @case ('end') {
                <section class="card center-card">
                  <div class="final">{{ myTeamPoints() }} pts</div>
                  <p class="muted">Classement des binômes sur la TV 📺</p>
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
        flex-wrap: wrap;
      }
      .role-banner .small {
        margin-left: auto;
        font-weight: 400;
      }
      .small {
        font-size: 0.85rem;
      }
      .frozen {
        border-color: var(--accent);
        text-align: center;
        font-weight: 600;
      }
      .go {
        font-size: 1.4rem;
        width: 100%;
        padding: 0.9em;
      }
      .taboo-card {
        text-align: center;
      }
      .target-word {
        font-size: clamp(2rem, 9vw, 3.2rem);
        font-weight: 900;
        line-height: 1.1;
      }
      .forbidden {
        display: flex;
        flex-direction: column;
        gap: 0.2rem;
        margin: 0.8rem 0;
        font-size: 1.3rem;
        font-weight: 700;
        color: var(--danger);
      }
      .orator-actions {
        display: flex;
        gap: 0.7rem;
      }
      .orator-actions .found {
        flex: 2;
        font-size: 1.3rem;
        padding: 0.8em;
      }
      .orator-actions button:last-child {
        flex: 1;
      }
      .buzz {
        width: 100%;
        font-size: 1.8rem;
        font-weight: 900;
        padding: 0.8em;
        background: var(--danger);
        border-color: var(--danger);
        color: white;
      }
      .row-center {
        display: flex;
        justify-content: center;
        margin-top: 0.6rem;
      }
      .final {
        font-size: 2.4rem;
        font-weight: 900;
        color: var(--game-color, var(--accent));
      }
    `,
  ],
})
export class TabooPlayerComponent {
  private readonly socket = inject(SocketService);
  readonly view = input.required<ClientView>();

  readonly game = computed<TabooPublicView | undefined>(() => {
    const g = this.view().room.game;
    return g?.kind === 'taboo' ? g : undefined;
  });
  readonly me = computed<TabooMeView | undefined>(() => this.view().me?.game?.taboo);

  teamLabel(teamIndex: number): string {
    const team = this.game()?.teams[teamIndex] ?? [];
    return team
      .map((id) => this.view().room.players.find((p) => p.id === id)?.name ?? '?')
      .join(' & ');
  }

  myTeamPoints(): number {
    const teamIndex = this.me()?.teamIndex;
    return this.game()?.totals.find((t) => t.teamIndex === teamIndex)?.points ?? 0;
  }

  go(): void {
    void this.socket.gameAction({ type: 'go' });
  }

  found(): void {
    const seq = this.me()?.cardSeq;
    if (seq !== undefined) void this.socket.gameAction({ type: 'found', cardSeq: seq });
  }

  pass(): void {
    const seq = this.me()?.cardSeq;
    if (seq !== undefined) void this.socket.gameAction({ type: 'passCard', cardSeq: seq });
  }

  buzz(): void {
    const seq = this.me()?.cardSeq;
    if (seq !== undefined) void this.socket.gameAction({ type: 'buzz', cardSeq: seq });
  }
}
