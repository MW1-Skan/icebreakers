/**
 * Cadran Wavelength : piste 0–100 entre deux pôles, zones de score autour de
 * la cible (±w/±2w/±3w) et marqueurs nominatifs. Sert à la TV (révélation),
 * au télépathe (cible) et au récap.
 */
import { Component, computed, input } from '@angular/core';

export interface DialMarker {
  label: string;
  value: number;
  points?: number;
}

@Component({
  selector: 'app-wavelength-dial',
  template: `
    <div class="dial">
      <div class="track">
        @if (target() !== undefined) {
          <div class="zone z2" [style.left.%]="zoneLeft(3)" [style.width.%]="zoneW(3)"></div>
          <div class="zone z3" [style.left.%]="zoneLeft(2)" [style.width.%]="zoneW(2)"></div>
          <div class="zone z4" [style.left.%]="zoneLeft(1)" [style.width.%]="zoneW(1)"></div>
          <div class="target" [style.left.%]="target()" title="cible"></div>
        }
        @for (m of markers(); track m.label) {
          <div class="marker" [style.left.%]="m.value">
            <span class="pin" [class.scored]="(m.points ?? 0) > 0"></span>
            <span class="marker-label">{{ m.label }}@if (m.points !== undefined) {&nbsp;·&nbsp;{{ m.points }}pt}</span>
          </div>
        }
      </div>
      <div class="poles">
        <span class="pole">◀ {{ left() }}</span>
        <span class="pole">{{ right() }} ▶</span>
      </div>
    </div>
  `,
  styles: [
    `
      .dial {
        width: 100%;
      }
      .track {
        position: relative;
        height: 2.6rem;
        background: var(--bg-sunken);
        border: 1px solid var(--border);
        border-radius: 999px;
        overflow: visible;
        margin: 2.2rem 0 0.4rem;
      }
      .zone {
        position: absolute;
        top: 0;
        bottom: 0;
      }
      .zone.z4 {
        background: color-mix(in srgb, var(--ok) 55%, transparent);
      }
      .zone.z3 {
        background: color-mix(in srgb, var(--ok) 32%, transparent);
      }
      .zone.z2 {
        background: color-mix(in srgb, var(--ok) 16%, transparent);
      }
      .target {
        position: absolute;
        top: -6px;
        bottom: -6px;
        width: 4px;
        transform: translateX(-50%);
        background: var(--game-color, var(--accent));
        border-radius: 2px;
        box-shadow: 0 0 8px var(--game-color, var(--accent));
      }
      .marker {
        position: absolute;
        top: 0;
        bottom: 0;
        transform: translateX(-50%);
      }
      .pin {
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        width: 14px;
        height: 14px;
        border-radius: 50%;
        background: var(--info);
        border: 2px solid var(--bg);
      }
      .pin.scored {
        background: var(--ok);
      }
      .marker-label {
        position: absolute;
        bottom: 100%;
        left: 50%;
        transform: translateX(-50%);
        white-space: nowrap;
        font-size: 0.8rem;
        font-weight: 700;
        margin-bottom: 0.55rem;
        background: var(--bg-raised);
        border: 1px solid var(--border);
        border-radius: 999px;
        padding: 0.05rem 0.5rem;
      }
      .poles {
        display: flex;
        justify-content: space-between;
        font-size: 1.2rem;
        font-weight: 800;
      }
    `,
  ],
})
export class WavelengthDialComponent {
  readonly left = input.required<string>();
  readonly right = input.required<string>();
  readonly target = input<number | undefined>(undefined);
  readonly zoneWidth = input(5);
  readonly markers = input<DialMarker[]>([]);

  zoneLeft(mult: number): number {
    return Math.max((this.target() ?? 0) - this.zoneWidth() * mult, 0);
  }

  zoneW(mult: number): number {
    const t = this.target() ?? 0;
    const lo = Math.max(t - this.zoneWidth() * mult, 0);
    const hi = Math.min(t + this.zoneWidth() * mult, 100);
    return hi - lo;
  }

  readonly hasTarget = computed(() => this.target() !== undefined);
}
