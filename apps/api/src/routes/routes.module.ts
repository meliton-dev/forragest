import { Module } from '@nestjs/common';
import { PosModule } from '../pos/pos.module';
import { PingRetention } from './ping-retention';
import { RoutesController } from './routes.controller';
import { RoutesService } from './routes.service';

@Module({ imports: [PosModule], controllers: [RoutesController], providers: [RoutesService, PingRetention] })
export class RoutesModule {}
