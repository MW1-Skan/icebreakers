import { Module } from '@nestjs/common';
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
  controllers: [AppController],
  providers: [
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
