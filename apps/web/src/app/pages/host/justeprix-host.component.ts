/**
 * Juste Prix — vue publique projetée (fiche docs/fiches/juste-prix.md).
 * Estimation : la photo en grand, QUI a misé (jamais combien). Révélation
 * d'un coup : le prix, la frise des mises, le classement 3/2/1, le cumul.
 */
import { Component, computed, input, signal } from '@angular/core';
import type {
  ClientView,
  JustePrixBidResult,
  JustePrixPublicView,
  JustePrixRoundRecord,
  PlayerPublicView,
} from '@icebreakers/shared';
import { PlayersGridComponent, type PlayerBadge } from '../../components/players-grid.component';
import { PriceMarker, PriceScaleComponent } from '../../components/price-scale.component';
import { RecapBannerComponent } from '../../components/recap-banner.component';
import { TimerBadgeComponent } from '../../components/timer-badge.component';
import { formatDelta, formatEuros, hostnameOf } from '../../core/ui';

const MOIS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];

@Component({
  selector: 'app-justeprix-host',
  imports: [PlayersGridComponent, PriceScaleComponent, RecapBannerComponent, TimerBadgeComponent],
  template: `
    @if (game(); as g) {
      <div class="stage">
        <div class="phase-header">
          <h1 class="tv-title">{{ phaseTitle() }}</h1>
          @if (g.phase !== 'end') {
            <span class="tag">Article {{ g.itemNumber }}/{{ g.itemsCount }}</span>
          }
          @if (g.params.noOverbid) {
            <span class="tag" title="Une mise au-dessus du prix ne rapporte rien">💥 Sans dépasser</span>
          }
          <app-timer-badge [timer]="view().room.timers[0]" [big]="true" />
        </div>

        @for (notice of view().room.notices; track notice.kind) {
          @if (notice.kind === 'contentRecycled') {
            <p class="notice">♻️ Contenu recyclé : des articles déjà vus dans ce salon reviennent.</p>
          }
          @if (notice.kind === 'fewActivePlayers') {
            <p class="notice warn">😕 Moins de 3 joueurs actifs — la partie patiente…</p>
          }
        }

        @switch (g.phase) {
          @case ('guess') {
            @if (g.item; as item) {
              <div class="item-stage">
                <figure class="photo">
                  @if (imageOk(item.image)) {
                    <img [src]="item.image" [alt]="item.name" referrerpolicy="no-referrer" (error)="markBroken(item.image)" />
                  } @else {
                    <div class="photo-fallback">📷 Image indisponible</div>
                  }
                </figure>
                <div class="item-info">
                  <h2 class="item-name">{{ item.name }}</h2>
                  @if (item.details) {
                    <p class="item-details">{{ item.details }}</p>
                  }
                  <div class="tv-huge counter">{{ g.bidderIds.length }}/{{ g.biddersExpected }} ont misé</div>
                  <p class="instruction muted">Débattez à voix haute… mais chacun mise seul, en secret, sur son écran.</p>
                </div>
              </div>
              <app-players-grid [players]="inGamePlayers()" [badges]="bidBadges()" />
            }
          }
          @case ('reveal') {
            @if (g.lastResult; as r) {
              <div class="reveal-stage">
                <figure class="photo small">
                  @if (imageOk(r.item.image)) {
                    <img [src]="r.item.image" [alt]="r.item.name" referrerpolicy="no-referrer" (error)="markBroken(r.item.image)" />
                  } @else {
                    <div class="photo-fallback">📷</div>
                  }
                </figure>
                <div class="reveal-info">
                  <h2 class="item-name">{{ r.item.name }}</h2>
                  <div class="price" data-testid="justeprix-price">{{ euros(r.item.price) }}</div>
                  @if (hasBullseye(r)) {
                    <div class="bullseye">🎯 LE JUSTE PRIX !</div>
                  }
                  @if (provenance(r); as prov) {
                    <p class="muted provenance">{{ prov }}</p>
                  }
                  @if (r.item.credit) {
                    <p class="muted credit">{{ r.item.credit }}</p>
                  }
                </div>
              </div>

              @if (r.results.length > 0) {
                <app-price-scale [price]="r.item.price" [markers]="scaleMarkers(r)" [noOverbid]="g.params.noOverbid" />
              }

              <table class="ranking">
                <tbody>
                  @for (res of r.results; track res.playerId) {
                    <tr [class.scored]="res.points > 0">
                      <td class="medal">{{ medalOf(res) }}</td>
                      <td class="who">{{ nameOf(res.playerId) }}</td>
                      <td class="amount">{{ euros(res.amount) }}</td>
                      <td class="delta muted">{{ delta(res.delta) }}</td>
                      <td class="pts">
                        @if (res.overbid && g.params.noOverbid) {
                          💥 dépassé
                        } @else {
                          +{{ res.points }} pt{{ res.points > 1 ? 's' : '' }}
                        }
                      </td>
                    </tr>
                  }
                  @for (id of missingBidders(r); track id) {
                    <tr class="missing">
                      <td class="medal">·</td>
                      <td class="who">{{ nameOf(id) }}</td>
                      <td class="amount muted">—</td>
                      <td class="delta"></td>
                      <td class="pts muted">pas de mise</td>
                    </tr>
                  }
                </tbody>
              </table>

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
          @case ('end') {
            <div class="podium card">
              <h2 class="tv-title">Classement final</h2>
              <ol>
                @for (t of g.totals; track t.playerId; let i = $index) {
                  <li [class.first]="i === 0" [class.podium-row]="i < 3">
                    <span class="medal">{{ podiumMedal(i) }}</span>
                    {{ nameOf(t.playerId) }}
                    <span class="total">{{ t.points }} pts</span>
                  </li>
                }
              </ol>
            </div>
            @if (g.history; as history) {
              <div class="card">
                <h3>Récap des articles</h3>
                <ul class="history">
                  @for (h of history; track h.itemNumber) {
                    <li>
                      @if (imageOk(h.item.image)) {
                        <img class="thumb" [src]="h.item.image" alt="" referrerpolicy="no-referrer" (error)="markBroken(h.item.image)" />
                      } @else {
                        <span class="thumb fallback">📷</span>
                      }
                      <span class="h-name">{{ h.item.name }}</span>
                      <strong class="h-price">{{ euros(h.item.price) }}</strong>
                      <span class="muted h-best">{{ bestLine(h) }}</span>
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
      .item-stage,
      .reveal-stage {
        display: grid;
        grid-template-columns: minmax(0, 3fr) minmax(0, 2fr);
        gap: 1.6rem;
        align-items: center;
      }
      .reveal-stage {
        grid-template-columns: auto minmax(0, 1fr);
      }
      @media (max-width: 900px) {
        .item-stage,
        .reveal-stage {
          grid-template-columns: 1fr;
        }
      }
      .photo {
        margin: 0;
        display: grid;
        place-items: center;
        background: #fff;
        border-radius: var(--radius);
        padding: 1rem;
        height: min(56vh, 520px);
        box-shadow: 0 6px 0 rgba(0, 0, 0, 0.35);
      }
      .photo img {
        max-width: 100%;
        max-height: 100%;
        object-fit: contain;
      }
      .photo.small {
        height: 220px;
        width: 260px;
      }
      .photo-fallback {
        color: #555;
        font-size: 1.4rem;
        font-weight: 700;
      }
      .item-info,
      .reveal-info {
        display: flex;
        flex-direction: column;
        gap: 0.8rem;
      }
      .item-name {
        margin: 0;
        font-family: var(--font-display);
        font-size: clamp(1.8rem, 3.6vw, 2.8rem);
        line-height: 1.15;
      }
      .item-details {
        margin: 0;
        font-size: 1.35rem;
        color: var(--fg-muted);
      }
      .counter {
        color: var(--game-color, var(--accent));
      }
      .instruction {
        font-size: 1.2rem;
        margin: 0;
      }
      .price {
        font-family: var(--font-display);
        font-size: clamp(3rem, 8vw, 5.5rem);
        font-weight: 800;
        line-height: 1;
        color: var(--game-color, var(--accent));
        font-variant-numeric: tabular-nums;
      }
      .bullseye {
        font-size: 1.8rem;
        font-weight: 900;
        color: var(--ok);
      }
      .provenance,
      .credit {
        margin: 0;
      }
      .credit {
        font-size: 0.85rem;
      }
      .ranking {
        width: 100%;
        border-collapse: collapse;
        font-size: 1.25rem;
      }
      .ranking td {
        padding: 0.35rem 0.6rem;
        border-bottom: 1px solid var(--border);
      }
      .ranking tr.scored .pts {
        color: var(--ok);
        font-weight: 800;
      }
      .ranking .amount,
      .ranking .delta,
      .ranking .pts {
        text-align: right;
        font-variant-numeric: tabular-nums;
      }
      .ranking .medal {
        width: 2.2em;
        text-align: center;
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
        background: color-mix(in srgb, var(--game-color, var(--accent)) 16%, var(--bg-raised));
        border: 1px solid var(--game-color, var(--accent));
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
      .medal {
        width: 1.6em;
        text-align: center;
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
      .thumb {
        width: 48px;
        height: 48px;
        object-fit: contain;
        background: #fff;
        border-radius: 8px;
        display: grid;
        place-items: center;
      }
      .h-price {
        color: var(--game-color, var(--accent));
      }
    `,
  ],
})
export class JustePrixHostComponent {
  readonly view = input.required<ClientView>();

