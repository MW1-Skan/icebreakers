/**
 * Wavelength — vue publique projetée (fiche 5.2). Cadran vide pendant la
 * manche (la cible est chez le seul télépathe), révélation d'un coup :
 * cible + zones + curseurs nominatifs + points + cumul.
 */
import { Component, computed, input } from '@angular/core';
import type { ClientView, PlayerPublicView, WavelengthPublicView } from '@icebreakers/shared';
import { RecapBannerComponent } from '../../components/recap-banner.component';
import { TimerBadgeComponent } from '../../components/timer-badge.component';
import { DialMarker, WavelengthDialComponent } from '../../components/wavelength-dial.component';

@Component({
  selector: 'app-wavelength-host',
  imports: [RecapBannerComponent, TimerBadgeComponent, WavelengthDialComponent],
  template: `
    @if (game(); as g) {
      <div class="stage">
        <div class="phase-header">
          <h1 class="tv-title">{{ phaseTitle() }}</h1>
          <span class="tag">Manche {{ g.mancheNumber }}/{{ g.manchesPlanned }}</span>
          <app-timer-badge [timer]="view().room.timers[0]" [big]="true" />
        </div>

        @for (notice of view().room.notices; track notice.kind) {
          @if (notice.kind === 'fewActivePlayers') {
            <p class="notice warn">😕 Moins de 3 joueurs actifs — la partie patiente…</p>
          }
        }

        <div class="roles-line">
          <span class="role-chip telepath">🧠 {{ nameOf(g.telepathId) }} est le télépathe</span>
        </div>

        @switch (g.phase) {
          @case ('clue') {
            <app-wavelength-dial [left]="g.axis.left" [right]="g.axis.right" />
            <p class="instruction">🤫 {{ nameOf(g.telepathId) }} réfléchit à son indice…</p>
          }
          @case ('place') {
            <app-wavelength-dial [left]="g.axis.left" [right]="g.axis.right" />
            <div class="clue-banner">« {{ g.clue }} »</div>
            <div class="tv-huge counter">{{ g.placedCount }}/{{ g.placersExpected }} ont placé</div>
            <p class="instruction muted">Chacun place SA cible en secret — le télépathe reste muet.</p>
          }
          @case ('reveal') {
            @if (g.lastResult; as r) {
              <div class="clue-banner">« {{ r.clue }} »</div>
              <app-wavelength-dial
                [left]="r.axis.left"
                [right]="r.axis.right"
                [target]="r.target"
                [zoneWidth]="g.zoneWidth"
                [markers]="revealMarkers()"
              />
              <div class="points-line">
                @for (res of r.results; track res.playerId) {
                  <span class="pt-chip" [class.zero]="res.points === 0">{{ nameOf(res.playerId) }} +{{ res.points }}</span>
                }
                <span class="pt-chip telepath-chip">🧠 {{ nameOf(r.telepathId) }} +{{ r.telepathPoints }}</span>
              </div>
              <p class="instruction">💬 Discussion libre</p>
              {{ '' }}
              <div class="totals card">
                <h3>Cumul</h3>
                <ol>
                  @for (t of g.totals; track t.playerId; let i = $index) {
                    <li [class.leader]="i === 0 && t.points > 0">
                      <span class="rank">{{ i + 1 }}</span>
                      {{ nameOf(t.playerId) }}
                      <span class="total">{{ t.points }} pts</span>
                    </li>
                  }
                </ol>
              </div>
            }
          }
          @case ('aborted') {
            <div class="card reveal-card">
              <div class="tv-title">Manche annulée</div>
              <p class="muted">Le télépathe s'est déconnecté avant l'indice — la manche sera rejouée s'il revient.</p>
            </div>
          }
          @case ('end') {
            <div class="podium card">
              <h2 class="tv-title">Classement final</h2>
              <ol>
                @for (t of g.totals; track t.playerId; let i = $index) {
                  <li [class.first]="i === 0" [class.podium-row]="i < 3">
                    <span class="medal">{{ ['🥇', '🥈', '🥉'][i] ?? '·' }}</span>
                    {{ nameOf(t.playerId) }}
                    <span class="total">{{ t.points }} pts</span>
                  </li>
                }
              </ol>
            </div>
            @if (g.history; as history) {
              <div class="card">
                <h3>Récap des indices</h3>
                <ul class="history">
                  @for (h of history; track $index) {
                    <li>
                      <span class="axis muted">{{ h.axis.left }} ↔ {{ h.axis.right }}</span>
                      @if (h.aborted) {
                        <span class="tag">annulée</span>
                      } @else {
                        <strong>« {{ h.clue }} »</strong>
                        <span class="muted">({{ nameOf(h.telepathId) }}, cible {{ h.target }})</span>
                      }
                    </li>
                  }
                </ul>
              </div>
            }
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
      .notice {
        background: var(--bg-raised);
        border: 1px solid var(--accent);
        border-radius: 10px;
        padding: 0.5rem 1rem;
        margin: 0;
      }
      .roles-line {
        display: flex;
        gap: 1rem;
      }
      .role-chip {
        border: 1px solid var(--accent);
        background: var(--accent-soft);
        border-radius: 999px;
        padding: 0.3rem 1rem;
        font-size: 1.15rem;
        font-weight: 700;
      }
      .instruction {
        font-size: 1.35rem;
        text-align: center;
        margin: 0;
      }
      .clue-banner {
        text-align: center;
        font-size: clamp(1.6rem, 4vw, 2.6rem);
        font-weight: 800;
        color: var(--info);
      }
      .counter {
        text-align: center;
      }
      .points-line {
        display: flex;
        gap: 0.6rem;
        flex-wrap: wrap;
        justify-content: center;
      }
      .pt-chip {
        border: 1px solid var(--ok);
        color: var(--ok);
        border-radius: 999px;
        padding: 0.2rem 0.8rem;
        font-weight: 700;
      }
      .pt-chip.zero {
        border-color: var(--border);
        color: var(--fg-muted);
      }
      .telepath-chip {
        border-color: var(--accent);
        color: var(--accent);
      }
      .totals ol,
      .podium ol {
        list-style: none;
        margin: 0;
        padding: 0;
        display: flex;
        flex-direction: column;
        gap: 0.35rem;
        font-size: 1.15rem;
      }
      .totals li,
      .podium li {
        display: flex;
        align-items: center;
        gap: 0.7rem;
        padding: 0.25rem 0.6rem;
        border-radius: 10px;
      }
      .totals li.leader,
      .podium li.first {
        background: var(--accent-soft);
        border: 1px solid var(--accent);
        font-weight: 800;
      }
      .podium li.podium-row {
        font-size: 1.35rem;
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
      .reveal-card {
        text-align: center;
        padding: 2rem;
      }
      .history {
        list-style: none;
        margin: 0;
        padding: 0;
        display: flex;
        flex-direction: column;
        gap: 0.4rem;
      }
      .history li {
        display: flex;
        gap: 0.7rem;
        align-items: baseline;
        flex-wrap: wrap;
      }
      .medal {
        width: 1.6em;
        text-align: center;
      }
    `,
  ],
})
export class WavelengthHostComponent {
  readonly view = input.required<ClientView>();

  readonly game = computed<WavelengthPublicView | undefined>(() => {
    const g = this.view().room.game;
    return g?.kind === 'wavelength' ? g : undefined;
  });

  readonly phaseTitle = computed(() => {
    switch (this.game()?.phase) {
      case 'clue':
        return 'Tirage & indice';
      case 'place':
        return 'Placement secret';
      case 'reveal':
        return 'Révélation !';
      case 'aborted':
        return 'Manche annulée';
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

  revealMarkers(): DialMarker[] {
    const r = this.game()?.lastResult;
    if (!r) return [];
    return r.results.map((res) => ({
      label: this.playerById(res.playerId)?.name ?? '?',
      value: res.value,
      points: res.points,
    }));
  }
}
