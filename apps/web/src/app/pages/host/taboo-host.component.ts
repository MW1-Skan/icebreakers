/**
 * Taboo — vue publique projetée (fiche 5.6) : chrono géant, score du passage,
 * binôme actif, flash rouge + carte défaussée 3 s au buzz — JAMAIS la carte
 * en cours. Récap de passage et classement publics.
 */
import { Component, computed, effect, input, signal } from '@angular/core';
import type { ClientView, PlayerPublicView, TabooPublicView } from '@icebreakers/shared';
import { RecapBannerComponent } from '../../components/recap-banner.component';
import { TimerBadgeComponent } from '../../components/timer-badge.component';

@Component({
  selector: 'app-taboo-host',
  imports: [RecapBannerComponent, TimerBadgeComponent],
  template: `
    @if (game(); as g) {
      <div class="stage" [class.buzz-flash]="buzzFlash()">
        <div class="phase-header">
          <h1 class="tv-title">{{ phaseTitle() }}</h1>
          @if (g.current?.suddenDeath) {
            <span class="tag sudden">⚡ Mort subite</span>
          }
          <span class="tag">Passage {{ g.passagesPlayed + 1 }}/{{ g.passagesTotal }}</span>
          <app-timer-badge [timer]="view().room.timers[0]" [big]="true" />
        </div>

        @if (g.frozen) {
          <p class="notice warn">⏸ Orateur ou devineur déconnecté — chrono en pause (passage annulé dans 30 s).</p>
        }
        @if (g.noArbiters) {
          <p class="notice warn">👂 Plus aucun arbitre connecté — l'animateur arbitre à l'oreille.</p>
        }

        @if (buzzCard(); as buzzed) {
          <div class="buzz-card card" role="alert">
            <div class="buzz-title">🔔 BUZZ ! Carte défaussée :</div>
            <div class="buzz-word">{{ buzzed.word }}</div>
            <div class="buzz-forbidden">
              @for (f of buzzed.forbidden; track f) {
                <span>{{ f }}</span>
              }
            </div>
          </div>
        }

        @switch (g.phase) {
          @case ('prep') {
            @if (g.current; as cur) {
              <div class="reveal-card card">
                <div class="tv-title">{{ teamLabel(cur.teamIndex) }}</div>
                <p class="instruction">🎤 {{ nameOf(cur.oratorId) }} fait deviner {{ guessersLabel(cur.guesserIds) }}</p>
                <p class="muted">
                  {{ cur.durationSeconds }} s — +1 par trouvé, −1 par buzz{{ g.params.hardPass ? ', −1 par passe' : ', 0 par passe' }}.
                  Devineur{{ cur.guesserIds.length > 1 ? 's' : '' }} : éloigne-toi des écrans des arbitres 👀
                </p>
                <p class="muted">L'orateur lance le chrono quand il est prêt.</p>
              </div>
            }
          }
          @case ('live') {
            @if (g.current; as cur) {
              <div class="live-score">
                <span class="team-name">{{ teamLabel(cur.teamIndex) }}</span>
                <span class="score" [class.negative]="cur.score < 0">{{ cur.score }}</span>
                <span class="muted">{{ cur.playedCount }} carte{{ cur.playedCount > 1 ? 's' : '' }}</span>
              </div>
              <p class="instruction muted">La carte est sur les écrans de l'orateur et des arbitres — pas ici 😉</p>
            }
          }
          @case ('recap') {
            @if (g.recap; as recap) {
              <div class="reveal-card card">
                @if (recap.aborted) {
                  <div class="tv-title">Passage annulé</div>
                  <p class="muted">Il sera rejoué en fin de rotation (nouvelles cartes).</p>
                } @else {
                  <div class="tv-title">Score du passage : {{ recap.score }}</div>
                }
              </div>
              <div class="recap-cards">
                @for (p of recap.played; track $index) {
                  <div class="recap-card" [attr.data-outcome]="p.outcome">
                    <span class="mark">{{ outcomeMark(p.outcome) }}</span>
                    <span class="word">{{ p.card.word }}</span>
                    <span class="forbidden muted">{{ p.card.forbidden.join(' · ') }}</span>
                  </div>
                }
              </div>
            }
          }
          @case ('end') {
            <div class="final card">
              <h2 class="tv-title">Classement</h2>
              <ol>
                @for (t of g.totals; track t.teamIndex; let i = $index) {
                  <li [class.leader]="i === 0">
                    <span class="medal">{{ ['🥇', '🥈', '🥉'][i] ?? '·' }}</span>
                    {{ teamLabel(t.teamIndex) }}
                    <span class="total">{{ t.points }} pts</span>
                  </li>
                }
              </ol>
            </div>
            <app-recap-banner [recap]="view().room.recap" />
          }
        }

        @if (g.phase !== 'end' && g.upcoming.length > 0) {
          <p class="upcoming muted">
            À suivre :
            @for (u of g.upcoming; track $index) {
              <span>{{ teamLabel(u.teamIndex) }} ({{ nameOf(u.oratorId) }}){{ u.suddenDeath ? ' ⚡' : '' }}&nbsp;&nbsp;</span>
            }
          </p>
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
        border-radius: var(--radius);
        transition: box-shadow 150ms ease;
      }
      .stage.buzz-flash {
        box-shadow: 0 0 0 6px var(--danger);
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
      .sudden {
        border-color: var(--accent);
        color: var(--accent);
        font-weight: 700;
      }
      .notice {
        background: var(--bg-raised);
        border: 1px solid var(--accent);
        border-radius: 10px;
        padding: 0.5rem 1rem;
        margin: 0;
      }
      .buzz-card {
        text-align: center;
        border-color: var(--danger);
      }
      .buzz-title {
        color: var(--danger);
        font-weight: 800;
        font-size: 1.2rem;
      }
      .buzz-word {
        font-size: 2rem;
        font-weight: 900;
      }
      .buzz-forbidden {
        display: flex;
        gap: 0.8rem;
        justify-content: center;
        color: var(--danger);
        font-weight: 700;
      }
      .reveal-card {
        text-align: center;
        padding: 1.6rem;
      }
      .instruction {
        font-size: 1.3rem;
        text-align: center;
        margin: 0;
      }
      .live-score {
        display: flex;
        align-items: baseline;
        justify-content: center;
        gap: 1.4rem;
      }
      .team-name {
        font-size: 1.4rem;
        font-weight: 700;
      }
      .score {
        font-size: clamp(3rem, 10vw, 5rem);
        font-weight: 900;
        color: var(--ok);
        font-variant-numeric: tabular-nums;
      }
      .score.negative {
        color: var(--danger);
      }
      .recap-cards {
        display: flex;
        flex-direction: column;
        gap: 0.4rem;
      }
      .recap-card {
        display: flex;
        align-items: baseline;
        gap: 0.8rem;
        border: 1px solid var(--border);
        border-radius: 10px;
        padding: 0.4rem 0.9rem;
      }
      .recap-card[data-outcome='found'],
      .recap-card[data-outcome='buzzFound'] {
        border-color: var(--ok);
      }
      .recap-card[data-outcome='buzzed'] {
        border-color: var(--danger);
      }
      .recap-card .word {
        font-weight: 800;
        font-size: 1.15rem;
      }
      .recap-card .forbidden {
        font-size: 0.85rem;
        margin-left: auto;
      }
      .final ol {
        list-style: none;
        margin: 0;
        padding: 0;
        display: flex;
        flex-direction: column;
        gap: 0.35rem;
        font-size: 1.3rem;
      }
      .final li {
        display: flex;
        align-items: center;
        gap: 0.7rem;
        padding: 0.25rem 0.6rem;
        border-radius: 10px;
      }
      .final li.leader {
        background: var(--accent-soft);
        border: 1px solid var(--accent);
        font-weight: 800;
      }
      .medal {
        width: 1.6em;
        text-align: center;
      }
      .total {
        margin-left: auto;
        font-variant-numeric: tabular-nums;
        font-weight: 700;
      }
      .upcoming {
        border-top: 1px solid var(--border);
        padding-top: 0.5rem;
        margin: 0;
      }
    `,
  ],
})
export class TabooHostComponent {
  readonly view = input.required<ClientView>();
  readonly buzzFlash = signal(false);

