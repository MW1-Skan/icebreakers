/**
 * Frise de révélation du Juste Prix : échelle linéaire de 0 à 2× le prix, le
 * juste prix au centre, chaque mise posée à sa valeur (au-delà de 2× :
 * épinglée au bord, valeur affichée). Les étiquettes trop proches passent sur
 * la ligne suivante pour rester lisibles de loin.
 */
import { Component, computed, input } from '@angular/core';
import { formatEuros } from '../core/ui';

export interface PriceMarker {
  playerId: string;
  label: string;
  amount: number;
  rank?: number;
  overbid: boolean;
}

/** Écart horizontal minimal (en %) entre deux étiquettes d'une même ligne. */
const MIN_GAP_PCT = 14;

@Component({
  selector: 'app-price-scale',
  template: `
    <div class="scale" [style.height.px]="height()" aria-hidden="true">
      @if (noOverbid()) {
        <div class="over-zone" title="Au-dessus du prix : 0 pt"></div>
      }
      <div class="track"></div>
      <div class="price-mark">
        <span class="price-label">{{ euros(price()) }}</span>
      </div>
      @for (m of placed(); track m.playerId) {
        <div
          class="marker"
          [class.first]="m.rank === 1"
          [class.over]="m.overbid && noOverbid()"
          [style.left.%]="m.pos"
          [style.top.px]="56 + m.row * 46"
        >
          <span class="label">{{ m.medal }}{{ m.label }}</span>
          <span class="amount">{{ m.clamped ? '→ ' : '' }}{{ euros(m.amount) }}</span>
        </div>
        <div class="tick" [class.first]="m.rank === 1" [style.left.%]="m.pos"></div>
      }
    </div>
    <div class="axis">
      <span>0 €</span>
      <span>{{ euros(price() * 2) }}</span>
    </div>
  `,
  styles: [
    `
      :host {
        display: block;
        padding: 0 2.5rem;
      }
      .scale {
        position: relative;
        min-height: 110px;
      }
      .track {
        position: absolute;
        top: 30px;
        left: 0;
        right: 0;
        height: 8px;
        border-radius: 999px;
        background: linear-gradient(90deg, var(--bg-sunken), var(--border) 50%, var(--bg-sunken));
      }
      .over-zone {
        position: absolute;
        top: 22px;
        left: 50%;
        right: 0;
        height: 24px;
        border-radius: 0 999px 999px 0;
        background: repeating-linear-gradient(
          -45deg,
          var(--danger-soft),
          var(--danger-soft) 8px,
          transparent 8px,
          transparent 16px
        );
      }
      .price-mark {
        position: absolute;
        top: 0;
        left: 50%;
        width: 4px;
        height: 54px;
        transform: translateX(-50%);
        background: var(--game-color, var(--accent));
        border-radius: 2px;
      }
      .price-label {
        position: absolute;
        bottom: 100%;
        left: 50%;
        transform: translateX(-50%);
        white-space: nowrap;
        font-weight: 900;
        color: var(--game-color, var(--accent));
      }
      .tick {
        position: absolute;
        top: 22px;
        width: 4px;
        height: 24px;
        transform: translateX(-50%);
        background: var(--fg-muted);
        border-radius: 2px;
      }
      .tick.first {
        background: var(--ok);
      }
      .marker {
        position: absolute;
        transform: translateX(-50%);
        display: flex;
        flex-direction: column;
        align-items: center;
        white-space: nowrap;
        background: var(--bg-raised);
        border: 2px solid var(--border);
        border-radius: 12px;
        padding: 0.15rem 0.6rem;
        font-size: 1rem;
        line-height: 1.2;
      }
      .marker.first {
        border-color: var(--ok);
      }
      .marker.over {
        opacity: 0.6;
        border-style: dashed;
      }
      .label {
        font-weight: 700;
      }
      .amount {
        font-variant-numeric: tabular-nums;
        color: var(--fg-muted);
      }
      .axis {
        display: flex;
        justify-content: space-between;
        color: var(--fg-muted);
        font-size: 0.9rem;
      }
    `,
  ],
})
export class PriceScaleComponent {
  readonly price = input.required<number>();
  readonly markers = input.required<PriceMarker[]>();
  readonly noOverbid = input(false);

  readonly placed = computed(() => {
    const max = this.price() * 2;
    const items = this.markers()
      .map((m) => ({
        ...m,
        pos: Math.min(m.amount / max, 1) * 100,
        clamped: m.amount > max,
        medal: m.rank !== undefined && m.rank <= 3 ? `${['🥇', '🥈', '🥉'][m.rank - 1]} ` : '',
        row: 0,
      }))
      .sort((a, b) => a.pos - b.pos);
    // Lignes gloutonnes : une étiquette descend d'une ligne si elle chevauche.
    const lastPosByRow: number[] = [];
    for (const item of items) {
      let row = lastPosByRow.findIndex((last) => item.pos - last >= MIN_GAP_PCT);
      if (row === -1) row = lastPosByRow.length;
      lastPosByRow[row] = item.pos;
      item.row = row;
    }
    return items;
  });

  readonly height = computed(() => {
    const rows = Math.max(1, ...this.placed().map((m) => m.row + 1));
    return 56 + rows * 46;
  });

  euros(amount: number): string {
    return formatEuros(amount);
  }
}
