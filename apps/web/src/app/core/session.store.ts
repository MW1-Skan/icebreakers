/**
 * Jetons de session en localStorage (PRD §3.4) : un refresh d'onglet
 * reconnecte l'animateur ou le joueur à sa place.
 */
import { Injectable } from '@angular/core';

export interface PlayerSession {
  token: string;
  playerId: string;
  name: string;
}

@Injectable({ providedIn: 'root' })
export class SessionStore {
  hostToken(code: string): string | null {
    return localStorage.getItem(`icebreakers:host:${code}`);
  }

  saveHostToken(code: string, token: string): void {
    localStorage.setItem(`icebreakers:host:${code}`, token);
  }

  playerSession(code: string): PlayerSession | null {
    const raw = localStorage.getItem(`icebreakers:player:${code}`);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as PlayerSession;
    } catch {
      return null;
    }
  }

  savePlayerSession(code: string, session: PlayerSession): void {
    localStorage.setItem(`icebreakers:player:${code}`, JSON.stringify(session));
  }

  clearPlayerSession(code: string): void {
    localStorage.removeItem(`icebreakers:player:${code}`);
  }
}
