/**
 * Spyfall — vue publique projetée (fiche 5.4) : thème en grand + grille des
 * cartes possibles en permanence, timer de manche, accusations et votes en
 * compteurs — jamais la carte ni l'espion avant l'issue.
 */
import { Component, computed, input } from '@angular/core';
import type { ClientView, PlayerPublicView, SpyfallPublicView } from '@icebreakers/shared';
import { PlayersGridComponent, PlayerBadge } from '../../components/players-grid.component';
import { RecapBannerComponent } from '../../components/recap-banner.component';
import { TimerBadgeComponent } from '../../components/timer-badge.component';

@Component({
  selector: 'app-spyfall-host',
  imports: [PlayersGridComponent, RecapBannerComponent, TimerBadgeComponent],
  template: `
    @if (game(); as g) {
      <div class="stage">
        <div class="phase-header">
          <h1 class="tv-title">{{ phaseTitle() }}</h1>
          @if (g.manchesTotal > 1) {
            <span class="tag">Manche {{ g.mancheIndex }}/{{ g.manchesTotal }}</span>
          }
          <app-timer-badge [timer]="view().room.timers[0]" [big]="true" />
        </div>

        @if (g.frozen) {
          <p class="notice warn">⏸ Un joueur-clé est déconnecté — manche gelée (annulée dans 60 s s'il ne revient pas).</p>
        }

        @if (g.phase !== 'end') {
          <div class="theme card">
            <div class="muted">Thème</div>
            <div class="tv-huge theme-text">{{ g.category }}</div>
            @if (g.phase === 'brief') {
              <p class="muted">L'animateur n'a pas de carte et n'est jamais l'espion — inutile de l'interroger 🙂</p>
            }
          </div>

          <div class="grid" aria-label="Cartes possibles du thème">
            @for (item of g.grid; track item) {
              <span class="grid-item" [class.revealed-card]="isRevealedCard(item)">{{ item }}</span>
            }
          </div>
        }

        @switch (g.phase) {
          @case ('brief') {
            <p class="instruction">Consultez votre carte 📱 — l'un de vous est l'ESPION…</p>
            <app-players-grid [players]="view().room.players" [badges]="seenBadges()" [compact]="true" />
          }
          @case ('interrogate') {
            <p class="instruction">
              🎤 Premier questionneur : <strong>{{ nameOf(g.firstQuestionerId) }}</strong> — celui qui répond pose la question suivante.
            </p>
          }
          @case ('accusationVote') {
            @if (g.accusation; as a) {
              <div class="reveal-card card">
                <div class="tv-title">☝️ {{ nameOf(a.accuserId) }} accuse {{ nameOf(a.accusedId) }} !</div>
                <div class="counter">{{ a.votesCast }}/{{ a.votersExpected }} ont voté</div>
                <p class="muted">Unanimité de Oui requise — sinon le timer reprend.</p>
              </div>
            }
          }
          @case ('spyGuess') {
            <div class="reveal-card card">
              <div class="tv-title">🕶️ L'espion se révèle : {{ nameOf(g.revealedSpyId!) }} !</div>
              <p class="instruction">Il tente de deviner la carte dans la grille…</p>
            </div>
          }
          @case ('finalVote') {
            <div class="reveal-card card">
              <div class="tv-title">🗳️ Vote final : qui est l'espion ?</div>
              <div class="counter">{{ g.finalVotesCast }}/{{ g.finalVotersExpected }} ont voté</div>
              <p class="muted">Égalité = victoire de l'espion (il a semé le doute).</p>
            </div>
          }
          @case ('reveal') {
            @if (g.lastOutcome; as o) {
              <div class="reveal-card card">
                @if (o.reason === 'aborted') {
                  <div class="tv-title">Manche annulée</div>
                  <p class="muted">L'espion ({{ nameOf(o.spyId) }}) est resté déconnecté — aucune valeur de manche.</p>
                } @else {
                  <div class="tv-title" [class.team]="o.winner === 'team'" [class.spy]="o.winner === 'spy'">
                    {{ o.winner === 'team' ? '🎉 L’équipe gagne !' : '🕶️ L’espion gagne !' }}
                  </div>
                  <p class="outcome-line">
                    L'espion était <strong>{{ nameOf(o.spyId) }}</strong> — la carte : <strong>{{ o.card }}</strong>
                  </p>
                  @if (o.guessedCard) {
                    <p class="muted">Sa proposition : « {{ o.guessedCard }} »</p>
                  }
                  @if (o.decisiveAccuserId) {
                    <p class="muted">Accusateur décisif : {{ nameOf(o.decisiveAccuserId) }} (+2 pts)</p>
                  }
                  @if (o.topVotedId) {
                    <p class="muted">Le plus voté : {{ nameOf(o.topVotedId) }}</p>
                  }
                }
              </div>
              <div class="totals card">
                <h3>Points</h3>
                <ol>
                  @for (t of g.totals; track t.playerId) {
                    <li>{{ nameOf(t.playerId) }} <span class="total">{{ t.points }} pts</span></li>
                  }
                </ol>
              </div>
            }
          }
          @case ('end') {
            <div class="final card">
              <h2 class="tv-title">Fin de partie</h2>
              <ol>
                @for (t of g.totals; track t.playerId; let i = $index) {
                  <li [class.leader]="i === 0 && t.points > 0">
                    {{ nameOf(t.playerId) }}
                    <span class="total">{{ t.points }} pts</span>
                  </li>
                }
              </ol>
              @if (g.history; as history) {
                <ul class="history muted">
                  @for (h of history; track $index) {
                    <li>{{ h.category }} → « {{ h.card }} », espion : {{ nameOf(h.spyId) }}</li>
                  }
                </ul>
              }
            </div>
            <app-recap-banner [recap]="view().room.recap" />
          }
        }
      </div>
    }
  `,
  styles: [
    `
      .stage {
        display: flex;
        flex-direction: column;
        gap: 1.1rem;
      }
      .phase-header {
        display: flex;
        align-items: center;
        gap: 1rem;
        flex-wrap: wrap;
      }
      .phase-header h1 {
        margin: 0;
        flex: 1;
      }
      .notice {
        background: var(--bg-raised);
        border: 1px solid var(--accent);
        border-radius: 10px;
        padding: 0.5rem 1rem;
        margin: 0;
      }
      .theme {
        text-align: center;
      }
      .theme-text {
        color: var(--accent);
      }
      .grid {
        display: flex;
        flex-wrap: wrap;
        gap: 0.5rem;
        justify-content: center;
      }
      .grid-item {
        border: 1px solid var(--border);
        border-radius: 10px;
        padding: 0.35rem 0.9rem;
        font-size: 1.1rem;
        font-weight: 600;
        background: var(--bg-raised);
      }
      .grid-item.revealed-card {
        border-color: var(--ok);
        color: var(--ok);
      }
      .instruction {
        font-size: 1.35rem;
        text-align: center;
        margin: 0;
      }
      .reveal-card {
        text-align: center;
        padding: 1.6rem;
      }
      .counter {
        font-size: 2rem;
        font-weight: 900;
        margin: 0.4rem 0;
      }
      .team {
        color: var(--ok);
      }
      .spy {
        color: var(--danger);
      }
      .outcome-line {
        font-size: 1.3rem;
      }
      .totals ol,
      .final ol {
        list-style: none;
        margin: 0;
        padding: 0;
        display: flex;
        flex-direction: column;
        gap: 0.3rem;
        font-size: 1.15rem;
      }
      .totals li,
      .final li {
        display: flex;
        gap: 0.7rem;
        padding: 0.2rem 0.6rem;
        border-radius: 10px;
      }
      .final li.leader {
        background: var(--accent-soft);
        border: 1px solid var(--accent);
        font-weight: 800;
      }
      .total {
        margin-left: auto;
        font-variant-numeric: tabular-nums;
        font-weight: 700;
      }
      .history {
        list-style: none;
        margin: 0.8rem 0 0;
        padding: 0;
        text-align: left;
      }
    `,
  ],
})
export class SpyfallHostComponent {
  readonly view = input.required<ClientView>();

  readonly game = computed<SpyfallPublicView | undefined>(() => {
    const g = this.view().room.game;
    return g?.kind === 'spyfall' ? g : undefined;
  });

  readonly phaseTitle = computed(() => {
    switch (this.game()?.phase) {
      case 'brief':
        return 'Distribution';
      case 'interrogate':
        return 'Interrogatoire !';
      case 'accusationVote':
        return 'Accusation';
      case 'spyGuess':
        return 'Coup de l’espion';
      case 'finalVote':
        return 'Vote final';
      case 'reveal':
        return 'Révélation';
      case 'end':
        return 'Fin de partie';
      default:
        return '';
    }
  });

  playerById(id: string): PlayerPublicView | undefined {
    return this.view().room.players.find((p) => p.id === id);
  }

  nameOf(id: string): string {
    const p = this.playerById(id);
    return p ? `${p.avatar} ${p.name}` : '???';
  }

  seenBadges(): PlayerBadge[] {
    return (this.game()?.seenCardIds ?? []).map((playerId) => ({ playerId, icon: '✓' }));
  }

  isRevealedCard(item: string): boolean {
    const g = this.game();
    return (g?.phase === 'reveal' || g?.phase === 'end') && g.lastOutcome?.card === item;
  }
}
