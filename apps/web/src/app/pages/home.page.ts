/**
 * Home : « Créer un salon » en un clic sur le poste qui sera projeté (§3.1),
 * plus un champ code pour rejoindre à la main si on n'a pas le QR.
 */
import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { SessionStore } from '../core/session.store';
import { SocketService } from '../core/socket.service';

@Component({
  selector: 'app-home',
  imports: [FormsModule],
  template: `
    <main class="home">
      <h1 class="tv-huge">{{ siteName() }}</h1>
      <p class="muted">Mini-jeux d'ouverture pour rétrospectives — l'écran de l'animateur se projette sur la TV.</p>

      <div class="actions">
        <section class="card create">
          <h2>Animer une rétro</h2>
          <p class="muted">Crée un salon sur ce poste (c'est lui qui sera projeté). Tu ne joues pas : tu animes.</p>
          <button class="primary big" (click)="createRoom()" [disabled]="creating()">
            {{ creating() ? 'Création…' : 'Créer un salon' }}
          </button>
          @if (error(); as e) {
            <p class="error">{{ e }}</p>
          }
        </section>

        <section class="card join">
          <h2>Rejoindre une partie</h2>
          <p class="muted">Scanne le QR sur la TV, ou saisis le code du salon.</p>
          <form (ngSubmit)="goJoin()">
            <input
              name="code"
              [(ngModel)]="codeInput"
              placeholder="CODE"
              maxlength="4"
              autocapitalize="characters"
              autocomplete="off"
              aria-label="Code du salon"
            />
            <button type="submit" [disabled]="codeInput.trim().length !== 4">Rejoindre</button>
          </form>
        </section>
      </div>
      <footer class="muted">Les prénoms ne sont ni stockés ni transmis à des tiers — tout s'efface à la fermeture du salon.</footer>
    </main>
  `,
  styles: [
    `
      .home {
        max-width: 900px;
        margin: 0 auto;
        padding: 3rem 1.5rem;
        text-align: center;
      }
      .actions {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
        gap: 1.5rem;
        margin-top: 2rem;
        text-align: left;
      }
      button.big {
        font-size: 1.3rem;
        padding: 0.8em 1.6em;
        width: 100%;
      }
      form {
        display: flex;
        gap: 0.6rem;
      }
      input {
        text-transform: uppercase;
        letter-spacing: 0.3em;
        font-weight: 700;
        width: 8em;
      }
      .error {
        color: var(--danger);
      }
      footer {
        margin-top: 3rem;
        font-size: 0.85rem;
      }
    `,
  ],
})
export class HomePage {
  private readonly socket = inject(SocketService);
  private readonly sessions = inject(SessionStore);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  readonly siteName = signal('Icebreakers');
  readonly creating = signal(false);
  readonly error = signal<string | null>(null);
  codeInput = '';

  constructor() {
    void fetch('/api/config')
      .then((r) => r.json())
      .then((c: { siteName?: string }) => {
        if (c.siteName) this.siteName.set(c.siteName);
      })
      .catch(() => undefined);
  }

  async createRoom(): Promise<void> {
    this.creating.set(true);
    this.error.set(null);
    // Seed RNG injectable en dev/test : /?seed=42 (e2e déterministe).
    const seedParam = this.route.snapshot.queryParamMap.get('seed');
    const seed = seedParam !== null && seedParam !== '' ? Number(seedParam) : undefined;
    const ack = await this.socket.createRoom(Number.isFinite(seed) ? seed : undefined);
    this.creating.set(false);
    if (!ack.ok) {
      this.error.set(ack.error.message);
      return;
    }
    this.sessions.saveHostToken(ack.code, ack.token);
    void this.router.navigate(['/host', ack.code]);
  }

  goJoin(): void {
    const code = this.codeInput.trim().toUpperCase();
    if (code.length === 4) void this.router.navigate(['/join', code]);
  }
}
