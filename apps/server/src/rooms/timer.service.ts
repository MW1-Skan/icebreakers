/**
 * Timers serveur (PRD §3.3) : source de vérité unique, pausables et
 * prolongeables par l'animateur. Un timer qui expire ré-injecte une action
 * TIMEOUT dans le réducteur via son callback.
 */
import { Injectable } from '@nestjs/common';
import type { TimerView } from '../shared';

interface TimerHandle {
  id: string;
  totalMs: number;
  endsAt: number;
  paused: boolean;
  pausedBy?: 'host' | 'auto';
  remainingMs: number; // figé quand paused
  timeout?: NodeJS.Timeout;
  onFire: () => void;
}

@Injectable()
export class TimerService {
  private byRoom = new Map<string, Map<string, TimerHandle>>();

  private handles(roomCode: string): Map<string, TimerHandle> {
    let map = this.byRoom.get(roomCode);
    if (!map) {
      map = new Map();
      this.byRoom.set(roomCode, map);
    }
    return map;
  }

  start(roomCode: string, id: string, seconds: number, onFire: () => void): void {
    this.cancel(roomCode, id);
    const totalMs = seconds * 1000;
    const handle: TimerHandle = {
      id,
      totalMs,
      endsAt: Date.now() + totalMs,
      paused: false,
      remainingMs: totalMs,
      onFire,
    };
    handle.timeout = setTimeout(() => this.fire(roomCode, id), totalMs);
    this.handles(roomCode).set(id, handle);
  }

  private fire(roomCode: string, id: string): void {
    const handle = this.handles(roomCode).get(id);
    if (!handle) return;
    this.handles(roomCode).delete(id);
    handle.onFire();
  }

  cancel(roomCode: string, id: string): void {
    const handle = this.handles(roomCode).get(id);
    if (!handle) return;
    if (handle.timeout) clearTimeout(handle.timeout);
    this.handles(roomCode).delete(id);
  }

  cancelAll(roomCode: string): void {
    for (const id of [...this.handles(roomCode).keys()]) this.cancel(roomCode, id);
    this.byRoom.delete(roomCode);
  }

  pause(roomCode: string, id: string, by: 'host' | 'auto' = 'host'): void {
    const handle = this.handles(roomCode).get(id);
    if (!handle || handle.paused) return;
    if (handle.timeout) clearTimeout(handle.timeout);
    handle.timeout = undefined;
    handle.paused = true;
    handle.pausedBy = by;
    handle.remainingMs = Math.max(handle.endsAt - Date.now(), 0);
  }

  resume(roomCode: string, id: string): void {
    const handle = this.handles(roomCode).get(id);
    if (!handle || !handle.paused) return;
    handle.paused = false;
    handle.pausedBy = undefined;
    handle.endsAt = Date.now() + handle.remainingMs;
    handle.timeout = setTimeout(() => this.fire(roomCode, id), handle.remainingMs);
  }

  /** Prolonge de N secondes (PRD : +30 s), timer actif ou en pause. */
  extend(roomCode: string, id: string, seconds: number): void {
    const handle = this.handles(roomCode).get(id);
    if (!handle) return;
    const extraMs = seconds * 1000;
    handle.totalMs += extraMs;
    if (handle.paused) {
      handle.remainingMs += extraMs;
    } else {
      if (handle.timeout) clearTimeout(handle.timeout);
      handle.endsAt += extraMs;
      handle.timeout = setTimeout(() => this.fire(roomCode, id), Math.max(handle.endsAt - Date.now(), 0));
    }
  }

  /** Pause automatique de tous les timers actifs (animateur déconnecté, §3.4). */
  autoPauseAll(roomCode: string): void {
    for (const handle of this.handles(roomCode).values()) {
      if (!handle.paused) this.pause(roomCode, handle.id, 'auto');
    }
  }

  /** Reprend uniquement les timers auto-pausés (les pauses manuelles du host restent). */
  autoResumeAll(roomCode: string): void {
    for (const handle of this.handles(roomCode).values()) {
      if (handle.paused && handle.pausedBy === 'auto') this.resume(roomCode, handle.id);
    }
  }

  /** Premier timer actif (Undercover n'en a jamais plus d'un). */
  activeIds(roomCode: string): string[] {
    return [...this.handles(roomCode).keys()];
  }

  viewsFor(roomCode: string): TimerView[] {
    const now = Date.now();
    return [...this.handles(roomCode).values()].map((h) => ({
      id: h.id,
      endsAt: h.paused ? now + h.remainingMs : h.endsAt,
      remainingMs: h.paused ? h.remainingMs : Math.max(h.endsAt - now, 0),
      totalMs: h.totalMs,
      paused: h.paused,
    }));
  }
}
