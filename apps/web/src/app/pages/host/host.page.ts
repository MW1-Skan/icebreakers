/**
 * Écran animateur (PRD §2) : c'est LA vue publique projetée sur la TV,
 * surmontée d'une barre de contrôle repliable. Reconnexion par jeton.
 */
import { Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { GAME_META } from '../../core/ui';
import { SessionStore } from '../../core/session.store';
import { SocketService } from '../../core/socket.service';
import { CodenamesHostComponent } from './codenames-host.component';
import { ControlBarComponent } from './control-bar.component';
import { HostLobbyComponent } from './host-lobby.component';
import { ItoHostComponent } from './ito-host.component';
import { JustOneHostComponent } from './justone-host.component';
import { SpyfallHostComponent } from './spyfall-host.component';
import { TabooHostComponent } from './taboo-host.component';
import { UndercoverHostComponent } from './undercover-host.component';
import { WavelengthHostComponent } from './wavelength-host.component';

@Component({
  selector: 'app-host',
  imports: [
    RouterLink,
    CodenamesHostComponent,
    ControlBarComponent,
    HostLobbyComponent,
    ItoHostComponent,
    JustOneHostComponent,
    SpyfallHostComponent,
    TabooHostComponent,
    UndercoverHostComponent,
    WavelengthHostComponent,
  ],
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
      <div class="host-screen" [style.--game-color]="gameMeta()?.color">
        <header>
          <span class="brand muted">{{ v.room.config.siteName }}</span>
          @if (gameMeta(); as gm) {
            <span class="game-chip">{{ gm.emoji }} {{ gm.name }}</span>
          }
          <span class="room-code" aria-label="Code du salon">{{ v.room.code }}</span>
          @if (!connected()) {
            <span class="tag offline">⚠ reconnexion…</span>
          }
        </header>

        <main>
          @switch (v.room.game?.kind) {
            @case ('undercover') {
              <app-undercover-host [view]="v" />
            }
            @case ('justone') {
              <app-justone-host [view]="v" />
            }
            @case ('wavelength') {
              <app-wavelength-host [view]="v" />
            }
            @case ('ito') {
              <app-ito-host [view]="v" />
            }
            @case ('spyfall') {
              <app-spyfall-host [view]="v" />
            }
            @case ('taboo') {
              <app-taboo-host [view]="v" />
            }
            @case ('codenames') {
              <app-codenames-host [view]="v" />
            }
            @default {
              <app-host-lobby [view]="v" />
            }
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
        background: color-mix(in srgb, var(--bg-sunken) 55%, transparent);
      }
      .brand {
        font-family: var(--font-display);
        font-weight: 600;
      }
      .room-code {
        margin-left: auto;
        font-family: var(--font-display);
        font-size: 1.5rem;
        font-weight: 700;
        letter-spacing: 0.25em;
        color: var(--accent);
        border: 2px solid color-mix(in srgb, var(--accent) 45%, var(--border));
        border-radius: 999px;
        padding: 0.05em 0.6em 0.05em 0.85em;
        background: var(--accent-soft);
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

  readonly gameMeta = computed(() => {
    const kind = this.view()?.room.game?.kind;
    return kind ? GAME_META[kind] : undefined;
  });

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
