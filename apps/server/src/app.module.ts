import { Module } from '@nestjs/common';
import { AdminAuthService } from './admin/admin-auth.service';
import { AdminController, PackTemplatesController } from './admin/admin.controller';
import { AppController } from './app.controller';
import { AppConfigService } from './config/app-config.service';
import { GameGateway } from './gateway/game.gateway';
import { GamesService } from './games/games.service';
import { PacksService } from './packs/packs.service';
import { NoopTeamHistoryStore } from './packs/team-history';
import { RoomBus } from './rooms/room-bus';
import { RoomService } from './rooms/room.service';
import { TimerService } from './rooms/timer.service';

@Module({
  controllers: [AppController, AdminController, PackTemplatesController],
  providers: [
    AdminAuthService,
    AppConfigService,
    NoopTeamHistoryStore,
    PacksService,
    TimerService,
    RoomBus,
    RoomService,
    GamesService,
    GameGateway,
  ],
})
export class AppModule {}
