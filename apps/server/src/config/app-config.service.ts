/**
 * Configuration d'instance (PRD §4.4) : `config.json` local (gitignoré) par-dessus
 * les défauts neutres de `config.example.json`. Le libellé du mode `interne`
 * vient d'ici — jamais du code.
 */
import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { DEFAULT_ADMIN_PASSWORD } from './boot-guard';

export interface AppConfig {
  siteName: string;
  internalModeLabel: string;
  timers: { discussSeconds: number; voteSeconds: number; whiteGuessSeconds: number };
  adminPassword: string;
}

const DEFAULTS: AppConfig = {
  siteName: 'Icebreakers',
  internalModeLabel: 'Interne',
  timers: { discussSeconds: 60, voteSeconds: 45, whiteGuessSeconds: 30 },
  adminPassword: DEFAULT_ADMIN_PASSWORD,
};

/** Remonte l'arborescence jusqu'à la racine du repo (marqueur : config.example.json). */
export function findRepoRoot(startDir: string = process.cwd()): string {
  let dir = startDir;
  for (let i = 0; i < 10; i++) {
    if (fs.existsSync(path.join(dir, 'config.example.json'))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return startDir;
}

@Injectable()
export class AppConfigService {
  private readonly logger = new Logger('Config');
  readonly repoRoot: string;
  readonly config: AppConfig;

  constructor() {
    this.repoRoot = process.env.APP_ROOT ?? findRepoRoot();
    this.config = this.load();
  }

  private load(): AppConfig {
    const configPath = process.env.CONFIG_PATH ?? path.join(this.repoRoot, 'config.json');
    if (!fs.existsSync(configPath)) return DEFAULTS;
    try {
      const parsed = JSON.parse(fs.readFileSync(configPath, 'utf-8')) as Partial<AppConfig>;
      return {
        ...DEFAULTS,
        ...parsed,
        timers: { ...DEFAULTS.timers, ...(parsed.timers ?? {}) },
      };
    } catch (err) {
      this.logger.warn(`config.json illisible (${String(err)}) — défauts utilisés.`);
      return DEFAULTS;
    }
  }

  get builtinPacksDir(): string {
    return process.env.PACKS_DIR ?? path.join(this.repoRoot, 'packs', 'builtin');
  }

  get dataPacksDir(): string {
    return process.env.DATA_PACKS_DIR ?? path.join(this.repoRoot, 'data', 'packs');
  }

  get webDistDir(): string {
    return process.env.WEB_DIST_DIR ?? path.join(this.repoRoot, 'apps', 'web', 'dist', 'web', 'browser');
  }

  /** La seed RNG injectable n'est acceptée qu'en dev/test (e2e déterministe). */
  get allowSeed(): boolean {
    return process.env.NODE_ENV !== 'production' || process.env.ALLOW_TEST_SEED === '1';
  }
}