  /** URLs d'images qui n'ont pas pu se charger (lien mort, hotlink refusé). */
  private readonly brokenImages = signal<ReadonlySet<string>>(new Set());

  readonly game = computed<JustePrixPublicView | undefined>(() => {
    const g = this.view().room.game;
    return g?.kind === 'justeprix' ? g : undefined;
  });

  readonly phaseTitle = computed(() => {
    switch (this.game()?.phase) {
      case 'guess':
        return 'Combien ça coûte ?';
      case 'reveal':
        return 'Le juste prix !';
      case 'end':
        return 'Podium';
      default:
        return '';
    }
  });

  /** Joueurs de la partie (les retardataires spectateurs n'y figurent pas). */
  readonly inGamePlayers = computed<PlayerPublicView[]>(() => {
    const ids = new Set(this.game()?.totals.map((t) => t.playerId) ?? []);
    return this.view().room.players.filter((p) => ids.has(p.id));
  });

  readonly bidBadges = computed<PlayerBadge[]>(
    () => this.game()?.bidderIds.map((playerId) => ({ playerId, icon: '✓', label: 'a misé' })) ?? [],
  );

  imageOk(url: string): boolean {
    return !this.brokenImages().has(url);
  }

  markBroken(url: string): void {
    this.brokenImages.update((set) => new Set([...set, url]));
  }

