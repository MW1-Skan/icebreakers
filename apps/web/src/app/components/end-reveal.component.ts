/**
 * Révélation complète de fin de manche (fiche 5.1 étape 10) :
 * les deux mots, le rôle de chacun, le camp gagnant, les points de la manche
 * (avec le badge 🎯 de « bon vote » des civils) et le cumul de la série.
 */
import { Component, computed, input } from '@angular/core';
import type { PlayerPublicView, UndercoverEndView } from '@icebreakers/shared';
import { roleLabel, winnerLabel } from '../core/ui';

@Component({
  selector: 'app-end-reveal',
  template: `
    <div class="winner tv-title" [attr.data-winner]="end().winner">{{ winnerText() }}</div>

    <div class="words">
      <div class="word card" [class.civil]="end().words.civilianWord === 'a'">
        <span class="which">{{ end().words.civilianWord === 'a' ? 'Mot des civils' : 'Mot des undercover' }}</span>
        <span class="value">{{ end().words.a }}</span>
      </div>
      <div class="word card" [class.civil]="end().words.civilianWord === 'b'">
        <span class="which">{{ end().words.civilianWord === 'b' ? 'Mot des civils' : 'Mot des undercover' }}</span>
        <span class="value">{{ end().words.b }}</span>
      </div>
    </div>

    <table class="reveal">
      <tbody>
        @for (r of end().roles; track r.playerId) {
          <tr>
            <td class="who">{{ nameOf(r.playerId) }}</td>
            <td class="role">{{ roleLabel(r.role) }}</td>
            <td class="word-cell">{{ r.word ?? '—' }}</td>
            <td class="points">
              @if (goodVoteOf(r.playerId)) {
                <span class="bonus" title="Bonus : a visé un infiltré au vote">🎯</span>
              }
              +{{ pointsOf(r.playerId) }} pt{{ pointsOf(r.playerId) > 1 ? 's' : '' }}
            </td>
          </tr>
        }
      </tbody>
    </table>
    @if (hasBonus()) {
      <p class="muted bonus-hint">🎯 = bonus de bon vote (+1) : a visé un infiltré pendant les votes.</p>
    }

    @if (showCumulative()) {
      <section class="cumulative card">
        <h3>{{ end().isFinalManche ? 'Classement final de la série' : 'Cumul après cette manche' }}</h3>
        <ol>
          @for (c of end().cumulative; track c.playerId; let i = $index) {
            <li [class.leader]="i === 0 && c.points > 0">
              <span class="rank">{{ i + 1 }}</span>
              <span class="name">{{ nameOf(c.playerId) }}</span>
              <span class="total">{{ c.points }} pts</span>
            </li>
          }
        </ol>
      </section>
    }
  `,
  styles: [
    `
      .winner {
        text-align: center;
        margin-bottom: 1rem;
      }
      .winner[data-winner='civilians'] {
        color: var(--ok);
      }
      .winner[data-winner='infiltrators'] {
        color: var(--danger);
      }
      .winner[data-winner='mrwhite'] {
        color: var(--accent);
      }
      .words {
        display: flex;
        gap: 1rem;
        justify-content: center;
        flex-wrap: wrap;
        margin-bottom: 1.2rem;
      }
      .word {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 0.2rem;
        min-width: 220px;
      }
      .word .which {
        color: var(--fg-muted);
        font-size: 0.9rem;
      }
      .word .value {
        font-size: 1.8rem;
        font-weight: 800;
      }
      .word.civil {
        border-color: var(--ok);
      }
      .reveal {
        width: 100%;
        border-collapse: collapse;
        font-size: 1.15rem;
      }
      .reveal td {
        padding: 0.45rem 0.8rem;
        border-bottom: 1px solid var(--border);
      }
      .who {
        font-weight: 700;
      }
      .points {
        text-align: right;
        font-variant-numeric: tabular-nums;
        white-space: nowrap;
      }
      .bonus {
        margin-right: 0.3em;
      }
      .bonus-hint {
        font-size: 0.85rem;
        text-align: right;
      }
      .cumulative {
        margin-top: 1.2rem;
      }
      .cumulative ol {
        list-style: none;
        margin: 0;
        padding: 0;
        display: flex;
        flex-direction: column;
        gap: 0.35rem;
        font-size: 1.2rem;
      }
      .cumulative li {
        display: flex;
        align-items: center;
        gap: 0.8rem;
        padding: 0.25rem 0.6rem;
        border-radius: 10px;
      }
      .cumulative li.leader {
        background: #2b2a1a;
        border: 1px solid var(--accent);
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
      .total {
        margin-left: auto;
        font-variant-numeric: tabular-nums;
        font-weight: 700;
      }
    `,
  ],
})
export class EndRevealComponent {
  readonly end = input.required<UndercoverEndView>();
  readonly players = input.required<PlayerPublicView[]>();
  readonly showCumulative = input(false);

  readonly winnerText = computed(() => winnerLabel(this.end().winner));
  readonly hasBonus = computed(() => this.end().points.some((p) => p.goodVote && p.points > 0));
  protected readonly roleLabel = roleLabel;

  nameOf(playerId: string): string {
    const p = this.players().find((x) => x.id === playerId);
    return p ? `${p.avatar} ${p.name}` : '???';
  }

  pointsOf(playerId: string): number {
    return this.end().points.find((p) => p.playerId === playerId)?.points ?? 0;
  }

  goodVoteOf(playerId: string): boolean {
    const row = this.end().points.find((p) => p.playerId === playerId);
    return !!row && row.goodVote && row.points > 0;
  }
}
