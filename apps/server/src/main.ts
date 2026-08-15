import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import * as express from 'express';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { AppModule } from './app.module';
import { AppConfigService } from './config/app-config.service';
import { assertProdAdminPassword, effectiveAdminPassword } from './config/boot-guard';

async function bootstrap(): Promise<void> {
  // Garde-fou AVANT toute initialisation : en prod, mot de passe admin par
  // défaut ou vide → refus de démarrer (PRD §7.4, étape 8).
  const appConfig = new AppConfigService();
  assertProdAdminPassword(
    process.env.NODE_ENV,
    effectiveAdminPassword(process.env, appConfig.config),
  );

  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    cors: { origin: true, credentials: true },
  });

  // En build de prod, Nest sert aussi le front Angular (SPA fallback inclus).
  const webDist = appConfig.webDistDir;
  if (fs.existsSync(webDist)) {
    const staticHandler = express.static(webDist);
    const expressApp = app.getHttpAdapter().getInstance() as express.Express;
    expressApp.use(staticHandler);
    expressApp.use((req: express.Request, res: express.Response, next: express.NextFunction) => {
      const isServerRoute =
        req.path.startsWith('/api') ||
        req.path.startsWith('/socket.io') ||
        req.path === '/health' ||
        req.path === '/robots.txt';
      if (req.method === 'GET' && !isServerRoute && (req.headers.accept ?? '').includes('text/html')) {
        res.sendFile(path.join(webDist, 'index.html'));
        return;
      }
      next();
    });
  }

  const port = Number(process.env.PORT ?? 3000);
  // En production, écoute locale par défaut : rien n'entre depuis le réseau,
  // tout transite par le tunnel sortant cloudflared (PRD §7.2). HOST permet de
  // surcharger (0.0.0.0 dans un conteneur, cf. docker-compose.yml).
  const host = process.env.HOST ?? (process.env.NODE_ENV === 'production' ? '127.0.0.1' : undefined);
  if (host === undefined) {
    await app.listen(port);
  } else {
    await app.listen(port, host);
  }
  // eslint-disable-next-line no-console
  console.log(`Serveur prêt sur http://${host ?? 'localhost'}:${port} (packs: ${appConfig.builtinPacksDir})`);
}

bootstrap().catch((err: unknown) => {
  // eslint-disable-next-line no-console
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
