import { ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/infrastructure/prisma/prisma.service';

/**
 * Levanta la aplicación completa (todos los módulos reales, Prisma real)
 * con la misma configuración de main.ts, contra la base definida en
 * DATABASE_URL del entorno de test (ver test/setup-e2e.ts).
 */
export async function createTestApp(): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleRef.createNestApplication({ rawBody: true });

  app.use(cookieParser());
  app.setGlobalPrefix('api/v1');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  await app.init();
  return app;
}

/** Limpia todas las tablas de negocio entre tests (orden respeta FKs). */
export async function cleanDatabase(app: INestApplication): Promise<void> {
  const prisma = app.get(PrismaService);
  await prisma.auditLog.deleteMany();
  await prisma.refreshToken.deleteMany();
  await prisma.incident.deleteMany();
  await prisma.waitlistEntry.deleteMany();
  await prisma.whatsAppMessage.deleteMany();
  await prisma.whatsAppConversation.deleteMany();
  await prisma.document.deleteMany();
  await prisma.evolution.deleteMany();
  await prisma.appointment.deleteMany();
  await prisma.therapySlot.deleteMany();
  await prisma.patient.deleteMany();
  await prisma.user.deleteMany();
  await prisma.organization.deleteMany();
}
