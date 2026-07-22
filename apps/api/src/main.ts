import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  // rawBody: true expone req.rawBody, necesario para verificar la firma
  // X-Hub-Signature-256 del webhook de WhatsApp (Módulo 6) antes de que el
  // body parser transforme el cuerpo en JSON.
  const app = await NestFactory.create(AppModule, { rawBody: true });
  const configService = app.get(ConfigService);

  app.use(helmet());
  app.use(cookieParser());
  app.enableCors({
    origin: configService.getOrThrow<string[]>('allowedOrigins'),
    credentials: true,
  });
  app.setGlobalPrefix('api/v1', { exclude: ['api/docs'] });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  const swaggerConfig = new DocumentBuilder()
    .setTitle('Centro de Terapias API')
    .setDescription('API REST del sistema de administración del centro de terapias infantiles')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/docs', app, document);

  const port = configService.getOrThrow<number>('port');
  await app.listen(port);
  console.log(`API escuchando en http://localhost:${port}/api/v1 (docs en /api/docs)`);
}

void bootstrap();
