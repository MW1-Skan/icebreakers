/**
 * Schémas Zod des packs de contenu (PRD §4.2 + Annexe A).
 * Un pack invalide est rejeté avec des messages lisibles, jamais un crash.
 *
 * Les six jeux sont schématisés (Annexe A) : le chargeur accepte dès maintenant
 * n'importe quel pack valide, même si seul Undercover est implémenté (étape 1).
 */
import { z } from 'zod';
import { normalizeText } from './text';

// ─── Briques communes (Annexe A : champs texte 1–80, difficulty ∈ {1,2,3}) ──

const textField = (label: string) =>
  z
    .string(`${label} : chaîne de caractères attendue`)
    .trim()
    .min(1, `${label} : ne doit pas être vide`)
    .max(80, `${label} : 80 caractères maximum`);

const difficultyField = z
  .number('difficulty : nombre attendu')
  .int('difficulty : entier attendu')
  .min(1, 'difficulty : entre 1 et 3')
  .max(3, 'difficulty : entre 1 et 3')
  .optional();

function findDuplicate(keys: string[]): { first: number; second: number } | undefined {
  const seen = new Map<string, number>();
  for (let i = 0; i < keys.length; i++) {
    const prior = seen.get(keys[i]);
    if (prior !== undefined) return { first: prior, second: i };
    seen.set(keys[i], i);
  }
  return undefined;
}

function nonEmptyEntries<T extends z.ZodTypeAny>(entry: T) {
  return z.array(entry, 'entries : liste attendue').min(1, 'entries : le pack est vide');
}

// ─── Entrées par jeu ────────────────────────────────────────────────────────

const undercoverEntry = z
  .object({
    a: textField('a'),
    b: textField('b'),
    difficulty: difficultyField,
  })
  .refine((e) => normalizeText(e.a) !== normalizeText(e.b), {
    message: 'a et b doivent être différents (après normalisation)',
  });

const undercoverEntries = nonEmptyEntries(undercoverEntry).superRefine((entries, ctx) => {
  const keys = entries.map((e) => [normalizeText(e.a), normalizeText(e.b)].sort().join('␟'));
  const dup = findDuplicate(keys);
  if (dup) {
    ctx.addIssue({
      code: 'custom',
      path: [dup.second],
      message: `paire en doublon avec entries[${dup.first}] (« ${entries[dup.second].a} » / « ${entries[dup.second].b} »)`,
    });
  }
});

const wavelengthEntry = z
  .object({ left: textField('left'), right: textField('right') })
  .refine((e) => normalizeText(e.left) !== normalizeText(e.right), {
    message: 'left et right doivent être différents (après normalisation)',
  });

const wavelengthEntries = nonEmptyEntries(wavelengthEntry).superRefine((entries, ctx) => {
  const dup = findDuplicate(
    entries.map((e) => [normalizeText(e.left), normalizeText(e.right)].sort().join('␟')),
  );
  if (dup) {
    ctx.addIssue({
      code: 'custom',
      path: [dup.second],
      message: `axe en doublon avec entries[${dup.first}]`,
    });
  }
});

const justoneEntry = z.object({ word: textField('word'), difficulty: difficultyField });

const justoneEntries = nonEmptyEntries(justoneEntry).superRefine((entries, ctx) => {
  const dup = findDuplicate(entries.map((e) => normalizeText(e.word)));
  if (dup) {
    ctx.addIssue({
      code: 'custom',
      path: [dup.second],
      message: `mot en doublon avec entries[${dup.first}] (« ${entries[dup.second].word} »)`,
    });
  }
});

const spyfallEntry = z
  .object({
    category: textField('category'),
    items: z
      .array(textField('items'), 'items : liste attendue')
      .min(8, 'items : au moins 8 items par thème (grille trop devinable en dessous)'),
  })
  .superRefine((entry, ctx) => {
    const dup = findDuplicate(entry.items.map((i) => normalizeText(i)));
    if (dup) {
      ctx.addIssue({
        code: 'custom',
        path: ['items', dup.second],
        message: `item en doublon avec items[${dup.first}] (« ${entry.items[dup.second]} »)`,
      });
    }
  });

const spyfallEntries = nonEmptyEntries(spyfallEntry).superRefine((entries, ctx) => {
  const dup = findDuplicate(entries.map((e) => normalizeText(e.category)));
  if (dup) {
    ctx.addIssue({
      code: 'custom',
      path: [dup.second, 'category'],
      message: `thème en doublon avec entries[${dup.first}] (« ${entries[dup.second].category} »)`,
    });
  }
});

const itoEntry = z.object({ theme: textField('theme') });

const itoEntries = nonEmptyEntries(itoEntry).superRefine((entries, ctx) => {
  const dup = findDuplicate(entries.map((e) => normalizeText(e.theme)));
  if (dup) {
    ctx.addIssue({
      code: 'custom',
      path: [dup.second],
      message: `thème en doublon avec entries[${dup.first}] (« ${entries[dup.second].theme} »)`,
    });
  }
});

const tabooEntry = z
  .object({
    word: textField('word'),
    forbidden: z
      .array(textField('forbidden'), 'forbidden : liste attendue')
      .length(3, 'forbidden : exactement 3 mots interdits'),
    difficulty: difficultyField,
  })
  .superRefine((entry, ctx) => {
    const normalized = entry.forbidden.map((f) => normalizeText(f));
    const dup = findDuplicate(normalized);
    if (dup) {
      ctx.addIssue({
        code: 'custom',
        path: ['forbidden', dup.second],
        message: 'les 3 mots interdits doivent être distincts',
      });
    }
    const clash = normalized.indexOf(normalizeText(entry.word));
    if (clash !== -1) {
      ctx.addIssue({
        code: 'custom',
        path: ['forbidden', clash],
        message: 'un mot interdit ne peut pas être le mot cible',
      });
    }
  });

