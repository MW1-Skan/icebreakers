/**
 * Écran joueur : reconnexion par jeton, bandeau pause si l'animateur est
 * déconnecté (§3.4), et délégation à la vue de jeu par phase.
 */
import { Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { SessionStore } from '../../core/session.store';
import { SocketService } from '../../core/socket.service';
import { ItoPlayerComponent } from './ito-player.component';
import { JustOnePlayerComponent } from './justone-player.component';
import { SpyfallPlayerComponent } from './spyfall-player.component';
import { TabooPlayerComponent } from './taboo-player.component';
import { UndercoverPlayerComponent } from './undercover-player.component';
import { WavelengthPlayerComponent } from './wavelength-player.component';
import { PlayersGridComponent } from '../../components/players-grid.component';
import { RecapBannerComponent } from '../../components/recap-banner.component';

@Component({
  selector: 'app-player',
  imports: [
    RouterLink,
    ItoPlayerComponent,
    JustOnePlayerComponent,
    SpyfallPlayerComponent,
    TabooPlayerComponent,
    UndercoverPlayerComponent,
    WavelengthPlayerComponent,
    PlayersGridComponent,
    RecapBannerComponent,
  ],
  template: `
    @if (fatalError(); as fatal) {
      <main class="center">
        <div class="card">
          <h1>Oups</h1>
          <p>{{ fatal }}</p>
          <a routerLink="/" class="tag">← Accueil</a>
        </div>
      </main>
    } @else if (view(); as v) {
      <div class="player-screen">
        <header>
          <span class="me">
            <span class="avatar">{{ v.me?.avatar }}</span>
            {{ v.me?.name }}
          </span>
          <span class="code muted">{{ v.room.code }}</span>
          @if (!connected()) {
            <span class="tag offline">⚠ reconnexion…</span>
          }
        </header>

        @if (v.room.paused) {
          <div class="paused" role="alert">
            ⏸ L'animateur est déconnecté — le jeu est en pause, il reprendra à son retour.
          </div>
        }

        <main>
          @if (v.room.status === 'lobby') {
            <div class="lobby-wait">
              <h1>Bienvenue !</h1>
              <p class="muted">Regarde la TV 📺 — l'animateur lance la partie quand tout le monde est là.</p>
              <app-players-grid [players]="v.room.players" [compact]="true" />
              <app-recap-banner [recap]="v.room.recap" />
            </div>
          } @else {
            @switch (v.room.game?.kind) {
              @case ('undercover') {
                <app-undercover-player [view]="v" />
              }
              @case ('justone') {
                <app-justone-player [view]="v" />
              }
              @case ('wavelength') {
                <app-wavelength-player [view]="v" />
              }
              @case ('ito') {
                <app-ito-player [view]="v" />
              }
              @case ('spyfall') {
                <app-spyfall-player [view]="v" />
              }
              @case ('taboo') {
                <app-taboo-player [view]="v" />
              }
            }
          }
        </main>
      </div>
    } @else {
      <main class="center"><p class="muted">Connexion…</p></main>
    }
  `,
  styles: [
    `
      .player-screen {
        min-height: 100vh;
        display: flex;
        flex-direction: column;
        max-width: 640px;
        margin: 0 auto;
      }
      header {
        display: flex;
        align-items: center;
        gap: 0.8rem;
        padding: 0.7rem 1.2rem;
        border-bottom: 1px solid var(--border);
      }
      .me {
        font-weight: 700;
        font-size: 1.15rem;
      }
      .avatar {
        font-size: 1.5rem;
      }
      .code {
        margin-left: auto;
        letter-spacing: 0.2em;
      }
      .offline {
        color: var(--danger);
        border-color: var(--danger);
      }
      main {
        flex: 1;
        padding: 1.2rem;
      }
      .center {
        display: grid;
        place-items: center;
        min-height: 100vh;
        padding: 2rem;
      }
      .paused {
        background: var(--accent-soft);
        border-bottom: 1px solid var(--accent);
        padding: 0.6rem 1.2rem;
        font-weight: 600;
      }
      .lobby-wait {
        display: flex;
        flex-direction: column;
        gap: 1rem;
      }
    `,
  ],
})
export class PlayerPage {
  private readonly socket = inject(SocketService);
  private readonly sessions = inject(SessionStore);
  private readonly router = inject(Router);

  readonly code = (inject(ActivatedRoute).snapshot.paramMap.get('code') ?? '').toUpperCase();
  readonly view = this.socket.view;
  readonly connected = this.socket.connected;
  private readonly joinError = signal<string | null>(null);

  readonly fatalError = computed(() => {
    const socketError = this.socket.lastError();
    if (socketError && ['KICKED', 'ROOM_CLOSED'].includes(socketError.code)) return socketError.message;
    return this.joinError();
  });

  constructor() {
    const session = this.sessions.playerSession(this.code);
    if (!session) {
      void this.router.navigate(['/join', this.code]);
      return;
    }
    void this.socket.join(this.code, { token: session.token }).then((ack) => {
      if (!ack.ok) {
        if (ack.error.code === 'BAD_TOKEN') {
          this.sessions.clearPlayerSession(this.code);
          void this.router.navigate(['/join', this.code]);
        } else {
          this.joinError.set(ack.error.message);
        }
      }
    });
  }
}
