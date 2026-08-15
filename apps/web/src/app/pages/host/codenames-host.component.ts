/**
 * Codenames — vue publique projetée : la grille (couleurs révélées seulement),
 * les deux équipes avec compteurs, l'indice courant en géant. La clé complète
 * n'apparaît qu'en fin de manche (keyReveal). Aucun secret n'arrive ici.
 */
import { Component, computed, input } from '@angular/core';
import type { ClientView, CodenamesPublicView, CodenamesTeam, PlayerPublicView } from '@icebreakers/shared';
import { CODENAMES_TEAM_LABELS } from '@icebreakers/shared';
import { CodenamesGridComponent } from '../../components/codenames-grid.component';
import { RecapBannerComponent } from '../../components/recap-banner.component';
import { TimerBadgeComponent } from '../../components/timer-badge.component';

@Component({
  selector: 'app-codenames-host',
  imports: [CodenamesGridComponent, RecapBannerComponent, TimerBadgeComponent],
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

        @for (notice of view().room.notices; track notice.kind) {
          @if (notice.kind === 'contentRecycled') {
            <p class="notice">♻️ Contenu recyclé : tous les mots de ce mode ont été vus, on re-mélange.</p>
          }
        }
        @if (g.frozen) {
          <p class="notice warn">⏸ Déconnexion dans l'équipe active — le chrono est en pause.</p>
        }

        <div class="teams-bar">
          @for (team of [0, 1]; track team) {
            <div
              class="team card"
              [attr.data-team]="team"
              [class.active]="g.phase !== 'end' && g.activeTeam === team"
            >
              <span class="team-name">{{ teamLabel(team) }}s</span>
              <span class="left"><strong>{{ g.remaining[team] }}</strong> mots restants</span>
              <span class="members">
                @for (id of g.teams[team]; track id) {
                  <span class="member" [class.spymaster]="g.spymasters[team] === id">
                    @if (g.spymasters[team] === id) {
                      <span title="maître-espion">🎩</span>
                    }
                    {{ nameOf(id) }}
                  </span>
                }
              </span>
            </div>
          }
        </div>

        @switch (g.phase) {
          @case ('brief') {
            <p class="instruction">
              Les maîtres-espions consultent la clé sur leur écran 📱 — devineurs, éloignez-vous de
              leurs écrans 👀
            </p>
            <p class="muted seen">
              Clé consultée :
              @for (id of g.spymasters; track id) {
                <span class="tag" [class.ok-tag]="g.seenKeyIds.includes(id)">
                  {{ nameOf(id) }} {{ g.seenKeyIds.includes(id) ? '✓' : '…' }}
                </span>
              }
            </p>
            <p class="muted">
              Les {{ teamLabel(g.startingTeam) }}s commencent ({{ g.remaining[g.startingTeam] }} mots à
              trouver contre {{ g.remaining[1 - g.startingTeam] }}). L'animateur lance quand tout le monde est prêt.
            </p>
          }
          @case ('clue') {
            <p class="instruction">
              🤔 <strong [attr.data-team]="g.activeTeam" class="team-text">{{ teamLabel(g.activeTeam) }}s</strong> —
              {{ nameOf(g.spymasters[g.activeTeam]) }} prépare un indice…
            </p>
          }
          @case ('guess') {
            @if (g.currentClue; as clue) {
              <div class="clue-banner" [attr.data-team]="g.activeTeam">
                « {{ clue.word }} » — {{ clue.count }}
                <span class="guesses-left tag">{{ clue.guessesLeft }} touche{{ clue.guessesLeft > 1 ? 's' : '' }} restante{{ clue.guessesLeft > 1 ? 's' : '' }}</span>
              </div>
              <p class="muted center">Les devineurs {{ teamLabel(g.activeTeam) }}s touchent sur leurs écrans — débattez à voix haute !</p>
            }
          }
          @case ('end') {
            <div class="winner tv-title" [attr.data-team]="g.winner">
              {{ winnerLine() }}
            </div>
            @if (g.endedByAssassin) {
              <p class="assassin-line">☠️ Les {{ teamLabel(g.assassinTeam!) }}s ont touché l'assassin…</p>
            }
          }
        }

        <app-codenames-grid [cards]="g.cards" [key]="g.keyReveal" />

        @if (g.phase === 'end') {
          <section class="recap card">
            <h3>Récap des indices</h3>
            <ul class="clue-list">
              @for (clue of g.clues; track $index) {
                <li>
                  <span class="dot" [attr.data-team]="clue.team"></span>
                  <strong>{{ nameOf(clue.spymasterId) }}</strong> : « {{ clue.word }} » — {{ clue.count }}
                  <span class="results">
                    @for (guess of clue.guesses; track $index) {
                      <span class="tag guess" [attr.data-kind]="guess.kind">{{ wordOf(g, guess.cardIndex) }}</span>
                    }
                    @if (clue.stopped) {
                      <span class="tag">✋ stop</span>
                    }
                  </span>
                </li>
              }
            </ul>

            @if (g.cumulative; as cumulative) {
              <h3>{{ g.mancheIndex >= g.manchesTotal ? 'Classement de la série' : 'Cumul après cette manche' }}</h3>
              <ol class="cumulative">
                @for (row of cumulative; track row.playerId; let i = $index) {
                  <li [class.leader]="i === 0 && row.points > 0">
                    <span class="rank">{{ i + 1 }}</span>
                    <span>{{ nameOf(row.playerId) }}</span>
                    <span class="pts">{{ row.points }} pts</span>
                  </li>
                }
              </ol>
            } @else {
              <p class="muted points-line">
                {{ teamLabel(g.winner!) }}s : 3 pts chacun — {{ teamLabel(1 - g.winner!) }}s :
                {{ g.endedByAssassin ? '0 pt (assassin ☠️)' : '1 pt' }}.
              </p>
            }
          </section>
          @if (g.mancheIndex >= g.manchesTotal) {
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
        gap: 1.2rem;
        flex-wrap: wrap;
      }
      .phase-header h1 {
        margin: 0;
        flex: 1;
      }
      .notice {
        background: var(--bg-raised);
        border: 1px solid var(--info);
        border-radius: 10px;
        padding: 0.5rem 1rem;
        margin: 0;
      }
      .notice.warn {
        border-color: var(--accent);
      }
      .instruction {
        font-size: 1.4rem;
        margin: 0;
      }
      .center {
        text-align: center;
        margin: 0;
      }
      .teams-bar {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 0.9rem;
      }
      .team {
        display: flex;
        align-items: center;
        gap: 0.9rem;
        flex-wrap: wrap;
        padding: 0.6rem 1rem;
        border-width: 2px;
      }
      .team[data-team='0'] {
        border-color: color-mix(in srgb, var(--cn-red) 45%, var(--border));
      }
      .team[data-team='1'] {
        border-color: color-mix(in srgb, var(--cn-blue) 45%, var(--border));
      }
      .team.active[data-team='0'] {
        background: color-mix(in srgb, var(--cn-red) 14%, var(--bg-raised));
        border-color: var(--cn-red);
      }
      .team.active[data-team='1'] {
        background: color-mix(in srgb, var(--cn-blue) 14%, var(--bg-raised));
        border-color: var(--cn-blue);
      }
      .team-name {
        font-family: var(--font-display);
        font-weight: 700;
        font-size: 1.2rem;
      }
      .team[data-team='0'] .team-name {
        color: var(--cn-red);
      }
      .team[data-team='1'] .team-name {
        color: var(--cn-blue);
      }
      .members {
        display: flex;
        gap: 0.7rem;
        flex-wrap: wrap;
        margin-left: auto;
      }
      .member.spymaster {
        font-weight: 700;
      }
      .seen .tag.ok-tag {
        border-color: var(--ok);
        color: var(--ok);
      }
      .team-text[data-team='0'] {
        color: var(--cn-red);
      }
      .team-text[data-team='1'] {
        color: var(--cn-blue);
      }
      .clue-banner {
        text-align: center;
        font-family: var(--font-display);
        font-size: clamp(1.8rem, 5vw, 3.2rem);
        font-weight: 700;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 1rem;
        flex-wrap: wrap;
      }
      .clue-banner[data-team='0'] {
        color: var(--cn-red);
      }
      .clue-banner[data-team='1'] {
        color: var(--cn-blue);
      }
      .guesses-left {
        font-size: 1rem;
        font-family: var(--font-body);
        color: var(--fg);
      }
      .winner {
        text-align: center;
      }
      .winner[data-team='0'] {
        color: var(--cn-red);
      }
      .winner[data-team='1'] {
        color: var(--cn-blue);
      }
      .assassin-line {
        text-align: center;
        font-size: 1.3rem;
        font-weight: 700;
        margin: 0;
      }
      .recap h3 {
        margin-top: 0.4em;
      }
      .clue-list {
        list-style: none;
        margin: 0;
        padding: 0;
        display: flex;
        flex-direction: column;
        gap: 0.45rem;
      }
      .clue-list li {
        display: flex;
        align-items: baseline;
        gap: 0.5rem;
        flex-wrap: wrap;
      }
      .dot {
        width: 0.7em;
        height: 0.7em;
        border-radius: 50%;
        align-self: center;
      }
      .dot[data-team='0'] {
        background: var(--cn-red);
      }
      .dot[data-team='1'] {
        background: var(--cn-blue);
      }
      .results {
        display: inline-flex;
        gap: 0.3rem;
        flex-wrap: wrap;
      }
      .guess[data-kind='red'] {
        border-color: var(--cn-red);
        color: var(--cn-red);
      }
      .guess[data-kind='blue'] {
        border-color: var(--cn-blue);
        color: var(--cn-blue);
      }
      .guess[data-kind='neutral'] {
        border-color: var(--cn-neutral);
        color: var(--cn-neutral);
      }
      .guess[data-kind='assassin'] {
        border-color: var(--danger);
        color: var(--danger);
      }
      .cumulative {
        list-style: none;
        margin: 0;
        padding: 0;
        display: flex;
        flex-direction: column;
        gap: 0.35rem;
        font-size: 1.15rem;
      }
      .cumulative li {
        display: flex;
        align-items: center;
        gap: 0.8rem;
        padding: 0.25rem 0.6rem;
        border-radius: 10px;
      }
      .cumulative li.leader {
        background: color-mix(in srgb, var(--game-color, var(--accent)) 16%, var(--bg-raised));
        border: 1px solid var(--game-color, var(--accent));
        font-weight: 800;
      }
      .rank {
        width: 1.6em;
        height: 1.6em;
        display: grid;
        place-items: center;
        background: var(--bg-sunken);
        border-radius: 50%;
        font-size: 0.85em;
      }
      .pts {
        margin-left: auto;
        font-variant-numeric: tabular-nums;
        font-weight: 700;
      }
      .points-line {
        margin: 0;
      }
    `,
  ],
})
export class CodenamesHostComponent {
  readonly view = input.required<ClientView>();

  readonly game = computed<CodenamesPublicView | undefined>(() => {
    const g = this.view().room.game;
    return g?.kind === 'codenames' ? g : undefined;
  });

  readonly phaseTitle = computed(() => {
    const g = this.game();
    switch (g?.phase) {
      case 'brief':
        return 'Préparation';
      case 'clue':
        return 'Indice en préparation…';
      case 'guess':
        return 'Devinettes !';
      case 'end':
        return g.manchesTotal > 1 && g.mancheIndex < g.manchesTotal
          ? `Fin de la manche ${g.mancheIndex}`
          : 'Fin de partie';
      default:
        return '';
    }
  });

  teamLabel(team: number | CodenamesTeam): string {
    return CODENAMES_TEAM_LABELS[team as CodenamesTeam];
  }

  winnerLine(): string {
    const g = this.game();
    if (!g || g.winner === undefined) return '';
    const scores: [number, number] = [
      g.cards.filter((c) => c.revealed && c.kind === 'red').length,
      g.cards.filter((c) => c.revealed && c.kind === 'blue').length,
    ];
    if (g.endedByAssassin) return `Les ${this.teamLabel(g.winner)}s gagnent !`;
    return `Les ${this.teamLabel(g.winner)}s gagnent ${scores[g.winner]}–${scores[1 - g.winner]} !`;
  }

  playerById(id: string): PlayerPublicView | undefined {
    return this.view().room.players.find((p) => p.id === id);
  }

  nameOf(id: string): string {
    const p = this.playerById(id);
    return p ? `${p.avatar} ${p.name}` : '???';
  }

  wordOf(g: CodenamesPublicView, cardIndex: number): string {
    return g.cards[cardIndex]?.word ?? '?';
  }
}
