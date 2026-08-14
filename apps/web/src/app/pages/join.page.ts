/**
 * Rejoindre : prénom (2–20) + avatar emoji proposé aléatoirement, modifiable
 * (§3.1). Si un jeton existe déjà pour ce salon → reconnexion directe.
 */
import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { AVATARS, randomAvatar } from '../core/ui';
import { SessionStore } from '../core/session.store';
import { SocketService } from '../core/socket.service';

@Component({
  selector: 'app-join',
  imports: [FormsModule],
  template: `
    <main class="join">
      <h1>
        Rejoindre le salon <span class="code">{{ code }}</span>
      </h1>

      @if (reconnecting()) {
        <p class="muted">Reconnexion à ta place…</p>
      } @else {
        <form class="card" (ngSubmit)="join()">
          <label for="name">Ton prénom</label>
          <input
            id="name"
            name="name"
            [(ngModel)]="name"
            minlength="2"
            maxlength="20"
            required
            autocomplete="off"
            placeholder="Alice"
          />

          <label>Ton avatar</label>
          <div class="avatar-row">
            <span class="chosen" aria-live="polite">{{ avatar() }}</span>
            <button type="button" (click)="rerollAvatar()" aria-label="Autre avatar au hasard">🎲 Au hasard</button>
          </div>
          <div class="avatar-grid" role="listbox" aria-label="Choisir un avatar">
            @for (a of avatars; track a) {
              <button
                type="button"
                role="option"
                [attr.aria-selected]="a === avatar()"
                [class.selected]="a === avatar()"
                (click)="avatar.set(a)"
              >
                {{ a }}
              </button>
            }
          </div>

          <button class="primary" type="submit" [disabled]="name.trim().length < 2 || joining()">
            {{ joining() ? 'Connexion…' : 'C’est parti !' }}
          </button>
          @if (error(); as e) {
            <p class="error" role="alert">{{ e }}</p>
          }
        </form>
      }
    </main>
  `,
  styles: [
    `
      .join {
        max-width: 480px;
        margin: 0 auto;
        padding: 2.5rem 1.5rem;
      }
      .code {
        letter-spacing: 0.2em;
        color: var(--accent);
      }
      form {
        display: flex;
        flex-direction: column;
        gap: 0.7rem;
      }
      label {
        font-weight: 600;
        margin-top: 0.4rem;
      }
      .avatar-row {
        display: flex;
        align-items: center;
        gap: 1rem;
      }
      .chosen {
        font-size: 2.6rem;
      }
      .avatar-grid {
        display: grid;
        grid-template-columns: repeat(8, 1fr);
        gap: 0.4rem;
      }
      .avatar-grid button {
        font-size: 1.4rem;
        padding: 0.3rem;
      }
      .avatar-grid button.selected {
        border-color: var(--accent);
        background: #2b2a1a;
      }
      .error {
        color: var(--danger);
      }
    `,
  ],
})
export class JoinPage {
  private readonly socket = inject(SocketService);
  private readonly sessions = inject(SessionStore);
  private readonly router = inject(Router);

  readonly code = (inject(ActivatedRoute).snapshot.paramMap.get('code') ?? '').toUpperCase();
  readonly avatars = AVATARS;

  name = '';
  readonly avatar = signal(randomAvatar());
  readonly joining = signal(false);
  readonly reconnecting = signal(false);
  readonly error = signal<string | null>(null);

  constructor() {
    const existing = this.sessions.playerSession(this.code);
    if (existing) {
      this.reconnecting.set(true);
      void this.socket.join(this.code, { token: existing.token }).then((ack) => {
        if (ack.ok) {
          void this.router.navigate(['/room', this.code]);
        } else {
          this.sessions.clearPlayerSession(this.code);
          this.reconnecting.set(false);
        }
      });
    }
  }

  rerollAvatar(): void {
    this.avatar.set(randomAvatar());
  }

  async join(): Promise<void> {
    if (this.name.trim().length < 2) return;
    this.joining.set(true);
    this.error.set(null);
    const ack = await this.socket.join(this.code, { name: this.name.trim(), avatar: this.avatar() });
    this.joining.set(false);
    if (!ack.ok) {
      this.error.set(ack.error.message);
      return;
    }
    this.sessions.savePlayerSession(this.code, {
      token: ack.token,
      playerId: ack.playerId,
      name: this.name.trim(),
    });
    void this.router.navigate(['/room', this.code]);
  }
}
