/**
 * REST /admin (PRD §4.3 + §6.4) : login, liste des packs, upload multipart
 * avec rapport de validation lisible, activer/désactiver, supprimer,
 * templates vides par jeu (endpoint public — un template ne porte aucun secret).
 */
import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  Res,
  UnauthorizedException,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { z } from 'zod';
import type { AdminLoginResponse, AdminPackContent, AdminPackInfo, AdminUploadResult, GameId } from '../shared';
import { AdminAuthService } from './admin-auth.service';
import { AdminGuard } from './admin.guard';
import { PacksService } from '../packs/packs.service';

const loginSchema = z.object({ password: z.string().min(1).max(200) });
const toggleSchema = z.object({ enabled: z.boolean() });
const GAMES: GameId[] = ['undercover', 'wavelength', 'justone', 'spyfall', 'ito', 'taboo', 'codenames'];

@Controller('api/admin')
export class AdminController {
  constructor(
    private readonly auth: AdminAuthService,
    private readonly packs: PacksService,
  ) {}

  @Post('login')
  login(@Body() body: unknown): AdminLoginResponse {
    const parsed = loginSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException('Mot de passe requis.');
    const token = this.auth.login(parsed.data.password);
    if (!token) throw new UnauthorizedException('Mot de passe incorrect.');
    return { token };
  }

  @Get('packs')
  @UseGuards(AdminGuard)
  list(): AdminPackInfo[] {
    return this.packs.adminList();
  }

  /** Contenu complet d'un pack (éditeur) — builtin compris, pour la duplication. */
  @Get('packs/:id')
  @UseGuards(AdminGuard)
  get(@Param('id') id: string): AdminPackContent {
    const found = this.packs.getPack(id);
    if (!found) throw new NotFoundException(`Pack « ${id} » introuvable.`);
    return found;
  }

  @Post('packs')
  @UseGuards(AdminGuard)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 2 * 1024 * 1024 } }))
  upload(@UploadedFile() file: Express.Multer.File | undefined): AdminUploadResult {
    if (!file) throw new BadRequestException('Aucun fichier reçu (champ « file »).');
    let parsed: unknown;
    try {
      parsed = JSON.parse(file.buffer.toString('utf-8'));
    } catch (err) {
      return { ok: false, errors: [`JSON invalide : ${String(err)}`] };
    }
    return this.packs.uploadPack(parsed);
  }

  @Patch('packs/:id')
  @UseGuards(AdminGuard)
  toggle(@Param('id') id: string, @Body() body: unknown): { ok: true } {
    const parsed = toggleSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException('Payload invalide ({ enabled: boolean }).');
    const result = this.packs.setEnabled(id, parsed.data.enabled);
    if (!result.ok) throw new NotFoundException(result.error);
    return { ok: true };
  }

  @Delete('packs/:id')
  @UseGuards(AdminGuard)
  remove(@Param('id') id: string): { ok: true } {
    const result = this.packs.deletePack(id);
    if (!result.ok) throw new BadRequestException(result.error);
    return { ok: true };
  }
}

/** Templates publics : `GET /api/packs/template/<jeu>` télécharge un squelette. */
@Controller('api/packs')
export class PackTemplatesController {
  constructor(private readonly packs: PacksService) {}

  @Get('template/:game')
  template(@Param('game') game: string, @Res() res: Response): void {
    if (!GAMES.includes(game as GameId)) {
      throw new NotFoundException(`Jeu inconnu : ${game}.`);
    }
    const template = this.packs.templateFor(game as GameId);
    res
      .setHeader('Content-Type', 'application/json; charset=utf-8')
      .setHeader('Content-Disposition', `attachment; filename="template-${game}.json"`)
      .send(JSON.stringify(template, null, 2));
  }
}
