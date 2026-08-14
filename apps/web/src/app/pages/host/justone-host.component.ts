/**
 * Just One — vue publique projetée (fiche 5.3). Le devineur regarde cette TV :
 * elle n'affiche QUE des compteurs avant la résolution (ni mot, ni indices).
 */
import { Component, computed, input } from '@angular/core';
import type { ClientView, JustOnePublicView, PlayerPublicView } from '@icebreakers/shared';
import { PlayersGridComponent, PlayerBadge } from '../../components/players-grid.component';
import { RecapBannerComponent } from '../../components/recap-banner.component';
import { TimerBadgeComponent } from '../../components/timer-badge.component';

@Component({
  selector: 'app-justone-host',
  imports: [PlayersGridComponent, RecapBannerComponent, TimerBadgeComponent],
  template: `
    @if (game(); as g) {
      <div class="stage">
        <div class="phase-header">
          <h1 class="tv-title">{{ phaseTitle() }}</h1>
          <span class="tag">Manche {{ g.mancheIndex }}/{{ g.manchesTotal }}</span>
          <span class="tag score-tag">Score : {{ g.score }}</span>
          <app-timer-badge [timer]="view().room.timers[0]" [big]="true" />
        </div>

        @if (g.guesserFrozen) {
          <p class="notice warn">⏸ Le devineur est déconnecté — manche gelée (annulée dans 60 s s'il ne revient pas).</p>
        }
        @for (notice of view().room.notices; track notice.kind) {
          @if (notice.kind === 'fewActivePlayers') {
            <p class="notice warn">😕 Moins de 3 joueurs actifs — la manche vaut le coup d'œil, mais un autre jeu serait plus fun.</p>
          }
          @if (notice.kind === 'contentRecycled') {
            <p class="notice">♻️ Contenu recyclé : tous les mots de ce mode ont été vus, on re-mélange.</p>
          }
        }

        <div class="roles-line">
          <span class="role-chip guesser">🎯 {{ nameOf(g.guesserId) }} devine</span>
          <span class="role-chip">⚖️ {{ nameOf(g.arbiterId) }} arbitre la manche</span>
        </div>

        @switch (g.phase) {
          @case ('write') {
            <div class="tv-huge counter">{{ g.cluesSubmitted }}/{{ g.giversExpected }} indices écrits</div>
            <p class="instruction">Un seul mot chacun — les indices identiques ou trop proches s'annuleront !</p>
          }
          @case ('validate') {
            <div class="tv-huge counter">Vérification des indices…</div>
            <p class="instruction">
              Les donneurs comparent leurs indices ({{ g.giversReady }}/{{ g.giversExpected }} prêts).
              @if (g.cancelledClues > 0) {
                <span>{{ g.cancelledClues }} déjà annulé{{ g.cancelledClues > 1 ? 's' : '' }}.</span>
              }
            </p>
          }
          @case ('guess') {
            <div class="tv-huge counter">{{ g.remainingClues }} indice{{ g.remainingClues > 1 ? 's' : '' }} restant{{ g.remainingClues > 1 ? 's' : '' }}</div>
            @if (g.cancelledClues > 0) {
              <p class="instruction">{{ g.cancelledClues }} annulé{{ g.cancelledClues > 1 ? 's' : '' }} (masqués). À toi {{ nameOf(g.guesserId) }} !</p>
            } @else {
              <p class="instruction">À toi {{ nameOf(g.guesserId) }} !</p>
            }
          }
          @case ('arbitrate') {
            <div class="reveal-card card">
              <p class="muted">Réponse proposée :</p>
              <div class="tv-title proposal">« {{ g.guess }} »</div>
              <p class="instruction">C'est proche… {{ nameOf(g.arbiterId) }} tranche ⚖️</p>
            </div>
          }
          @case ('resolve') {
            <div class="reveal-card card">
              <p class="muted">Le mot était</p>
              <div class="tv-huge word">{{ g.revealedWord }}</div>
              @if (g.guess) {
                <p class="muted">Réponse : « {{ g.guess }} »</p>
              }
              <div class="verdict" [attr.data-outcome]="g.outcome">{{ outcomeLabel() }}</div>
            </div>
          }
          @case ('end') {
            <div class="final card">
              <div class="tv-huge">{{ g.score }}/{{ g.manchesTotal }}</div>
              <div class="tv-title">{{ g.scoreLabel }}</div>
            </div>
            @if (g.history; as history) {
              <table class="history">
                <tbody>
                  @for (h of history; track $index) {
                    <tr>
                      <td class="idx">{{ $index + 1 }}</td>
                      <td class="word-cell">{{ h.word }}</td>
                      <td class="who muted">{{ nameOf(h.guesserId) }}</td>
                      <td class="clues-cell">
                        @for (c of h.clues; track c.giverId) {
                          <span class="clue" [class.cancelled]="c.cancelledAuto || c.cancelledManual">{{ c.text }}</span>
                        }
                      </td>
                      <td class="outcome" [attr.data-outcome]="h.outcome">{{ shortOutcome(h.outcome, h.delta) }}</td>
                    </tr>
                  }
                </tbody>
              </table>
            }
            <app-recap-banner [recap]="view().room.recap" />
          }
        }

        @if (g.phase !== 'end') {
          <app-players-grid [players]="view().room.players" [highlightId]="g.guesserId" [badges]="readyBadges()" [compact]="true" />
        }
      </div>
    }
  `,
  styles: [
    `
      .stage {
        display: flex;
        flex-direction: column;
        gap: 1.2rem;
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
      .score-tag {
        color: var(--accent);
        border-color: var(--accent);
        font-weight: 700;
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
      .roles-line {
        display: flex;
        gap: 1rem;
        flex-wrap: wrap;
      }
      .role-chip {
        border: 1px solid var(--border);
        border-radius: 999px;
        padding: 0.3rem 1rem;
        font-size: 1.15rem;
        font-weight: 600;
      }
      .role-chip.guesser {
        border-color: var(--accent);
        background: #2b2a1a;
      }
      .counter {
        text-align: center;
        margin: 0.5rem 0;
      }
      .instruction {
        font-size: 1.4rem;
        text-align: center;
        margin: 0;
      }
      .reveal-card {
        text-align: center;
        padding: 2rem;
      }
      .proposal {
        color: var(--info);
      }
      .word {
        color: var(--accent);
      }
      .verdict {
        font-size: 2rem;
        font-weight: 900;
        margin-top: 0.6rem;
      }
      .verdict[data-outcome='correct'] {
        color: var(--ok);
      }
      .verdict[data-outcome='wrong'] {
        color: var(--danger);
      }
      .final {
        text-align: center;
        padding: 1.6rem;
      }
      .final .tv-huge {
        color: var(--accent);
      }
      .history {
        width: 100%;
        border-collapse: collapse;
        font-size: 1.05rem;
      }
      .history td {
        padding: 0.4rem 0.6rem;
        border-bottom: 1px solid var(--border);
        vertical-align: top;
      }
      .idx {
        color: var(--fg-muted);
      }
      .word-cell {
        font-weight: 800;
        white-space: nowrap;
      }
      .clues-cell {
        display: flex;
        flex-wrap: wrap;
        gap: 0.4rem;
      }
      .clue {
        border: 1px solid var(--border);
        border-radius: 999px;
        padding: 0.1rem 0.6rem;
      }
      .clue.cancelled {
        text-decoration: line-through;
        opacity: 0.55;
      }
      .outcome {
        font-weight: 800;
        white-space: nowrap;
      }
      .outcome[data-outcome='correct'] {
        color: var(--ok);
      }
      .outcome[data-outcome='wrong'] {
        color: var(--danger);
      }
    `,
  ],
})
export class JustOneHostComponent {
  readonly view = input.required<ClientView>();

