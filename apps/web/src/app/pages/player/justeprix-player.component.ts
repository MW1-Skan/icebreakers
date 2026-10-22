/**
 * Juste Prix — écran joueur : la photo de l'article, la saisie de SA mise
 * (secrète, modifiable jusqu'à la clôture), puis son résultat à la révélation.
 */
import { Component, computed, effect, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import type { ClientView, JustePrixMeView, JustePrixPublicView } from '@icebreakers/shared';
import { SocketService } from '../../core/socket.service';
import { TimerBadgeComponent } from '../../components/timer-badge.component';
import { formatDelta, formatEuros, parseEuros } from '../../core/ui';

@Component({
  selector: 'app-justeprix-player',
  imports: [FormsModule, TimerBadgeComponent],
  template: `
    @if (game(); as g) {
      @if (me(); as m) {
        @if (!m.inGame) {
          <div class="card center-card">
            <h2>Partie en cours 🍿</h2>
            <p class="muted">Tu joueras la prochaine — regarde la TV en attendant.</p>
          </div>
        } @else {
          <div class="stack">
            <div class="banner">
              🏷️ {{ g.phase === 'guess' ? 'Combien ça coûte ?' : g.phase === 'reveal' ? 'Le juste prix !' : 'Fin de partie' }}
              <span class="muted counter">Article {{ g.itemNumber }}/{{ g.itemsCount }}</span>
            </div>

            @switch (g.phase) {
              @case ('guess') {
                @if (g.item; as item) {
                  <section class="card">
                    <figure class="photo">
                      @if (imageOk(item.image)) {
                        <img [src]="item.image" [alt]="item.name" referrerpolicy="no-referrer" (error)="markBroken(item.image)" />
                      } @else {
                        <div class="photo-fallback">📷 Regarde la TV</div>
                      }
                    </figure>
                    <h2 class="item-name">{{ item.name }}</h2>
                    @if (item.details) {
                      <p class="muted item-details">{{ item.details }}</p>
                    }

                    <form (ngSubmit)="submit()">
                      <label for="estimate" class="sr-only">Ton estimation en euros</label>
                      <div class="amount-field">
                        <input
                          id="estimate"
                          name="estimate"
                          [ngModel]="amount()"
                          (ngModelChange)="amount.set($event)"
                          inputmode="decimal"
                          autocomplete="off"
                          placeholder="Ton estimation"
                          aria-describedby="estimate-preview"
                        />
                        <span class="euro" aria-hidden="true">€</span>
                      </div>
                      <button class="primary" type="submit" [disabled]="parsed() === undefined">
                        {{ m.myBid === undefined ? 'Miser' : 'Modifier' }}
                      </button>
                    </form>
                    <p id="estimate-preview" class="muted small">
                      @if (amount().trim() && parsed() === undefined) {
                        <span class="error">Un montant en euros, 2 décimales max (ex. 49,90).</span>
                      } @else if (parsed() !== undefined) {
                        {{ euros(parsed()!) }}
                      }
                    </p>
                    @if (error(); as err) {
                      <p class="error" role="alert">{{ err }}</p>
                    }
                    @if (m.myBid !== undefined) {
                      <p class="ok-line">
                        ✓ Mise enregistrée : <strong data-testid="my-bid">{{ euros(m.myBid) }}</strong><span class="muted small">
                          — modifiable jusqu'à la fin du chrono. Personne ne la voit.</span
                        >
                      </p>
                    }
                    @if (g.params.noOverbid) {
                      <p class="muted small">💥 Sans dépasser : une mise au-dessus du prix ne rapporte rien.</p>
                    }
                    <div class="row-center"><app-timer-badge [timer]="view().room.timers[0]" /></div>
                  </section>
                }
              }
              @case ('reveal') {
                <section class="card center-card">
                  @if (g.lastResult; as r) {
                    <p class="muted">{{ r.item.name }}</p>
                    <div class="price">{{ euros(r.item.price) }}</div>
                    <div class="my-line" data-testid="my-result">{{ myRevealLine() }}</div>
                  }
                  <p class="muted">Le classement est sur la TV 📺</p>
                </section>
              }
              @case ('end') {
                <section class="card center-card">
                  <div class="price">{{ myTotal() }} pts</div>
                  <p class="muted">Classement final et récap des articles sur la TV 📺</p>
                </section>
              }
            }
          </div>
        }
      }
    }
  `,
  styles: [
    `
      .stack {
        display: flex;
        flex-direction: column;
        gap: 1rem;
      }
      .center-card {
        text-align: center;
      }
      .banner {
        display: flex;
        align-items: baseline;
        gap: 0.8rem;
        font-size: 1.25rem;
        font-weight: 700;
        color: var(--game-color, var(--accent));
      }
      .banner .counter {
        font-size: 0.9rem;
        font-weight: 400;
        margin-left: auto;
      }
      .photo {
        margin: 0 0 0.8rem;
        display: grid;
        place-items: center;
        background: #fff;
        border-radius: var(--radius-sm);
        padding: 0.6rem;
        height: 240px;
      }
      .photo img {
        max-width: 100%;
        max-height: 100%;
        object-fit: contain;
      }
      .photo-fallback {
        color: #555;
        font-weight: 700;
      }
      .item-name {
        margin: 0;
        font-size: 1.4rem;
      }
      .item-details {
        margin: 0.2rem 0 0;
      }
      form {
        display: flex;
        gap: 0.6rem;
        margin: 1rem 0 0.3rem;
      }
      .amount-field {
        flex: 1;
        min-width: 0;
        position: relative;
        display: flex;
        align-items: center;
      }
      .amount-field input {
        flex: 1;
        width: 100%;
        min-width: 0;
        font-size: 1.4rem;
        padding-right: 2em;
        font-variant-numeric: tabular-nums;
      }
      .euro {
        position: absolute;
        right: 0.8em;
        font-size: 1.3rem;
        color: var(--fg-muted);
      }
      .small {
        font-size: 0.85rem;
      }
      .error {
        color: var(--danger);
      }
      .ok-line {
        color: var(--ok);
      }
      .price {
        font-size: 2.6rem;
        font-weight: 900;
        color: var(--game-color, var(--accent));
        font-variant-numeric: tabular-nums;
      }
      .my-line {
        font-size: 1.3rem;
        font-weight: 800;
        margin: 0.6rem 0;
      }
      .row-center {
        display: flex;
        justify-content: center;
      }
      .sr-only {
        position: absolute;
        width: 1px;
        height: 1px;
        overflow: hidden;
        clip: rect(0 0 0 0);
      }
    `,
  ],
})
export class JustePrixPlayerComponent {
  private readonly socket = inject(SocketService);
  readonly view = input.required<ClientView>();

  readonly amount = signal('');
  readonly error = signal<string | null>(null);
  private readonly brokenImages = signal<ReadonlySet<string>>(new Set());

  readonly game = computed<JustePrixPublicView | undefined>(() => {
    const g = this.view().room.game;
    return g?.kind === 'justeprix' ? g : undefined;
  });
  readonly me = computed<JustePrixMeView | undefined>(() => this.view().me?.game?.justeprix);
  readonly parsed = computed(() => parseEuros(this.amount()));

  constructor() {
    // Nouvel article (ou article changé par l'animateur) : saisie remise à zéro.
    let lastKey: string | undefined;
    effect(() => {
      const g = this.game();
      const key = g ? `${g.itemNumber}|${g.item?.image ?? ''}` : undefined;
      if (key !== lastKey) {
        lastKey = key;
        this.amount.set('');
        this.error.set(null);
      }
    });
  }

  async submit(): Promise<void> {
    const amount = this.parsed();
    if (amount === undefined) return;
    this.error.set(null);
    const ack = await this.socket.gameAction({ type: 'estimate', amount });
    if (!ack.ok) this.error.set(ack.error.message);
  }

  imageOk(url: string): boolean {
    return !this.brokenImages().has(url);
  }

  markBroken(url: string): void {
    this.brokenImages.update((set) => new Set([...set, url]));
  }

  euros(amount: number): string {
    return formatEuros(amount);
  }

  myRevealLine(): string {
    const g = this.game();
    const myId = this.view().me?.playerId;
    const mine = g?.lastResult?.results.find((r) => r.playerId === myId);
    if (!g || !mine) return 'Pas de mise sur cet article (0 pt)';
    const said = `Tu as dit ${formatEuros(mine.amount)} (${formatDelta(mine.delta)})`;
    if (mine.overbid && g.params.noOverbid) return `${said} → 💥 dépassé, 0 pt`;
    const bullseye = mine.bullseye ? ' 🎯' : '';
    const rank = mine.rank === 1 ? '1er' : `${mine.rank}e`;
    return `${said} → ${rank}, +${mine.points} pt${mine.points > 1 ? 's' : ''}${bullseye}`;
  }

  myTotal(): number {
    const myId = this.view().me?.playerId;
    return this.game()?.totals.find((t) => t.playerId === myId)?.points ?? 0;
  }
}
