import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TimerService } from './timer.service';

let service: TimerService;

beforeEach(() => {
  vi.useFakeTimers();
  service = new TimerService();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('TimerService', () => {
  it('déclenche le callback à échéance puis disparaît', () => {
    const fired = vi.fn();
    service.start('ROOM', 'discuss', 10, fired);
    vi.advanceTimersByTime(9_999);
    expect(fired).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(fired).toHaveBeenCalledOnce();
    expect(service.viewsFor('ROOM')).toEqual([]);
  });

  it('pause : le timer ne se déclenche plus, le restant est figé (§3.3)', () => {
    const fired = vi.fn();
    service.start('ROOM', 'vote', 45, fired);
    vi.advanceTimersByTime(20_000);
    service.pause('ROOM', 'vote');
    vi.advanceTimersByTime(120_000);
    expect(fired).not.toHaveBeenCalled();
    expect(service.viewsFor('ROOM')[0]).toMatchObject({ paused: true, remainingMs: 25_000 });

    service.resume('ROOM', 'vote');
    vi.advanceTimersByTime(24_999);
    expect(fired).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(fired).toHaveBeenCalledOnce();
  });

  it('prolongation de 30 s (actif ou en pause)', () => {
    const fired = vi.fn();
    service.start('ROOM', 'discuss', 60, fired);
    service.extend('ROOM', 'discuss', 30);
    vi.advanceTimersByTime(89_999);
    expect(fired).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(fired).toHaveBeenCalledOnce();
  });

  it('annulation : plus de déclenchement', () => {
    const fired = vi.fn();
    service.start('ROOM', 'vote', 45, fired);
    service.cancel('ROOM', 'vote');
    vi.advanceTimersByTime(60_000);
    expect(fired).not.toHaveBeenCalled();
  });

  it('pause auto (host déconnecté) et reprise auto — la pause manuelle survit', () => {
    const fired = vi.fn();
    service.start('ROOM', 'discuss', 60, fired);
    service.pause('ROOM', 'discuss'); // pause manuelle du host
    service.autoPauseAll('ROOM'); // déconnexion host (déjà en pause : inchangé)
    service.autoResumeAll('ROOM'); // reconnexion : la pause MANUELLE reste
    expect(service.viewsFor('ROOM')[0]?.paused).toBe(true);

    service.resume('ROOM', 'discuss');
    service.autoPauseAll('ROOM');
    expect(service.viewsFor('ROOM')[0]?.paused).toBe(true);
    service.autoResumeAll('ROOM');
    expect(service.viewsFor('ROOM')[0]?.paused).toBe(false);
  });
});
