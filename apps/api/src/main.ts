import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { configureApp } from './bootstrap';
import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  // rawBody: true expone req.rawBody, necesario para verificar la firma
  // X-Hub-Signature-256 del webhook de WhatsApp (Módulo 6) antes de que el
  // body parser transforme el cuerpo en JSON.
  const app = await NestFactory.create(AppModule, { rawBody: true });
  configureApp(app);

  const configService = app.get(ConfigService);
  const port = configService.getOrThrow<number>('port');
  await app.listen(port);
  console.log(`API escuchando en http://localhost:${port}/api/v1 (docs en /api/docs)`);
}

void bootstrap();
