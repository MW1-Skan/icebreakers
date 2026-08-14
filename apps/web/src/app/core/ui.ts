import type { UndercoverRole, UndercoverWinner } from '@icebreakers/shared';

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
