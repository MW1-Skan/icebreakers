/**
 * Récap de soirée (PRD §3.1) : bandeau des jeux joués dans la session,
 * par jeu — pas d'agrégation cross-jeux.
 */
import { Component, input } from '@angular/core';
import type { GameResult } from '@icebreakers/shared';

@Component({
  selector: 'app-recap-banner',
  template: `
    @if (recap().length > 0) {
      <div class="recap card">
        <h3>Récap de la session</h3>
        <ul>
          @for (r of recap(); track $index) {
            <li>
              <span class="game tag">{{ gameLabel(r.game) }}</span>
              <span class="summary">{{ r.summary }}</span>
              <span class="scorers muted">{{ topScorers(r) }}</span>
            </li>
          }
        </ul>
      </div>
    }
  `,
  styles: [
    `
      .recap ul {
        list-style: none;
        margin: 0;
        padding: 0;
        display: flex;
        flex-direction: column;
        gap: 0.4rem;
      }
      .recap li {
        display: flex;
        gap: 0.8rem;
        align-items: baseline;
        flex-wrap: wrap;
      }
      .summary {
        font-weight: 700;
      }
    `,
  ],
})
export class RecapBannerComponent {
  readonly recap = input.required<GameResult[]>();

  gameLabel(game: string): string {
    return game === 'undercover' ? 'Undercover' : game;
  }

  topScorers(result: GameResult): string {
    const winners = result.points.filter((p) => p.points > 0);
    if (winners.length === 0) return '';
    return winners.map((p) => `${p.avatar} ${p.name} +${p.points}`).join(' · ');
  }
}
