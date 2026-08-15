/**
 * Grille Codenames partagée (TV, maître-espion, devineur). Une carte révélée
 * affiche sa couleur ; `key` (clé du maître-espion OU révélation de fin)
 * ajoute la couleur en liseré sur les cartes non révélées. `interactive`
 * transforme les cartes en boutons (devineur actif).
 */
import { Component, computed, input, output } from '@angular/core';
import type { CodenamesCardKind, CodenamesCardPublicView } from '@icebreakers/shared';

@Component({
  selector: 'app-codenames-grid',
  template: `
    <div class="grid" [style.--cols]="cols()">
      @for (card of cards(); track $index) {
        <button
          type="button"
          class="cell"
          [class.revealed]="card.revealed"
          [class.selected]="$index === selectedIndex()"
          [class.keyed]="!card.revealed && kindOf($index) !== undefined"
          [attr.data-kind]="kindOf($index) ?? null"
          [disabled]="!interactive() || card.revealed"
          (click)="pick.emit($index)"
        >
          <span class="word">{{ card.word }}</span>
          @if (kindOf($index) === 'assassin') {
            <span class="skull" aria-label="assassin">☠️</span>
          }
        </button>
      }
    </div>
  `,
  styles: [
    `
      .grid {
        display: grid;
        grid-template-columns: repeat(var(--cols), 1fr);
        gap: 0.5rem;
      }
      .cell {
        position: relative;
        display: grid;
        place-items: center;
        min-height: 3.2em;
        padding: 0.4em 0.3em;
        border-radius: var(--radius-sm);
        border: 2px solid var(--border);
        background: var(--bg-raised);
        font-family: var(--font-display);
        font-size: clamp(0.7rem, 1.6vw, 1.05rem);
        font-weight: 600;
        text-align: center;
        overflow-wrap: anywhere;
        box-shadow: 0 3px 0 rgba(0, 0, 0, 0.3);
        transition: transform 90ms ease, border-color 120ms ease, background 120ms ease;
      }
      .cell:disabled {
        opacity: 1;
        cursor: default;
        box-shadow: 0 3px 0 rgba(0, 0, 0, 0.3);
      }
      button.cell:not(:disabled):hover {
        transform: translateY(-2px);
        border-color: var(--fg-muted);
      }
      .cell.selected {
        border-color: var(--accent);
        background: var(--accent-soft);
      }
      /* Couleur connue (révélée, ou clé du maître-espion en liseré). */
      .cell[data-kind='red'] {
        border-color: var(--cn-red);
      }
      .cell[data-kind='blue'] {
        border-color: var(--cn-blue);
      }
      .cell[data-kind='neutral'] {
        border-color: var(--cn-neutral);
      }
      .cell[data-kind='assassin'] {
        border-color: var(--cn-assassin);
      }
      .cell.revealed[data-kind='red'] {
        background: var(--cn-red);
        color: #2b0207;
      }
      .cell.revealed[data-kind='blue'] {
        background: var(--cn-blue);
        color: #041a33;
      }
      .cell.revealed[data-kind='neutral'] {
        background: var(--cn-neutral);
        color: #2a2417;
      }
      .cell.revealed[data-kind='assassin'] {
        background: var(--cn-assassin);
        color: #ffd9dd;
      }
      .cell.revealed .word {
        text-decoration: line-through;
        text-decoration-thickness: 2px;
        opacity: 0.85;
      }
      .skull {
        position: absolute;
        top: 0.1em;
        right: 0.25em;
        font-size: 0.85em;
      }
    `,
  ],
})
export class CodenamesGridComponent {
  readonly cards = input.required<CodenamesCardPublicView[]>();
  /** Clé complète (maître-espion, ou révélation de fin) — optionnelle. */
  readonly key = input<CodenamesCardKind[] | undefined>(undefined);
  readonly interactive = input(false);
  readonly selectedIndex = input<number | null>(null);
  readonly pick = output<number>();

  readonly cols = computed(() => (this.cards().length === 16 ? 4 : 5));

  /** Couleur affichable : celle de la carte révélée, sinon celle de la clé fournie. */
  kindOf(index: number): CodenamesCardKind | undefined {
    const card = this.cards()[index];
    if (card.revealed) return card.kind;
    return this.key()?.[index];
  }
}
