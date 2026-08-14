/**
 * Décompte affiché à partir d'un TimerView serveur (source de vérité).
 * Les 10 dernières secondes changent de couleur (PRD §3.3) — pas de son.
 */
import { Component, DestroyRef, computed, inject, input, signal } from '@angular/core';
import type { TimerView } from '@icebreakers/shared';
import { formatSeconds } from '../core/ui';

@Component({
  selector: 'app-timer-badge',
  template: `
    @if (timer(); as t) {
      <div class="timer" [class.urgent]="remainingMs() <= 10_000 && !t.paused" [class.paused]="t.paused" [class.big]="big()">
        <span aria-hidden="true">⏱</span>
        <span class="value">{{ label() }}</span>
        @if (t.paused) {
          <span class="tag">pause</span>
        }
      </div>
    }
  `,
  styles: [
    `
      .timer {
        display: inline-flex;
        align-items: center;
        gap: 0.5em;
        border: 1px solid var(--border);
        border-radius: 999px;
        padding: 0.3em 0.9em;
        background: var(--bg-sunken);
        font-variant-numeric: tabular-nums;
        font-weight: 700;
      }
      .timer.big {
        font-size: clamp(1.6rem, 5vw, 3.2rem);
        padding: 0.2em 0.7em;
      }
      .timer.urgent {
        border-color: var(--danger);
        color: var(--danger);
        animation: pulse 1s infinite;
      }
      .timer.paused {
        color: var(--fg-muted);
      }
      @keyframes pulse {
        50% {
          background: #331b1b;
        }
      }
    `,
  ],
})
export class TimerBadgeComponent {
  readonly timer = input<TimerView | undefined>(undefined);
  readonly big = input(false);

  private readonly now = signal(Date.now());
  readonly remainingMs = computed(() => {
    const t = this.timer();
    if (!t) return 0;
    return t.paused ? t.remainingMs : Math.max(t.endsAt - this.now(), 0);
  });
  readonly label = computed(() => formatSeconds(this.remainingMs()));

  constructor() {
    const interval = setInterval(() => this.now.set(Date.now()), 250);
    inject(DestroyRef).onDestroy(() => clearInterval(interval));
  }
}
