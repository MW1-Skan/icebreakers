/**
 * Vue publique projetée pendant la partie — un bloc par phase, conforme au
 * tableau « Écrans par phase » de la fiche 5.1. Aucun secret n'arrive ici
 * (garanti par les projections serveur + tests de non-fuite).
 */
import { Component, computed, input } from '@angular/core';
import type { ClientView, PlayerPublicView, UndercoverPublicView } from '@icebreakers/shared';
import { roleLabel } from '../../core/ui';
import { EndRevealComponent } from '../../components/end-reveal.component';
import { PlayersGridComponent, PlayerBadge } from '../../components/players-grid.component';
import { RecapBannerComponent } from '../../components/recap-banner.component';
import { TimerBadgeComponent } from '../../components/timer-badge.component';

@Component({
  selector: 'app-host-game',
  imports: [EndRevealComponent, PlayersGridComponent, RecapBannerComponent, TimerBadgeComponent],
  template: `
    @if (game(); as g) {
      <div class="stage">
        <div class="phase-header">
          <h1 class="tv-title">{{ phaseTitle() }}</h1>
          @if (g.manchesTotal > 1) {
            <span class="round tag manche">Manche {{ g.mancheIndex }}/{{ g.manchesTotal }}</span>
          }
          <span class="round tag">Tour {{ g.round }}</span>
          <app-timer-badge [timer]="view().room.timers[0]" [big]="true" />
        </div>

        @for (notice of view().room.notices; track notice.kind) {
          @if (notice.kind === 'contentRecycled') {
            <p class="notice">♻️ Contenu recyclé : toutes les paires de ce mode ont été vues, on re-mélange.</p>
          }
        }
        @if (g.suggestAbort && g.phase !== 'end') {
          <p class="notice warn">😴 Deuxième tour blanc d'affilée — envie d'abandonner la manche ? (barre de contrôle)</p>
        }

        @switch (g.phase) {
          @case ('distribute') {
            <p class="instruction">Consultez votre mot sur votre écran 📱 — bouton « voir mon mot ».</p>
            <app-players-grid [players]="alivePlayers()" [badges]="seenBadges()" />
            <p class="muted">✓ = a consulté son mot. L'animateur lance le tour de parole quand tout le monde est prêt.</p>
          }
          @case ('describe') {
            <p class="instruction">
              À l'oral, dans l'ordre : décris ton mot en un mot ou une courte phrase.
              @if (g.params.describePasses > 1) {
                <span class="tag">Tour de parole {{ g.describePass }}/{{ g.params.describePasses }}</span>
              }
            </p>
            <ol class="speaking-order">
              @for (id of g.speakingOrder; track id; let i = $index) {
                <li [class.current]="id === g.currentSpeakerId" [class.done]="i < currentSpeakerIndex()">
                  <span class="order-index">{{ i + 1 }}</span>
                  <span class="avatar">{{ playerById(id)?.avatar }}</span>
                  <span class="name">{{ playerById(id)?.name }}</span>
                  @if (id === g.currentSpeakerId) {
                    <span class="mic" aria-label="en train de parler">🎤</span>
                  }
                  @if (!playerById(id)?.connected) {
                    <span title="déconnecté — il passe">⏳ passe</span>
                  }
                </li>
              }
            </ol>
          }
          @case ('discuss') {
            <p class="instruction">Débattez ! Qui sonne faux ?</p>
            <app-players-grid [players]="alivePlayers()" />
          }
          @case ('vote') {
            @if (g.revoteCandidates; as candidates) {
              <p class="instruction">⚖️ Égalité ! Re-vote entre : <strong>{{ namesOf(candidates) }}</strong></p>
            } @else {
              <p class="instruction">Vote secret sur vos écrans — pas pour soi-même.</p>
            }
            <div class="tv-huge votes">{{ g.votesCast }}/{{ g.votesExpected }} ont voté</div>
            <app-players-grid [players]="alivePlayers()" />
          }
          @case ('reveal') {
            @if (g.lastReveal; as reveal) {
              @switch (reveal.kind) {
                @case ('eliminated') {
                  <div class="reveal-card card">
                    <div class="tv-title">{{ nameOf(reveal.eliminated!.playerId) }} est éliminé·e</div>
                    <div class="role-reveal" [attr.data-role]="reveal.eliminated!.role">
                      {{ roleLabel(reveal.eliminated!.role) }}
                    </div>
                  </div>
                }
                @case ('admin-removal') {
                  <div class="reveal-card card">
                    <div class="tv-title">{{ nameOf(reveal.eliminated!.playerId) }} est retiré·e de la manche</div>
                    <div class="role-reveal" [attr.data-role]="reveal.eliminated!.role">
                      {{ roleLabel(reveal.eliminated!.role) }}
                    </div>
                    @if (reveal.eliminated!.role === 'mrwhite') {
                      <p class="muted">Retrait administratif : pas de tentative de guess.</p>
                    }
                  </div>
                }
                @case ('tie-noelim') {
                  <div class="reveal-card card">
                    <div class="tv-title">Nouvelle égalité — personne n'est éliminé</div>
                    <p class="muted">On enchaîne un nouveau tour de description.</p>
                  </div>
                }
                @case ('blank-noelim') {
                  <div class="reveal-card card">
                    <div class="tv-title">Aucun vote exprimé — personne n'est éliminé</div>
                    <p class="muted">On enchaîne un nouveau tour.</p>
                  </div>
                }
              }
              @if (reveal.tally.length > 0) {
                <div class="tally">
                  @for (t of reveal.tally; track t.playerId) {
                    <div class="tally-row">
                      <span class="name">{{ nameOf(t.playerId) }}</span>
                      <div class="bar" [style.width.%]="tallyWidth(t.count)"></div>
                      <span class="count">{{ t.count }}</span>
                    </div>
                  }
                  @if (reveal.blankCount > 0) {
                    <div class="tally-row muted">
                      <span class="name">Votes blancs</span>
                      <span class="count">{{ reveal.blankCount }}</span>
                    </div>
                  }
                </div>
              }
              @if (reveal.votesByVoter; as details) {
                <p class="muted vote-details">
                  @for (d of details; track d.voterId) {
                    <span>{{ nameOf(d.voterId) }} → {{ d.target === 'blank' ? 'blanc' : nameOf(d.target) }}&nbsp;&nbsp;</span>
                  }
                </p>
              }
            }
          }
          @case ('whiteGuess') {
            @if (g.whiteGuess; as guess) {
              <div class="reveal-card card">
                <div class="tv-title">🃏 {{ nameOf(guess.playerId) }} était Mr. White…</div>
                @if (!guess.resolved) {
                  <p class="instruction">Il tente de deviner le mot des civils — le verdict est automatique.</p>
                } @else {
                  <div class="guess-line">
                    Sa proposition : <strong class="proposal">{{ guess.guess ?? '(aucune)' }}</strong>
                  </div>
                  <div class="verdict" [class.ok]="guess.correct" [class.ko]="!guess.correct">
                    {{ guess.correct ? '✔ Correct — Mr. White gagne seul !' : '✘ Raté !' }}
                  </div>
                }
              </div>
            }
          }
          @case ('end') {
            @if (g.end; as end) {
              <app-end-reveal [end]="end" [players]="view().room.players" [showCumulative]="g.manchesTotal > 1" />
              @if (end.isFinalManche) {
                <app-recap-banner [recap]="view().room.recap" />
              }
            }
          }
        }

        @if (g.phase !== 'end' && g.eliminations.length > 0) {
          <p class="eliminated-strip muted">
            Éliminés :
            @for (e of g.eliminations; track e.playerId) {
              <span>{{ nameOf(e.playerId) }} ({{ roleLabel(e.role) }})&nbsp;&nbsp;</span>
            }
          </p>
        }
      </div>
    }
  `,
  styles: [
    `
      .stage {
        display: flex;
        flex-direction: column;
        gap: 1.2rem;
      }
      .phase-header {
        display: flex;
        align-items: center;
        gap: 1.2rem;
        flex-wrap: wrap;
      }
      .phase-header h1 {
        margin: 0;
        flex: 1;
      }
      .instruction {
        font-size: 1.5rem;
        margin: 0;
      }
      .notice {
        background: var(--bg-raised);
        border: 1px solid var(--info);
        border-radius: 10px;
        padding: 0.5rem 1rem;
        margin: 0;
      }
      .notice.warn {
        border-color: var(--accent);
      }
      .speaking-order {
        list-style: none;
        margin: 0;
        padding: 0;
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
        font-size: 1.6rem;
      }
      .speaking-order li {
        display: flex;
        align-items: center;
        gap: 0.9rem;
        padding: 0.4rem 1rem;
        border-radius: var(--radius);
        border: 2px solid transparent;
      }
      .speaking-order li.current {
        border-color: var(--accent);
        background: #2b2a1a;
        font-weight: 800;
      }
      .speaking-order li.done {
        opacity: 0.5;
      }
      .order-index {
        width: 1.6em;
        height: 1.6em;
        display: grid;
        place-items: center;
        background: var(--bg-raised);
        border-radius: 50%;
        font-size: 0.8em;
      }
      .votes {
        text-align: center;
        margin: 1rem 0;
      }
      .reveal-card {
        text-align: center;
        padding: 2rem;
      }
      .role-reveal {
        font-size: clamp(2rem, 6vw, 4rem);
        font-weight: 900;
        margin-top: 0.5rem;
      }
      .role-reveal[data-role='civilian'] {
        color: var(--ok);
      }
      .role-reveal[data-role='undercover'] {
        color: var(--danger);
      }
      .role-reveal[data-role='mrwhite'] {
        color: var(--accent);
      }
      .tally {
        display: flex;
        flex-direction: column;
        gap: 0.4rem;
        max-width: 560px;
        margin: 0 auto;
        width: 100%;
      }
      .tally-row {
        display: flex;
        align-items: center;
        gap: 0.8rem;
        font-size: 1.2rem;
      }
      .tally-row .name {
        width: 10em;
        text-align: right;
      }
      .tally-row .bar {
        height: 1.1em;
        background: var(--info);
        border-radius: 6px;
        min-width: 4px;
      }
      .tally-row .count {
        font-weight: 800;
      }
      .guess-line {
        font-size: 1.5rem;
        margin: 0.8rem 0;
      }
      .proposal {
        color: var(--accent);
      }
      .verdict {
        font-size: 2rem;
        font-weight: 900;
      }
      .verdict.ok {
        color: var(--ok);
      }
      .verdict.ko {
        color: var(--danger);
      }
      .vote-details {
        text-align: center;
      }
      .eliminated-strip {
        border-top: 1px solid var(--border);
        padding-top: 0.6rem;
      }
    `,
  ],
})
export class HostGameComponent {
  readonly view = input.required<ClientView>();
  protected readonly roleLabel = roleLabel;

