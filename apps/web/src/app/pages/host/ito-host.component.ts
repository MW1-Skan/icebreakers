/**
 * Ito — vue publique projetée (fiche 5.5) : thème + convention, vies d'équipe,
 * cartes à poser (dos) et frise des cartes révélées ✅/❌.
 */
import { Component, computed, input } from '@angular/core';
import type { ClientView, ItoPublicView, PlayerPublicView } from '@icebreakers/shared';
import { RecapBannerComponent } from '../../components/recap-banner.component';

@Component({
  selector: 'app-ito-host',
  imports: [RecapBannerComponent],
  template: `
    @if (game(); as g) {
      <div class="stage">
        <div class="phase-header">
          <h1 class="tv-title">{{ phaseTitle() }}</h1>
          <span class="tag">Manche {{ g.mancheIndex }}/{{ g.manchesTotal }}</span>
          <span class="lives" [attr.aria-label]="g.lives + ' vies restantes'">
            @for (i of livesArray(); track $index) {
              <span [class.lost]="$index >= g.lives">{{ $index < g.lives ? '❤️' : '🖤' }}</span>
            }
          </span>
        </div>

        @if (g.gapReduced && g.phase === 'play') {
          <p class="notice">📏 Écart minimal réduit à {{ g.effectiveGap }} (plage trop serrée pour l'effectif).</p>
        }
        @if (g.suggestWiderRange && g.phase === 'play') {
          <p class="notice warn">📐 Écart très faible — envie de repasser sur 1–100 ?</p>
        }

        @if (g.phase !== 'end') {
          <div class="theme card">
            <div class="muted">Thème</div>
            <div class="tv-huge theme-text">{{ g.theme }}</div>
            <div class="convention">1 = le moins · 100 = le plus</div>
          </div>
        }

        @switch (g.phase) {
          @case ('play') {
            <p class="instruction">Discutez, comparez… <strong>sans jamais dire de nombre !</strong> Le plus petit pose en premier.</p>
            <div class="hands">
              @for (id of g.holderIds; track id) {
                <span class="hand-card">🂠 {{ nameOf(id) }}</span>
              }
            </div>
          }
          @case ('mancheEnd') {
            <p class="instruction">Manche {{ g.mancheIndex }} terminée !</p>
          }
          @case ('end') {
            <div class="final card">
              <div class="lives-big">
                @for (i of livesArray(); track $index) {
                  <span>{{ $index < g.lives ? '❤️' : '🖤' }}</span>
                }
              </div>
              <div class="tv-huge" [class.win]="g.verdict?.victory" [class.lose]="!g.verdict?.victory">
                {{ g.verdict?.label }}
              </div>
              <p class="muted">{{ g.lives }}/{{ g.livesTotal }} vies — {{ g.verdict?.victory ? 'victoire !' : 'défaite…' }}</p>
            </div>
            @if (g.history; as history) {
              <div class="card">
                <h3>Les manches</h3>
                <ul class="history">
                  @for (h of history; track $index) {
                    <li>
                      <strong>{{ h.theme }}</strong>
                      <span class="muted">{{ h.livesLost === 0 ? 'sans faute ✨' : '−' + h.livesLost + ' vie' + (h.livesLost > 1 ? 's' : '') }}</span>
                      <span class="mini-frise">
                        @for (c of h.frise; track $index) {
                          <span class="mini-card" [attr.data-kind]="c.kind">{{ c.number }}</span>
                        }
                      </span>
                    </li>
                  }
                </ul>
              </div>
            }
            <app-recap-banner [recap]="view().room.recap" />
          }
        }

        @if (g.frise.length > 0 && g.phase !== 'end') {
          <div class="frise">
            @for (c of g.frise; track $index) {
              <div class="frise-card" [attr.data-kind]="c.kind">
                <span class="num">{{ c.number }}</span>
                <span class="who">{{ nameOf(c.playerId) }}</span>
                <span class="mark">{{ friseMark(c.kind) }}</span>
              </div>
            }
          </div>
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
      .lives {
        font-size: 1.6rem;
        letter-spacing: 0.15em;
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
      .theme {
        text-align: center;
      }
      .theme-text {
        color: var(--accent);
      }
      .convention {
        font-size: 1.2rem;
        font-weight: 700;
        color: var(--fg-muted);
      }
      .instruction {
        font-size: 1.4rem;
        text-align: center;
        margin: 0;
      }
      .hands {
        display: flex;
        gap: 0.7rem;
        flex-wrap: wrap;
        justify-content: center;
      }
      .hand-card {
        border: 1px solid var(--border);
        border-radius: 10px;
        padding: 0.4rem 0.9rem;
        font-size: 1.15rem;
        font-weight: 600;
        background: var(--bg-raised);
      }
      .frise {
        display: flex;
        gap: 0.7rem;
        flex-wrap: wrap;
        align-items: stretch;
      }
      .frise-card {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 0.15rem;
        border: 2px solid var(--ok);
        border-radius: 12px;
        padding: 0.5rem 0.9rem;
        min-width: 5.2rem;
        background: var(--bg-raised);
      }
      .frise-card[data-kind='error'] {
        border-color: var(--danger);
      }
      .frise-card[data-kind='discarded'] {
        border-color: var(--danger);
        border-style: dashed;
        opacity: 0.75;
      }
      .frise-card[data-kind='released'] {
        border-color: var(--fg-muted);
        border-style: dashed;
        opacity: 0.75;
      }
      .num {
        font-size: 1.9rem;
        font-weight: 900;
        font-variant-numeric: tabular-nums;
      }
      .who {
        font-size: 0.85rem;
      }
      .mark {
        font-size: 1rem;
      }
      .final {
        text-align: center;
        padding: 1.6rem;
      }
      .lives-big {
        font-size: 2.4rem;
        letter-spacing: 0.2em;
      }
      .win {
        color: var(--ok);
      }
      .lose {
        color: var(--danger);
      }
      .history {
        list-style: none;
        margin: 0;
        padding: 0;
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
      }
      .history li {
        display: flex;
        gap: 0.8rem;
        align-items: center;
        flex-wrap: wrap;
      }
      .mini-frise {
        display: flex;
        gap: 0.25rem;
      }
      .mini-card {
        border: 1px solid var(--ok);
        border-radius: 6px;
        padding: 0.05rem 0.4rem;
        font-variant-numeric: tabular-nums;
        font-weight: 700;
        font-size: 0.9rem;
      }
      .mini-card[data-kind='error'],
      .mini-card[data-kind='discarded'] {
        border-color: var(--danger);
        opacity: 0.8;
      }
      .mini-card[data-kind='released'] {
        border-color: var(--fg-muted);
        opacity: 0.8;
      }
    `,
  ],
})
export class ItoHostComponent {
  readonly view = input.required<ClientView>();

  readonly game = computed<ItoPublicView | undefined>(() => {
    const g = this.view().room.game;
    return g?.kind === 'ito' ? g : undefined;
  });

  readonly phaseTitle = computed(() => {
    switch (this.game()?.phase) {
      case 'play':
        return 'Ito — dans l’ordre croissant !';
      case 'mancheEnd':
        return 'Manche terminée';
      case 'end':
        return 'Verdict';
      default:
        return '';
    }
  });

  livesArray(): number[] {
    return Array.from({ length: this.game()?.livesTotal ?? 0 }, (_, i) => i);
  }

  playerById(id: string): PlayerPublicView | undefined {
    return this.view().room.players.find((p) => p.id === id);
  }

  nameOf(id: string): string {
    const p = this.playerById(id);
    return p ? `${p.avatar} ${p.name}` : '???';
  }

  friseMark(kind: string): string {
    switch (kind) {
      case 'posed':
        return '✅';
      case 'error':
        return '❌ −1 vie';
      case 'discarded':
        return 'défaussée';
      case 'released':
        return 'libérée';
      default:
        return '';
    }
  }
}
