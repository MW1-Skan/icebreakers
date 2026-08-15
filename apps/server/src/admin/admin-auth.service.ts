/**
 * Authentification de la page /admin (PRD §4.3) : mot de passe simple
 * (variable d'environnement ADMIN_PASSWORD, sinon config.json), distinct de
 * la protection d'accès globale du site. Jetons opaques en mémoire (12 h).
 */
import { Injectable } from '@nestjs/common';
import { createHash, randomUUID, timingSafeEqual } from 'node:crypto';
import { AppConfigService } from '../config/app-config.service';

const TOKEN_TTL_MS = 12 * 60 * 60 * 1000;

@Injectable()
export class AdminAuthService {
  private tokens = new Map<string, number>(); // token → expiration (epoch ms)

  constructor(private readonly appConfig: AppConfigService) {}

  private expectedPassword(): string {
    return process.env.ADMIN_PASSWORD ?? this.appConfig.config.adminPassword;
  }

  /** Comparaison à temps constant (via hachage, longueurs égales garanties). */
  private passwordMatches(candidate: string): boolean {
    const a = createHash('sha256').update(candidate).digest();
    const b = createHash('sha256').update(this.expectedPassword()).digest();
    return timingSafeEqual(a, b);
  }

  login(password: string): string | null {
    if (!this.passwordMatches(password)) return null;
    const token = randomUUID();
    this.tokens.set(token, Date.now() + TOKEN_TTL_MS);
    return token;
  }

  verify(token: string | undefined): boolean {
    if (!token) return false;
    const expiry = this.tokens.get(token);
    if (!expiry) return false;
    if (Date.now() > expiry) {
      this.tokens.delete(token);
      return false;
    }
    return true;
  }
}
