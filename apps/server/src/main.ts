import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import * as express from 'express';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { AppModule } from './app.module';
import { AppConfigService } from './config/app-config.service';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    cors: { origin: true, credentials: true },
  });

  // En build de prod, Nest sert aussi le front Angular (SPA fallback inclus).
  const appConfig = app.get(AppConfigService);
  const webDist = appConfig.webDistDir;
  if (fs.existsSync(webDist)) {
    const staticHandler = express.static(webDist);
    const expressApp = app.getHttpAdapter().getInstance() as express.Express;
    expressApp.use(staticHandler);
    expressApp.use((req: express.Request, res: express.Response, next: express.NextFunction) => {
      const isApi =
        req.path.startsWith('/api') || req.path.startsWith('/socket.io') || req.path === '/health';
      if (req.method === 'GET' && !isApi && (req.headers.accept ?? '').includes('text/html')) {
        res.sendFile(path.join(webDist, 'index.html'));
        return;
      }
      next();
    });
  }

  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(`Serveur prêt sur http://localhost:${port} (packs: ${appConfig.builtinPacksDir})`);
}

void bootstrap();
