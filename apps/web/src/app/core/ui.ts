import type { GameId, UndercoverRole, UndercoverWinner } from '@icebreakers/shared';

/**
 * Identité visuelle de chaque jeu (emoji, nom, couleur signature définie dans
 * styles.css) — utilisée par les shells host/player pour poser `--game-color`
 * et afficher le chip du jeu en cours.
 */
export const GAME_META: Record<GameId, { emoji: string; name: string; color: string }> = {
  undercover: { emoji: '🕵️', name: 'Undercover', color: 'var(--game-undercover)' },
  justone: { emoji: '☝️', name: 'Just One', color: 'var(--game-justone)' },
  wavelength: { emoji: '🌊', name: 'Wavelength', color: 'var(--game-wavelength)' },
  ito: { emoji: '🔢', name: 'Ito', color: 'var(--game-ito)' },
  spyfall: { emoji: '🔎', name: 'Spyfall', color: 'var(--game-spyfall)' },
  taboo: { emoji: '⏱️', name: 'Taboo', color: 'var(--game-taboo)' },
  codenames: { emoji: '🗝️', name: 'Codenames', color: 'var(--game-codenames)' },
  justeprix: { emoji: '🏷️', name: 'Juste Prix', color: 'var(--game-justeprix)' },
};

export const AVATARS = [
  '🦊', '🐸', '🐼', '🦁', '🐙', '🦄', '🐝', '🦉',
  '🐢', '🐬', '🦜', '🐨', '🦖', '🐳', '🦔', '🐰',
];

export function randomAvatar(): string {
  return AVATARS[Math.floor(Math.random() * AVATARS.length)];
}

export function roleLabel(role: UndercoverRole): string {
  switch (role) {
    case 'civilian':
      return 'Civil';
    case 'undercover':
      return 'Undercover';
    case 'mrwhite':
      return 'Mr. White';
  }
}

export function winnerLabel(winner: UndercoverWinner): string {
  switch (winner) {
    case 'civilians':
      return 'Les civils gagnent ! 🎉';
    case 'infiltrators':
      return 'Les infiltrés gagnent ! 🕵️';
    case 'mrwhite':
      return 'Mr. White gagne seul ! 🃏';
  }
}

const EUROS_ENTIER = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
const EUROS_CENTIMES = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2 });

/** « 1 299,90 € », ou « 350 € » pour un montant rond. */
export function formatEuros(amount: number): string {
  return Number.isInteger(amount) ? EUROS_ENTIER.format(amount) : EUROS_CENTIMES.format(amount);
}

/** Écart relatif signé, arrondi : « +12 % », « −40 % », « 0 % ». */
export function formatDelta(delta: number): string {
  const pct = Math.round(delta * 100);
  if (pct === 0) return '0\u202f%';
  return `${pct > 0 ? '+' : '\u2212'}${Math.abs(pct)}\u202f%`;
}

/**
 * Saisie d'un prix tolérante : « 1 299,90 € », « 1299.9 », « 1299 ».
 * Renvoie undefined si ce n'est pas un montant (2 décimales max).
 */
export function parseEuros(input: string): number | undefined {
  const cleaned = input.replace(/[\s\u00a0\u202f€]/g, '').replace(',', '.');
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return undefined;
  return Number(cleaned);
}

/** Nom de domaine lisible d'une URL (« exemple.fr »), ou undefined. */
export function hostnameOf(url: string | undefined): string | undefined {
  if (!url) return undefined;
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return undefined;
  }
}

export function formatSeconds(ms: number): string {
  const total = Math.max(Math.ceil(ms / 1000), 0);
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}
