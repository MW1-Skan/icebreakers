/**
 * Étape 8 (déploiement) — les deux premières lignes du DoD, prouvées sur le
 * build réel : le garde-fou refuse un démarrage prod avec le mot de passe
 * admin par défaut, et un lancement de prod complet (NODE_ENV=production,
 * bind 127.0.0.1 par défaut) sert front, /health, robots.txt et /admin.
 */
import { expect, test } from '@playwright/test';
import { spawn, type ChildProcess } from 'node:child_process';
import * as path from 'node:path';

const REPO_ROOT = path.resolve(__dirname, '..');
const MAIN_JS = path.join(REPO_ROOT, 'apps', 'server', 'dist', 'apps', 'server', 'src', 'main.js');
const PROD_PORT = 3199; // hors 3000 (dev) et 3100 (webServer e2e)
const PROD_URL = `http://127.0.0.1:${PROD_PORT}`;

/**
 * Lance le build serveur comme en prod. CONFIG_PATH pointe sur
 * config.example.json (adminPassword « change-me » garanti), indépendamment
 * d'un éventuel config.json local ; ADMIN_PASSWORD n'est hérité que via
 * `adminPassword`.
 */
function spawnProd(adminPassword?: string): ChildProcess {
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    NODE_ENV: 'production',
    PORT: String(PROD_PORT),
    CONFIG_PATH: path.join(REPO_ROOT, 'config.example.json'),
    DATA_PACKS_DIR: path.join(__dirname, '.tmp-admin', 'prod-packs'),
  };
  delete env.HOST; // on teste le défaut prod : 127.0.0.1
  delete env.ADMIN_PASSWORD;
  if (adminPassword !== undefined) env.ADMIN_PASSWORD = adminPassword;
  return spawn(process.execPath, [MAIN_JS], { cwd: REPO_ROOT, env });
}

/** Attend la fin du process (borne 20 s) et rend code de sortie + sortie. */
function waitForExit(child: ChildProcess): Promise<{ code: number | null; output: string }> {
  return new Promise((resolve, reject) => {
    let output = '';
    child.stdout?.on('data', (chunk: Buffer) => (output += chunk.toString()));
    child.stderr?.on('data', (chunk: Buffer) => (output += chunk.toString()));
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error(`Le serveur ne s'est pas arrêté. Sortie :\n${output}`));
    }, 20_000);
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ code, output });
    });
  });
}

async function waitForHealth(): Promise<void> {
  for (let i = 0; i < 60; i++) {
    try {
      const res = await fetch(`${PROD_URL}/health`);
      if (res.ok) return;
    } catch {
      // serveur pas encore prêt
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`${PROD_URL}/health ne répond pas après 15 s.`);
}

test('garde-fou : NODE_ENV=production + mot de passe admin par défaut → refus de démarrer', async () => {
  const child = spawnProd(undefined); // effectif = « change-me » (config.example.json)
  const { code, output } = await waitForExit(child);
  expect(code).toBe(1);
  expect(output).toContain('Démarrage refusé');
  expect(output).toContain('change-me');
});

test('lancement de prod local : front, /health, robots.txt et /admin sur 127.0.0.1', async ({
  request,
}) => {
  const child = spawnProd('mdp-prod-e2e');
  try {
    await waitForHealth();

    const health = await request.get(`${PROD_URL}/health`);
    expect(((await health.json()) as { ok: boolean }).ok).toBe(true);

    // robots.txt deny all, y compris avec un Accept HTML (le fallback SPA ne
    // doit pas l'avaler et répondre index.html).
    const robots = await request.get(`${PROD_URL}/robots.txt`, {
      headers: { accept: 'text/html,application/xhtml+xml' },
    });
    expect(robots.headers()['content-type']).toContain('text/plain');
    expect(await robots.text()).toBe('User-agent: *\nDisallow: /\n');

    // Le front buildé est servi (SPA + méta noindex).
    const home = await request.get(`${PROD_URL}/`, { headers: { accept: 'text/html' } });
    const html = await home.text();
    expect(html).toContain('<app-root');
    expect(html).toContain('noindex');

    // /admin : le mot de passe vient bien de l'env, le défaut est refusé.
    const badLogin = await request.post(`${PROD_URL}/api/admin/login`, {
      data: { password: 'change-me' },
    });
    expect(badLogin.status()).toBe(401);
    const login = await request.post(`${PROD_URL}/api/admin/login`, {
      data: { password: 'mdp-prod-e2e' },
    });
    expect(login.ok()).toBeTruthy();
  } finally {
    child.kill('SIGTERM');
    await waitForExit(child).catch(() => undefined);
  }
});