  readonly game = computed<TabooPublicView | undefined>(() => {
    const g = this.view().room.game;
    return g?.kind === 'taboo' ? g : undefined;
  });

  /** La carte buzzée s'affiche 3 s (fiche 5.6) puis disparaît de la TV. */
  private readonly lastBuzzSeq = signal<number | undefined>(undefined);
  readonly buzzCard = computed(() => {
    const buzz = this.game()?.lastBuzz;
    return buzz && this.lastBuzzSeq() === buzz.cardSeq ? buzz.card : undefined;
  });

  constructor() {
    let hideTimer: ReturnType<typeof setTimeout> | undefined;
    effect(() => {
      const buzz = this.game()?.lastBuzz;
      if (buzz && this.lastBuzzSeq() !== buzz.cardSeq) {
        this.lastBuzzSeq.set(buzz.cardSeq);
        this.buzzFlash.set(true);
        clearTimeout(hideTimer);
        hideTimer = setTimeout(() => {
          this.lastBuzzSeq.set(undefined);
          this.buzzFlash.set(false);
        }, 3000);
      }
    });
  }

  readonly phaseTitle = computed(() => {
    switch (this.game()?.phase) {
      case 'prep':
        return 'Préparation';
      case 'live':
        return 'Taboo — top chrono !';
      case 'recap':
        return 'Récap du passage';
      case 'end':
        return 'Podium';
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

  teamLabel(teamIndex: number): string {
    const team = this.game()?.teams[teamIndex] ?? [];
    return team.map((id) => this.playerById(id)?.name ?? '?').join(' & ');
  }

  guessersLabel(ids: string[]): string {
    return ids.map((id) => this.nameOf(id)).join(' et ');
  }

  outcomeMark(outcome: string): string {
    switch (outcome) {
      case 'found':
        return '✓';
      case 'passed':
        return '→';
      case 'buzzed':
        return '🔔';
      case 'buzzCancelled':
        return '🔕';
      case 'buzzFound':
        return '🔕✓';
      default:
        return '·';
    }
  }
}