  nameOf(id: string): string {
    const p = this.view().room.players.find((x) => x.id === id);
    return p ? `${p.avatar} ${p.name}` : '???';
  }

  euros(amount: number): string {
    return formatEuros(amount);
  }

  delta(value: number): string {
    return formatDelta(value);
  }

  podiumMedal(index: number): string {
    return ['🥇', '🥈', '🥉'][index] ?? '·';
  }

  medalOf(res: JustePrixBidResult): string {
    if (res.rank === undefined) return '💥';
    return ['🥇', '🥈', '🥉'][res.rank - 1] ?? String(res.rank);
  }

  hasBullseye(record: JustePrixRoundRecord): boolean {
    return record.results.some((r) => r.bullseye && !(r.overbid && this.game()?.params.noOverbid));
  }

  /** « Relevé sur exemple.fr · oct. 2026 ». */
  provenance(record: JustePrixRoundRecord): string | undefined {
    const host = hostnameOf(record.item.source);
    const date = this.formatSeenAt(record.item.seenAt);
    if (!host && !date) return undefined;
    return [host ? `Relevé sur ${host}` : 'Relevé', date].filter(Boolean).join(' · ');
  }

  private formatSeenAt(seenAt: string | undefined): string | undefined {
    const match = seenAt?.match(/^(\d{4})-(\d{2})/);
    if (!match) return undefined;
    return `${MOIS[Number(match[2]) - 1]} ${match[1]}`;
  }

  missingBidders(record: JustePrixRoundRecord): string[] {
    const bid = new Set(record.results.map((r) => r.playerId));
    return this.inGamePlayers()
      .map((p) => p.id)
      .filter((id) => !bid.has(id));
  }

  scaleMarkers(record: JustePrixRoundRecord): PriceMarker[] {
    return record.results.map((r) => ({
      playerId: r.playerId,
      label: this.nameOf(r.playerId),
      amount: r.amount,
      rank: r.rank,
      overbid: r.overbid,
    }));
  }

  /** Meilleure(s) estimation(s) d'un article, pour le récap de fin. */
  bestLine(record: JustePrixRoundRecord): string {
    const best = record.results.filter((r) => r.rank === 1);
    if (best.length === 0) return 'personne n’a trouvé';
    const who = best.map((r) => this.nameOf(r.playerId)).join(' & ');
    return `🥇 ${who} — ${formatEuros(best[0].amount)} (${formatDelta(best[0].delta)})`;
  }
}
