/**
 * Grille des joueurs pour l'écran projeté : état lisible sans couleur seule
 * (icônes ✓ / ⏳ / ✖ + libellés), joueur en cours surligné.
 */
import { Component, input } from '@angular/core';
import type { PlayerPublicView } from '@icebreakers/shared';

export interface PlayerBadge {
  playerId: string;
  icon: string;
  label?: string;
}

@Component({
  selector: 'app-players-grid',
  template: `
    <ul class="players" [class.compact]="compact()">
      @for (p of players(); track p.id) {
        <li
          class="player"
          [class.off]="!p.connected"
          [class.dead]="deadIds().includes(p.id)"
          [class.current]="p.id === highlightId()"
        >
          <span class="avatar" aria-hidden="true">{{ p.avatar }}</span>
          <span class="name">{{ p.name }}</span>
          @if (!p.connected) {
            <span class="state" title="déconnecté">⏳</span>
          }
          @if (deadIds().includes(p.id)) {
            <span class="state" title="éliminé">✖</span>
          }
          @if (badgeFor(p.id); as badge) {
            <span class="state">{{ badge.icon }}</span>
          }
        </li>
      }
    </ul>
  `,
  styles: [
    `
      .players {
        list-style: none;
        margin: 0;
        padding: 0;
        display: flex;
        flex-wrap: wrap;
        gap: 0.7rem;
      }
      .player {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        background: var(--bg-raised);
        border: 2px solid var(--border);
        border-radius: 999px;
        padding: 0.35rem 0.9rem;
        font-size: 1.15rem;
        font-weight: 600;
      }
      .compact .player {
        font-size: 1rem;
        padding: 0.2rem 0.7rem;
      }
      .avatar {
        font-size: 1.4em;
      }
      .player.current {
        border-color: var(--game-color, var(--accent));
        background: color-mix(in srgb, var(--game-color, var(--accent)) 16%, var(--bg-raised));
        box-shadow: 0 0 0 3px color-mix(in srgb, var(--game-color, var(--accent)) 25%, transparent);
      }
      .player.off {
        opacity: 0.55;
      }
      .player.dead {
        opacity: 0.45;
        text-decoration: line-through;
      }
      .state {
        font-size: 1.1em;
      }
    `,
  ],
})
export class PlayersGridComponent {
  readonly players = input.required<PlayerPublicView[]>();
  readonly highlightId = input<string | undefined>(undefined);
  readonly deadIds = input<string[]>([]);
  readonly badges = input<PlayerBadge[]>([]);
  readonly compact = input(false);

  badgeFor(playerId: string): PlayerBadge | undefined {
    return this.badges().find((b) => b.playerId === playerId);
  }
}
