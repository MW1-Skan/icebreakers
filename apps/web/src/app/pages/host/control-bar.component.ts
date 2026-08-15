/**
 * Barre de contrôle de l'animateur (PRD §2) : repliable, discrète, projetée
 * avec l'écran — ses libellés ne portent JAMAIS de secret. Avancer les phases,
 * pause/+30 s, retirer un joueur, kick (lobby), abandonner la manche.
 */
import { Component, computed, inject, input, signal } from '@angular/core';
import type { ClientView } from '@icebreakers/shared';
import { SocketService } from '../../core/socket.service';

@Component({
  selector: 'app-control-bar',
  template: `
    <div class="bar" [class.collapsed]="collapsed()">
      <button class="toggle" (click)="collapsed.set(!collapsed())" [attr.aria-expanded]="!collapsed()">
        {{ collapsed() ? '🎛 Contrôles' : '▾ Replier' }}
      </button>

      @if (!collapsed()) {
        <div class="controls">
          @if (controls()?.canNext) {
            <button class="primary" (click)="next()">{{ nextLabel() }}</button>
          }

          @if (controls()?.activeTimer; as timer) {
            @if (timer.paused) {
              <button (click)="control({ type: 'resumeTimer' })">▶ Reprendre</button>
            } @else {
              <button (click)="control({ type: 'pauseTimer' })">⏸ Pause</button>
            }
            <button (click)="control({ type: 'extendTimer', seconds: 30 })">+30 s</button>
          }

          @if (showInvalidateClue()) {
            <button class="danger" (click)="invalidateClue()">🚫 Invalider l'indice</button>
          }
          @if (showChangeTheme()) {
            <button (click)="changeTheme()">🎲 Changer de thème</button>
          }
          @if (showCancelBuzz()) {
            <button (click)="cancelBuzz(false)">🔕 Annuler le buzz</button>
            <button (click)="cancelBuzz(true)">🔕✓ Annuler + compter trouvé</button>
          }

          @if ((controls()?.removableIds ?? []).length > 0) {
            <details class="menu">
              <summary>{{ removeMenuLabel() }}</summary>
              <div class="menu-list">
                @for (id of controls()?.removableIds ?? []; track id) {
                  <button class="danger" (click)="remove(id)">✖ {{ nameOf(id) }}</button>
                }
              </div>
            </details>
          }

          @if ((controls()?.kickableIds ?? []).length > 0) {
            <details class="menu">
              <summary>Kicker…</summary>
              <div class="menu-list">
                @for (id of controls()?.kickableIds ?? []; track id) {
                  <button class="danger" (click)="kick(id)">🚪 {{ nameOf(id) }}</button>
                }
              </div>
            </details>
          }

          @if (controls()?.canAbort) {
            <button class="danger" (click)="abort()">Abandonner la manche</button>
          }
        </div>
      }
    </div>
  `,
  styles: [
    `
      .bar {
        position: sticky;
        bottom: 0;
        background: color-mix(in srgb, var(--bg-sunken) 92%, transparent);
        border-top: 1px solid var(--border);
        padding: 0.5rem 1.2rem;
        display: flex;
        align-items: center;
        gap: 0.8rem;
        flex-wrap: wrap;
        backdrop-filter: blur(6px);
      }
      .toggle {
        font-size: 0.9rem;
        color: var(--fg-muted);
      }
      .controls {
        display: flex;
        gap: 0.6rem;
        align-items: center;
        flex-wrap: wrap;
      }
      .menu {
        position: relative;
      }
      .menu summary {
        cursor: pointer;
        border: 1px solid var(--border);
        border-radius: var(--radius);
        padding: 0.45em 1em;
        list-style: none;
        background: var(--bg-raised);
      }
      .menu-list {
        position: absolute;
        bottom: 110%;
        left: 0;
        display: flex;
        flex-direction: column;
        gap: 0.3rem;
        background: var(--bg-raised);
        border: 1px solid var(--border);
        border-radius: var(--radius);
        padding: 0.5rem;
        min-width: 220px;
        z-index: 10;
      }
    `,
  ],
})
export class ControlBarComponent {
  private readonly socket = inject(SocketService);
  readonly view = input.required<ClientView>();
  readonly collapsed = signal(false);

  readonly controls = computed(() => this.view().hostControls);

