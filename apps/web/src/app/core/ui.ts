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

export function formatSeconds(ms: number): string {
  const total = Math.max(Math.ceil(ms / 1000), 0);
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}
