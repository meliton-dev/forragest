import { Module } from '@nestjs/common';
import { PosModule } from '../pos/pos.module';
import { RoutesController } from './routes.controller';
import { RoutesService } from './routes.service';

@Module({ imports: [PosModule], controllers: [RoutesController], providers: [RoutesService] })
export class RoutesModule {}
