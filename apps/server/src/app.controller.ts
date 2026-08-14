import { Controller, Get } from '@nestjs/common';
import { AppConfigService } from './config/app-config.service';

@Controller()
export class AppController {
  constructor(private readonly appConfig: AppConfigService) {}

  @Get('health')
  health(): { ok: boolean; uptime: number } {
    return { ok: true, uptime: process.uptime() };
  }

  /** Bits de config publics (nom du site, libellé du mode interne). */
  @Get('api/config')
  config(): { siteName: string; internalModeLabel: string } {
    return {
      siteName: this.appConfig.config.siteName,
      internalModeLabel: this.appConfig.config.internalModeLabel,
    };
  }
}
