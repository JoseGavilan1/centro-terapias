import { Module } from '@nestjs/common';
import { ReportsService } from './application/reports.service';
import { ReportsController } from './presentation/reports.controller';

/**
 * Sin domain/infrastructure propios (§1.1 modulo-09-reportes.md): es agregación de lectura pura
 * sobre entidades de otros módulos, sin una entidad propia que abstraer con un repositorio.
 */
@Module({
  controllers: [ReportsController],
  providers: [ReportsService],
})
export class ReportsModule {}
