/**
 * Page /admin (PRD §4.3) : outil de devs — login simple, liste des packs
 * (jeu, mode, entrées, actif/inactif), upload JSON avec rapport d'erreurs
 * lisible, activation/désactivation, suppression, templates par jeu.
 */
import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import type { AdminPackInfo, AdminUploadResult, GameId } from '@icebreakers/shared';

const TOKEN_KEY = 'icebreakers:admin';
const GAME_EMOJI: Record<GameId, string> = {
  undercover: '🕵️',
  justone: '☝️',
  wavelength: '🌊',
  ito: '🔢',
  spyfall: '🔎',
  taboo: '⏱️',
};
const GAMES: GameId[] = ['undercover', 'justone', 'wavelength', 'ito', 'spyfall', 'taboo'];

@Component({
  selector: 'app-admin',
  imports: [FormsModule, RouterLink],
  template: `
    <main class="admin">
      <header>
        <h1>Administration des packs</h1>
        <a routerLink="/" class="tag">← Accueil</a>
        @if (token()) {
          <button (click)="logout()">Se déconnecter</button>
        }
      </header>

      @if (!token()) {
        <form class="card login" (ngSubmit)="login()">
          <label for="pwd">Mot de passe admin</label>
          <input id="pwd" name="pwd" type="password" [(ngModel)]="passwordInput" autocomplete="current-password" />
          <button class="primary" type="submit" [disabled]="passwordInput.length === 0 || busy()">Entrer</button>
          @if (error(); as e) {
            <p class="error" role="alert">{{ e }}</p>
          }
        </form>
      } @else {
        <section class="card">
          <h2>Ajouter un pack</h2>
          <p class="muted">
            Un fichier JSON validé à l'upload (rapport d'erreurs sinon). Les packs ajoutés vivent dans
            <code>data/packs/</code> — jamais dans Git. Ré-uploader un id existant le remplace.
          </p>
          <input type="file" accept=".json,application/json" (change)="onFile($event)" [disabled]="busy()" />
          @if (uploadReport(); as report) {
            @if (report.ok) {
              <p class="success">
                ✔ Pack « {{ report.packId }} » {{ report.replaced ? 'remplacé' : 'ajouté' }}
                ({{ report.entriesCount }} entrées) — jouable immédiatement.
              </p>
            } @else {
              <div class="error-report" role="alert">
                <strong>Pack refusé :</strong>
                <ul>
                  @for (line of report.errors; track line) {
                    <li>{{ line }}</li>
                  }
                </ul>
              </div>
            }
          }
          <p class="muted templates">
            Templates vides :
            @for (game of games; track game) {
              <a [href]="'/api/packs/template/' + game" download>{{ gameEmoji[game] }} {{ game }}</a>
            }
          </p>
        </section>

        <section class="card">
          <h2>Packs chargés <span class="tag">{{ packs().length }}</span></h2>
          @if (error(); as e) {
            <p class="error" role="alert">{{ e }}</p>
          }
          <table>
            <thead>
              <tr>
                <th>Jeu</th>
                <th>Pack</th>
                <th>Mode</th>
                <th>Entrées</th>
                <th>Source</th>
                <th>État</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              @for (pack of packs(); track pack.id) {
                <tr [class.disabled-row]="!pack.enabled">
                  <td>{{ gameEmoji[pack.game] }} {{ pack.game }}</td>
                  <td>
                    <strong>{{ pack.name }}</strong>
                    <span class="muted mono">{{ pack.id }}</span>
                  </td>
                  <td>{{ pack.mode }}</td>
                  <td class="num">{{ pack.entriesCount }}</td>
                  <td>
                    <span class="tag">{{ pack.source === 'builtin' ? 'intégré' : 'à chaud' }}</span>
                  </td>
                  <td>
                    <button (click)="toggle(pack)" [disabled]="busy()">
                      {{ pack.enabled ? '🟢 Actif' : '⚫ Inactif' }}
                    </button>
                  </td>
                  <td>
                    @if (pack.source === 'data') {
                      <button class="danger" (click)="remove(pack)" [disabled]="busy()">Supprimer</button>
                    }
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </section>
      }
    </main>
  `,
  styles: [
    `
      .admin {
        max-width: 980px;
        margin: 0 auto;
        padding: 2rem 1.5rem;
        display: flex;
        flex-direction: column;
        gap: 1.2rem;
      }
      header {
        display: flex;
        align-items: center;
        gap: 1rem;
      }
      header h1 {
        margin: 0;
        flex: 1;
      }
      .login {
        display: flex;
        flex-direction: column;
        gap: 0.6rem;
        max-width: 380px;
      }
      .error {
        color: var(--danger);
        margin: 0.3rem 0 0;
      }
      .success {
        color: var(--ok);
        font-weight: 600;
      }
      .error-report {
        border: 1px solid var(--danger);
        border-radius: 10px;
        padding: 0.6rem 1rem;
        margin-top: 0.6rem;
      }
      .error-report ul {
        margin: 0.3rem 0 0;
        padding-left: 1.2rem;
      }
      .templates a {
        margin-right: 0.8rem;
      }
      input[type='file'] {
        margin: 0.6rem 0;
      }
      table {
        width: 100%;
        border-collapse: collapse;
        font-size: 0.98rem;
      }
      th {
        text-align: left;
        color: var(--fg-muted);
        font-weight: 600;
        padding: 0.3rem 0.6rem;
        border-bottom: 1px solid var(--border);
      }
      td {
        padding: 0.45rem 0.6rem;
        border-bottom: 1px solid var(--border);
        vertical-align: middle;
      }
      td .mono {
        display: block;
        font-size: 0.8rem;
        font-family: ui-monospace, monospace;
      }
      .num {
        text-align: right;
        font-variant-numeric: tabular-nums;
      }
      .disabled-row {
        opacity: 0.55;
      }
    `,
  ],
})
export class AdminPage {
  readonly token = signal<string | null>(localStorage.getItem(TOKEN_KEY));
  readonly packs = signal<AdminPackInfo[]>([]);
  readonly uploadReport = signal<AdminUploadResult | null>(null);
  readonly error = signal<string | null>(null);
  readonly busy = signal(false);
  passwordInput = '';

