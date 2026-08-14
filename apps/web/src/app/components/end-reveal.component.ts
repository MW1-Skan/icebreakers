/**
 * Révélation complète de fin de partie (fiche 5.1 étape 10) :
 * les deux mots, le rôle de chacun, le camp gagnant, les points suggérés.
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
            <td class="points">+{{ pointsOf(r.playerId) }} pts</td>
          </tr>
        }
      </tbody>
    </table>
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
      }
    `,
  ],
})
export class EndRevealComponent {
  readonly end = input.required<UndercoverEndView>();
  readonly players = input.required<PlayerPublicView[]>();

  readonly winnerText = computed(() => winnerLabel(this.end().winner));
  protected readonly roleLabel = roleLabel;

  nameOf(playerId: string): string {
    const p = this.players().find((x) => x.id === playerId);
    return p ? `${p.avatar} ${p.name}` : '???';
  }

  pointsOf(playerId: string): number {
    return this.end().points.find((p) => p.playerId === playerId)?.points ?? 0;
  }
}
