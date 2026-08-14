/**
 * Normalisation et correspondance tolérante aux fautes de frappe
 * (fiche 5.1 étape 7 — guess de Mr. White ; réutilisée par Just One plus tard).
 */

/** Minuscules, accents retirés, trim, espaces internes réduits. */
export function normalizeText(input: string): string {
  return input
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ');
}

/** Distance de Levenshtein classique (itérative, deux lignes). */
export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  let prev = new Array<number>(b.length + 1);
  let curr = new Array<number>(b.length + 1);
  for (let j = 0; j <= b.length; j++) prev[j] = j;
  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
    }
    [prev, curr] = [curr, prev];
  }
  return prev[b.length];
}

/**
 * « Le mot exact — les fautes de frappe pardonnent, pas les synonymes » :
 * correspondance après normalisation, distance ≤ 1 si le mot cible normalisé
 * fait ≤ 5 caractères, ≤ 2 sinon.
 */
export function fuzzyEquals(input: string, target: string): boolean {
  const normalizedInput = normalizeText(input);
  const normalizedTarget = normalizeText(target);
  const tolerance = normalizedTarget.length <= 5 ? 1 : 2;
  return levenshtein(normalizedInput, normalizedTarget) <= tolerance;
}
