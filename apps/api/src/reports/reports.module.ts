import { Controller, Get, Module, Query } from '@nestjs/common';
import { Role } from '@prisma/client';
import { Roles } from '../common/roles';
import { SalesReportService } from './sales-report.service';

@Roles(Role.ADMINISTRADOR)
@Controller('reports')
export class ReportsController {
  constructor(private sales: SalesReportService) {}

  /** Ventas de un día (?date=AAAA-MM-DD; sin fecha, hoy): mostrador por caja, turnos y reparto por ruta. */
  @Get('sales')
  daily(@Query('date') date?: string) {
    return this.sales.daily(date);
  }
}

@Module({ controllers: [ReportsController], providers: [SalesReportService] })
export class ReportsModule {}
