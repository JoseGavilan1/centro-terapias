import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';

/** Global: la conexión a la base de datos es única y transversal. */
@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
