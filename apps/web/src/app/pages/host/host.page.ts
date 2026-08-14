/**
 * Écran animateur (PRD §2) : c'est LA vue publique projetée sur la TV,
 * surmontée d'une barre de contrôle repliable. Reconnexion par jeton.
 */
import { Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { SessionStore } from '../../core/session.store';
import { SocketService } from '../../core/socket.service';
import { ControlBarComponent } from './control-bar.component';
import { HostGameComponent } from './host-game.component';
import { HostLobbyComponent } from './host-lobby.component';

@Component({
  selector: 'app-host',
  imports: [RouterLink, ControlBarComponent, HostGameComponent, HostLobbyComponent],
  template: `
    @if (deniedMessage(); as denied) {
      <main class="denied">
        <div class="card">
          <h1>Écran animateur indisponible</h1>
          <p>{{ denied }}</p>
          <a routerLink="/" class="tag">← Retour à l'accueil</a>
        </div>
      </main>
    } @else if (view(); as v) {
      <div class="host-screen">
        <header>
          <span class="brand muted">{{ v.room.config.siteName }}</span>
          <span class="room-code" aria-label="Code du salon">{{ v.room.code }}</span>
          @if (!connected()) {
            <span class="tag offline">⚠ reconnexion…</span>
          }
        </header>

        <main>
          @if (v.room.game) {
            <app-host-game [view]="v" />
          } @else {
            <app-host-lobby [view]="v" />
          }
        </main>

        <app-control-bar [view]="v" />
      </div>
    } @else {
      <main class="denied"><p class="muted">Connexion au salon…</p></main>
    }
  `,
  styles: [
    `
      .host-screen {
        min-height: 100vh;
        display: flex;
        flex-direction: column;
      }
      header {
        display: flex;
        align-items: center;
        gap: 1rem;
        padding: 0.7rem 1.4rem;
        border-bottom: 1px solid var(--border);
      }
      .room-code {
        margin-left: auto;
        font-size: 1.6rem;
        font-weight: 800;
        letter-spacing: 0.25em;
        color: var(--accent);
      }
      .offline {
        color: var(--danger);
        border-color: var(--danger);
      }
      main {
        flex: 1;
        padding: 1.4rem;
        max-width: 1400px;
        width: 100%;
        margin: 0 auto;
      }
      .denied {
        display: grid;
        place-items: center;
        min-height: 100vh;
        padding: 2rem;
      }
    `,
  ],
})
export class HostPage {
  private readonly socket = inject(SocketService);
  private readonly sessions = inject(SessionStore);

  readonly code = (inject(ActivatedRoute).snapshot.paramMap.get('code') ?? '').toUpperCase();
  readonly view = this.socket.view;
  readonly connected = this.socket.connected;
  readonly joinFailed = signal<string | null>(null);

  readonly deniedMessage = computed(() => {
    if (this.joinFailed()) return this.joinFailed();
    if (!this.sessions.hostToken(this.code)) {
      return 'Ce navigateur n’est pas l’animateur de ce salon. Crée un salon depuis l’accueil (ou rejoins comme joueur).';
    }
    return null;
  });

  constructor() {
    const token = this.sessions.hostToken(this.code);
    if (token) {
      void this.socket.join(this.code, { token }).then((ack) => {
        if (!ack.ok) this.joinFailed.set(ack.error.message);
      });
    }
  }
}