  readonly game = computed<JustOnePublicView | undefined>(() => {
    const g = this.view().room.game;
    return g?.kind === 'justone' ? g : undefined;
  });

  readonly phaseTitle = computed(() => {
    switch (this.game()?.phase) {
      case 'write':
        return 'Écriture des indices';
      case 'validate':
        return 'Vérification des indices';
      case 'guess':
        return 'Devinette !';
      case 'arbitrate':
        return 'Arbitrage…';
      case 'resolve':
        return 'Résolution';
      case 'end':
        return 'Score final';
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

  outcomeLabel(): string {
    switch (this.game()?.outcome) {
      case 'correct':
        return '✔ Trouvé ! +1';
      case 'wrong':
        return '✘ Raté…';
      case 'pass':
        return '→ Passé (0)';
      case 'timeout':
        return '⏱ Temps écoulé (0)';
      case 'aborted':
        return 'Manche annulée (devineur absent)';
      default:
        return '';
    }
  }

  shortOutcome(outcome: string, delta: number): string {
    switch (outcome) {
      case 'correct':
        return '✔ +1';
      case 'wrong':
        return delta < 0 ? '✘ −1' : '✘ 0';
      case 'pass':
        return '→ 0';
      case 'timeout':
        return '⏱ 0';
      default:
        return '∅';
    }
  }

  readyBadges(): PlayerBadge[] {
    const g = this.game();
    if (!g || g.phase !== 'validate') return [];
    // le compte des prêts est public ; qui précisément l'est n'a rien de secret,
    // mais la fiche n'affiche que le compteur — on s'y tient (pas de badge).
    return [];
  }
}
