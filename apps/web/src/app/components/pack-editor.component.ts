/**
 * Éditeur de packs (/admin) : `name`, `mode` et les entrées, éditables selon
 * le jeu — `id` et `game` sont IMMUABLES en édition (en duplication/création,
 * l'id est saisi mais le jeu reste celui du pack source ou du template).
 * La sauvegarde est déléguée à la page admin (flux d'upload existant) : toute
 * validation de contenu est celle du serveur (Zod, rapport lisible).
 */
import { Component, OnInit, computed, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import type { GameId, Pack, PackMode } from '@icebreakers/shared';

export type PackEditorKind = 'edit' | 'duplicate' | 'create';

interface EntryField {
  key: string;
  label: string;
  multiline?: boolean;
}

/** Une entrée éditable : champs plats par jeu ; `difficulty` préservée telle quelle. */
interface DraftEntry {
  fields: Record<string, string>;
  difficulty?: number;
}

const ENTRY_FIELDS: Record<GameId, EntryField[]> = {
  undercover: [
    { key: 'a', label: 'Mot A' },
    { key: 'b', label: 'Mot B (proche)' },
  ],
  wavelength: [
    { key: 'left', label: 'Pôle gauche' },
    { key: 'right', label: 'Pôle droit' },
  ],
  justone: [{ key: 'word', label: 'Mot' }],
  codenames: [{ key: 'word', label: 'Mot' }],
  ito: [{ key: 'theme', label: 'Thème' }],
  spyfall: [
    { key: 'category', label: 'Thème' },
    { key: 'items', label: 'Items (un par ligne, 8 minimum)', multiline: true },
  ],
  taboo: [
    { key: 'word', label: 'Mot cible' },
    { key: 'forbidden0', label: 'Interdit 1' },
    { key: 'forbidden1', label: 'Interdit 2' },
    { key: 'forbidden2', label: 'Interdit 3' },
  ],
};

function toDraft(game: GameId, entry: Record<string, unknown>): DraftEntry {
  const difficulty = typeof entry['difficulty'] === 'number' ? entry['difficulty'] : undefined;
  if (game === 'taboo') {
    const forbidden = Array.isArray(entry['forbidden']) ? (entry['forbidden'] as string[]) : [];
    return {
      fields: {
        word: String(entry['word'] ?? ''),
        forbidden0: forbidden[0] ?? '',
        forbidden1: forbidden[1] ?? '',
        forbidden2: forbidden[2] ?? '',
      },
      difficulty,
    };
  }
  if (game === 'spyfall') {
    const items = Array.isArray(entry['items']) ? (entry['items'] as string[]) : [];
    return { fields: { category: String(entry['category'] ?? ''), items: items.join('\n') } };
  }
  const fields: Record<string, string> = {};
  for (const field of ENTRY_FIELDS[game]) fields[field.key] = String(entry[field.key] ?? '');
  return { fields, difficulty };
}

function fromDraft(game: GameId, draft: DraftEntry): Record<string, unknown> {
  const withDifficulty = (entry: Record<string, unknown>) =>
    draft.difficulty === undefined ? entry : { ...entry, difficulty: draft.difficulty };
  if (game === 'taboo') {
    return withDifficulty({
      word: draft.fields['word'],
      forbidden: [draft.fields['forbidden0'], draft.fields['forbidden1'], draft.fields['forbidden2']],
    });
  }
  if (game === 'spyfall') {
    return {
      category: draft.fields['category'],
      items: draft.fields['items']
        .split('\n')
        .map((item) => item.trim())
        .filter((item) => item.length > 0),
    };
  }
  const entry: Record<string, unknown> = {};
  for (const field of ENTRY_FIELDS[game]) entry[field.key] = draft.fields[field.key];
  return withDifficulty(entry);
}

@Component({
  selector: 'app-pack-editor',
  imports: [FormsModule],
  template: `
    <section class="card editor">
      <header>
        <h2>{{ title() }}</h2>
        <span class="tag">{{ game }}</span>
      </header>

      <div class="envelope">
        <label for="pack-id">Id</label>
        <input
          id="pack-id"
          name="pack-id"
          [(ngModel)]="idInput"
          [disabled]="kind() === 'edit'"
          placeholder="mon-pack-01"
        />
        @if (kind() !== 'edit') {
          <p class="muted hint">Id NOUVEAU obligatoire — minuscules, chiffres et tirets.</p>
        }

        <label for="pack-name">Nom</label>
        <input id="pack-name" name="pack-name" [(ngModel)]="name" />

        <label for="pack-mode">Mode</label>
        <select id="pack-mode" name="pack-mode" [(ngModel)]="packMode">
          <option value="normal">normal</option>
          <option value="interne">interne</option>
        </select>
      </div>

      <h3>
        Entrées <span class="tag">{{ entries().length }}</span>
      </h3>
      <div class="entries">
        @for (entry of entries(); track $index; let entryIndex = $index) {
          <div class="entry-row">
            <span class="entry-num">{{ entryIndex + 1 }}</span>
            @for (field of fields; track field.key) {
              @if (field.multiline) {
                <textarea
                  rows="4"
                  [attr.aria-label]="field.label + ' ' + (entryIndex + 1)"
                  [placeholder]="field.label"
                  [ngModel]="entry.fields[field.key]"
                  (ngModelChange)="setField(entryIndex, field.key, $event)"
                  [name]="'entry-' + entryIndex + '-' + field.key"
                ></textarea>
              } @else {
                <input
                  [attr.aria-label]="field.label + ' ' + (entryIndex + 1)"
                  [placeholder]="field.label"
                  [ngModel]="entry.fields[field.key]"
                  (ngModelChange)="setField(entryIndex, field.key, $event)"
                  [name]="'entry-' + entryIndex + '-' + field.key"
                />
              }
            }
            <button
              class="danger remove"
              (click)="removeEntry(entryIndex)"
              [attr.aria-label]="'Supprimer l’entrée ' + (entryIndex + 1)"
            >
              ✕
            </button>
          </div>
        }
      </div>
      <button class="add" (click)="addEntry()">+ Ajouter une entrée</button>

      @if (localError(); as err) {
        <p class="error" role="alert">{{ err }}</p>
      }
      @if (serverErrors(); as errors) {
        <div class="error-report" role="alert">
          <strong>Pack refusé — rien n'a été enregistré :</strong>
          <ul>
            @for (line of errors; track line) {
              <li>{{ line }}</li>
            }
          </ul>
        </div>
      }

      <footer>
        <button (click)="cancelled.emit()" [disabled]="busy()">Annuler</button>
        <button class="primary" (click)="submit()" [disabled]="busy()">Enregistrer</button>
      </footer>
    </section>
  `,
  styles: [
    `
      .editor header {
        display: flex;
        align-items: center;
        gap: 0.8rem;
      }
      .editor header h2 {
        margin: 0;
        flex: 1;
      }
      .envelope {
        display: grid;
        grid-template-columns: auto 1fr;
        gap: 0.5rem 1rem;
        align-items: center;
        max-width: 560px;
        margin: 0.8rem 0 1rem;
      }
      .envelope label {
        font-weight: 600;
        color: var(--fg-muted);
      }
      .envelope .hint {
        grid-column: 2;
        margin: -0.2rem 0 0;
        font-size: 0.85rem;
      }
      .entries {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
        margin-bottom: 0.7rem;
      }
      .entry-row {
        display: flex;
        align-items: flex-start;
        gap: 0.5rem;
        flex-wrap: wrap;
      }
      .entry-row input,
      .entry-row textarea {
        flex: 1;
        min-width: 140px;
      }
      .entry-num {
        min-width: 1.8em;
        text-align: right;
        color: var(--fg-muted);
        font-variant-numeric: tabular-nums;
        padding-top: 0.45em;
      }
      .entry-row .remove {
        padding: 0.3em 0.6em;
      }
      .error {
        color: var(--danger);
        margin: 0.5rem 0 0;
      }
      .error-report {
        border: 1px solid var(--danger);
        border-radius: 10px;
        padding: 0.6rem 1rem;
        margin-top: 0.6rem;
      }
      .error-report ul {
        margin: 0.3rem 0 0;
        padding-left: 1.2rem;
      }
      footer {
        display: flex;
        gap: 0.7rem;
        margin-top: 1rem;
      }
    `,
  ],
})
export class PackEditorComponent implements OnInit {
  readonly kind = input.required<PackEditorKind>();
  readonly initial = input.required<Pack>();
  /** Ids déjà pris : en duplication/création, l'id doit être NOUVEAU. */
  readonly existingIds = input.required<string[]>();
  readonly serverErrors = input<string[] | null>(null);
  readonly busy = input(false);
  readonly save = output<Record<string, unknown>>();
  readonly cancelled = output<void>();

  readonly title = computed(() => {
    if (this.kind() === 'edit') return `Éditer « ${this.initial().id} »`;
    if (this.kind() === 'duplicate') return `Dupliquer « ${this.initial().id} » en pack à chaud`;
    return 'Créer un pack';
  });

  game!: GameId;
  fields: EntryField[] = [];
  idInput = '';
  name = '';
  packMode: PackMode = 'normal';
  private lang = 'fr';
  private author?: string;
  readonly entries = signal<DraftEntry[]>([]);
  readonly localError = signal<string | null>(null);

  ngOnInit(): void {
    const pack = this.initial();
    this.game = pack.game;
    this.fields = ENTRY_FIELDS[pack.game];
    this.idInput = this.kind() === 'duplicate' ? `${pack.id}-copie` : pack.id;
    this.name = this.kind() === 'duplicate' ? `${pack.name} (copie)` : pack.name;
    this.packMode = pack.mode;
    this.lang = pack.lang;
    this.author = pack.author;
    this.entries.set(pack.entries.map((entry) => toDraft(pack.game, entry as Record<string, unknown>)));
  }

  setField(index: number, key: string, value: string): void {
    this.entries.update((list) =>
      list.map((entry, i) => (i === index ? { ...entry, fields: { ...entry.fields, [key]: value } } : entry)),
    );
  }

  addEntry(): void {
    const fields: Record<string, string> = {};
    for (const field of this.fields) fields[field.key] = '';
    this.entries.update((list) => [...list, { fields }]);
  }

  removeEntry(index: number): void {
    this.entries.update((list) => list.filter((_, i) => i !== index));
  }

  submit(): void {
    this.localError.set(null);
    const id = this.idInput.trim();
    if (!id) {
      this.localError.set('Un id est requis (minuscules, chiffres et tirets).');
      return;
    }
    if (this.kind() !== 'edit' && this.existingIds().includes(id)) {
      this.localError.set(`L'id « ${id} » existe déjà — choisis-en un nouveau.`);
      return;
    }
    this.save.emit({
      formatVersion: 1,
      id,
      game: this.game,
      name: this.name,
      mode: this.packMode,
      lang: this.lang,
      ...(this.author ? { author: this.author } : {}),
      entries: this.entries().map((entry) => fromDraft(this.game, entry)),
    });
  }
}