const tabooEntries = nonEmptyEntries(tabooEntry).superRefine((entries, ctx) => {
  const dup = findDuplicate(entries.map((e) => normalizeText(e.word)));
  if (dup) {
    ctx.addIssue({
      code: 'custom',
      path: [dup.second],
      message: `carte en doublon avec entries[${dup.first}] (« ${entries[dup.second].word} »)`,
    });
  }
});

// Codenames (A.8) : mêmes entrées que Just One — des mots simples et
// évocateurs ; une grille consomme jusqu'à 25 mots distincts.
const codenamesEntry = z.object({ word: textField('word'), difficulty: difficultyField });

const codenamesEntries = nonEmptyEntries(codenamesEntry).superRefine((entries, ctx) => {
  const dup = findDuplicate(entries.map((e) => normalizeText(e.word)));
  if (dup) {
    ctx.addIssue({
      code: 'custom',
      path: [dup.second],
      message: `mot en doublon avec entries[${dup.first}] (« ${entries[dup.second].word} »)`,
    });
  }
});

// ─── Enveloppe commune (§4.2) ───────────────────────────────────────────────

const envelopeFields = {
  formatVersion: z.literal(1, 'formatVersion : seul le format 1 est supporté'),
  id: z
    .string('id : chaîne attendue')
    .trim()
    .min(1, 'id : requis')
    .max(80, 'id : 80 caractères maximum')
    .regex(/^[a-z0-9][a-z0-9-]*$/, 'id : minuscules, chiffres et tirets uniquement'),
  name: textField('name'),
  mode: z.enum(['interne', 'normal'], 'mode : « interne » ou « normal » attendu'),
  lang: z.string('lang : chaîne attendue').trim().min(2, 'lang : requis').max(8, 'lang : 8 caractères maximum'),
  author: textField('author').optional(),
};

export const packSchema = z.discriminatedUnion(
  'game',
  [
    z.object({ ...envelopeFields, game: z.literal('undercover'), entries: undercoverEntries }),
    z.object({ ...envelopeFields, game: z.literal('wavelength'), entries: wavelengthEntries }),
    z.object({ ...envelopeFields, game: z.literal('justone'), entries: justoneEntries }),
    z.object({ ...envelopeFields, game: z.literal('spyfall'), entries: spyfallEntries }),
    z.object({ ...envelopeFields, game: z.literal('ito'), entries: itoEntries }),
    z.object({ ...envelopeFields, game: z.literal('taboo'), entries: tabooEntries }),
    z.object({ ...envelopeFields, game: z.literal('codenames'), entries: codenamesEntries }),
  ],
  'game : jeu inconnu (attendu : undercover, wavelength, justone, spyfall, ito, taboo ou codenames)',
);

export type Pack = z.infer<typeof packSchema>;
export type UndercoverPack = Extract<Pack, { game: 'undercover' }>;
export type UndercoverPackEntry = UndercoverPack['entries'][number];
export type JustOnePack = Extract<Pack, { game: 'justone' }>;
export type JustOnePackEntry = JustOnePack['entries'][number];
export type WavelengthPack = Extract<Pack, { game: 'wavelength' }>;
export type WavelengthPackEntry = WavelengthPack['entries'][number];
export type ItoPack = Extract<Pack, { game: 'ito' }>;
export type ItoPackEntry = ItoPack['entries'][number];
export type SpyfallPack = Extract<Pack, { game: 'spyfall' }>;
export type SpyfallPackEntry = SpyfallPack['entries'][number];
export type TabooPack = Extract<Pack, { game: 'taboo' }>;
export type TabooPackEntry = TabooPack['entries'][number];
export type CodenamesPack = Extract<Pack, { game: 'codenames' }>;
export type CodenamesPackEntry = CodenamesPack['entries'][number];

/** Identifiant d'un élément de contenu : `packId#index` (§4.2, anti-répétition). */
export function entryElementId(packId: string, index: number): string {
  return `${packId}#${index}`;
}

// ─── Validation avec rapport lisible ────────────────────────────────────────

export type PackValidationResult = { ok: true; pack: Pack } | { ok: false; errors: string[] };

function pathToString(path: PropertyKey[]): string {
  let out = '';
  for (const segment of path) {
    if (typeof segment === 'number') out += `[${segment}]`;
    else out += out ? `.${String(segment)}` : String(segment);
  }
  return out;
}

function issueToMessage(issue: z.core.$ZodIssue): string {
  const path = pathToString(issue.path);
  const message = issue.message;
  return path ? `${path} : ${message}` : message;
}

/** Valide un pack déjà parsé (objet JSON) et rapporte des erreurs lisibles. */
export function validatePack(input: unknown): PackValidationResult {
  const result = packSchema.safeParse(input);
  if (result.success) return { ok: true, pack: result.data };
  const seen = new Set<string>();
  const errors: string[] = [];
  for (const issue of result.error.issues) {
    const msg = issueToMessage(issue);
    if (!seen.has(msg)) {
      seen.add(msg);
      errors.push(msg);
    }
  }
  return { ok: false, errors };
}