  readonly nextLabel = computed(() => {
    const room = this.view().room;
    if (room.status === 'recap') return 'Retour au lobby';
    const game = room.game;
    if (!game) return 'Continuer';
    if (game.kind === 'justone') {
      if (game.phase === 'resolve') {
        return game.mancheIndex < game.manchesTotal
          ? `Manche suivante (${game.mancheIndex + 1}/${game.manchesTotal})`
          : 'Voir le score final';
      }
      return 'Continuer';
    }
    if (game.kind === 'wavelength') {
      if (game.phase === 'reveal' || game.phase === 'aborted') {
        return game.mancheNumber < game.manchesPlanned ? 'Manche suivante' : 'Voir le classement';
      }
      return 'Continuer';
    }
    if (game.kind === 'ito') {
      if (game.phase === 'mancheEnd') {
        return game.mancheIndex < game.manchesTotal
          ? `Manche suivante (${game.mancheIndex + 1}/${game.manchesTotal})`
          : 'Voir le verdict';
      }
      return 'Continuer';
    }
    if (game.kind === 'spyfall') {
      if (game.phase === 'brief') return 'Lancer l’interrogatoire';
      if (game.phase === 'reveal') {
        return game.mancheIndex < game.manchesTotal
          ? `Manche suivante (${game.mancheIndex + 1}/${game.manchesTotal})`
          : 'Voir la fin';
      }
      return 'Continuer';
    }
    if (game.kind === 'codenames') {
      if (game.phase === 'brief') return 'Lancer le premier indice';
      if (game.phase === 'end') {
        return game.mancheIndex < game.manchesTotal
          ? `Manche suivante (${game.mancheIndex + 1}/${game.manchesTotal})`
          : 'Voir le récap';
      }
      return 'Continuer';
    }
    if (game.kind === 'taboo') {
      if (game.phase === 'recap') {
        return game.upcoming.length > 0 ? 'Passage suivant' : 'Continuer';
      }
      return 'Continuer';
    }
    switch (game.phase) {
      case 'distribute':
        return 'Commencer le tour de parole';
      case 'describe': {
        const isLast = game.currentSpeakerId === game.speakingOrder[game.speakingOrder.length - 1];
        if (!isLast) return 'Joueur suivant';
        return game.describePass < game.params.describePasses
          ? `Tour de parole suivant (${game.describePass + 1}/${game.params.describePasses})`
          : 'Passer à la discussion';
      }
      case 'discuss':
        return 'Passer au vote';
      case 'reveal':
      case 'whiteGuess':
        return 'Continuer';
      case 'end':
        return `Manche suivante (${game.mancheIndex + 1}/${game.manchesTotal})`;
      default:
        return 'Continuer';
    }
  });

  nameOf(id: string): string {
    const p = this.view().room.players.find((x) => x.id === id);
    return p ? `${p.avatar} ${p.name}` : '???';
  }

  showInvalidateClue(): boolean {
    const game = this.view().room.game;
    return game?.kind === 'wavelength' && game.phase === 'place';
  }

  showChangeTheme(): boolean {
    const game = this.view().room.game;
    return game?.kind === 'ito' && game.phase === 'play' && !game.themeLocked;
  }

  showCancelBuzz(): boolean {
    const game = this.view().room.game;
    return game?.kind === 'taboo' && !!game.lastBuzz && (game.phase === 'live' || game.phase === 'recap');
  }

  cancelBuzz(countAsFound: boolean): void {
    void this.socket.control({ type: 'cancelBuzz', countAsFound });
  }

  removeMenuLabel(): string {
    return this.view().room.game?.kind === 'ito' ? 'Libérer la carte de…' : 'Retirer de la manche…';
  }

  invalidateClue(): void {
    if (confirm('Invalider cet indice ? Le télépathe devra en saisir un autre (la cible ne change pas).')) {
      void this.socket.control({ type: 'invalidateClue' });
    }
  }

  changeTheme(): void {
    void this.socket.control({ type: 'changeTheme' });
  }

  next(): void {
    void this.socket.next();
  }

  control(payload: Parameters<SocketService['control']>[0]): void {
    void this.socket.control(payload);
  }

  remove(playerId: string): void {
    const isIto = this.view().room.game?.kind === 'ito';
    const message = isIto
      ? `Libérer la carte de ${this.nameOf(playerId)} ? Elle sera révélée et défaussée, sans coût de vie.`
      : `Retirer ${this.nameOf(playerId)} de la manche ? Son rôle sera révélé.`;
    if (confirm(message)) {
      void this.socket.control({ type: 'removeFromRound', playerId });
    }
  }

  kick(playerId: string): void {
    if (confirm(`Kicker ${this.nameOf(playerId)} du salon ?`)) {
      void this.socket.control({ type: 'kick', playerId });
    }
  }

  abort(): void {
    if (confirm('Abandonner la manche en cours ? (retour au lobby, sans vainqueur)')) {
      void this.socket.control({ type: 'abortRound' });
    }
  }
}