  readonly game = computed<UndercoverPublicView | undefined>(() => this.view().room.game);

  readonly phaseTitle = computed(() => {
    switch (this.game()?.phase) {
      case 'distribute':
        return 'Distribution des mots';
      case 'describe':
        return 'Tour de description';
      case 'discuss':
        return 'Discussion !';
      case 'vote':
        return 'Vote secret';
      case 'reveal':
        return 'Révélation';
      case 'whiteGuess':
        return 'Mr. White tente sa chance…';
      case 'end': {
        const g = this.game();
        if (g && g.manchesTotal > 1 && !g.end?.isFinalManche) return `Fin de la manche ${g.mancheIndex}`;
        return g && g.manchesTotal > 1 ? 'Fin de la série' : 'Fin de partie';
      }
      default:
        return '';
    }
  });

  readonly currentSpeakerIndex = computed(() => {
    const g = this.game();
    if (!g?.currentSpeakerId) return -1;
    return g.speakingOrder.indexOf(g.currentSpeakerId);
  });

  playerById(id: string): PlayerPublicView | undefined {
    return this.view().room.players.find((p) => p.id === id);
  }

  nameOf(id: string): string {
    const p = this.playerById(id);
    return p ? `${p.avatar} ${p.name}` : '???';
  }

  namesOf(ids: string[]): string {
    return ids.map((id) => this.nameOf(id)).join(', ');
  }

  alivePlayers(): PlayerPublicView[] {
    const alive = this.game()?.aliveIds ?? [];
    return this.view().room.players.filter((p) => alive.includes(p.id));
  }

  seenBadges(): PlayerBadge[] {
    return (this.game()?.seenWordIds ?? []).map((playerId) => ({ playerId, icon: '✓' }));
  }

  tallyWidth(count: number): number {
    const max = Math.max(...(this.game()?.lastReveal?.tally.map((t) => t.count) ?? [1]), 1);
    return (count / max) * 60;
  }
}