  readonly games = GAMES;
  readonly gameEmoji = GAME_EMOJI;

  constructor() {
    if (this.token()) void this.refresh();
  }

  private async api<T>(path: string, init: RequestInit = {}): Promise<T> {
    const response = await fetch(path, {
      ...init,
      headers: { ...(init.headers ?? {}), Authorization: `Bearer ${this.token()}` },
    });
    if (response.status === 401) {
      this.logout();
      throw new Error('Session expirée — reconnecte-toi.');
    }
    if (!response.ok) {
      const body = (await response.json().catch(() => ({}))) as { message?: string };
      throw new Error(body.message ?? `Erreur ${response.status}`);
    }
    return (await response.json()) as T;
  }

  async login(): Promise<void> {
    this.busy.set(true);
    this.error.set(null);
    try {
      const response = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: this.passwordInput }),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as { message?: string };
        throw new Error(body.message ?? 'Connexion refusée.');
      }
      const { token } = (await response.json()) as { token: string };
      localStorage.setItem(TOKEN_KEY, token);
      this.token.set(token);
      this.passwordInput = '';
      await this.refresh();
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : String(err));
    } finally {
      this.busy.set(false);
    }
  }

  logout(): void {
    localStorage.removeItem(TOKEN_KEY);
    this.token.set(null);
    this.packs.set([]);
  }

  async refresh(): Promise<void> {
    try {
      this.packs.set(await this.api<AdminPackInfo[]>('/api/admin/packs'));
      this.error.set(null);
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : String(err));
    }
  }

  async onFile(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    this.busy.set(true);
    this.uploadReport.set(null);
    try {
      const form = new FormData();
      form.append('file', file);
      const report = await this.api<AdminUploadResult>('/api/admin/packs', { method: 'POST', body: form });
      this.uploadReport.set(report);
      await this.refresh();
    } catch (err) {
      this.uploadReport.set({ ok: false, errors: [err instanceof Error ? err.message : String(err)] });
    } finally {
      this.busy.set(false);
      input.value = '';
    }
  }

  async toggle(pack: AdminPackInfo): Promise<void> {
    this.busy.set(true);
    try {
      await this.api(`/api/admin/packs/${pack.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: !pack.enabled }),
      });
      await this.refresh();
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : String(err));
    } finally {
      this.busy.set(false);
    }
  }

  async remove(pack: AdminPackInfo): Promise<void> {
    if (!confirm(`Supprimer définitivement le pack « ${pack.id} » ?`)) return;
    this.busy.set(true);
    try {
      await this.api(`/api/admin/packs/${pack.id}`, { method: 'DELETE' });
      await this.refresh();
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : String(err));
    } finally {
      this.busy.set(false);
    }
  }
}
