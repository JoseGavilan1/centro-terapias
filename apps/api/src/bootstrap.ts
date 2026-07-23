import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';

/** Configuración común de la app Nest, compartida entre el bootstrap local (main.ts) y el entrypoint serverless de Vercel. */
export function configureApp(app: INestApplication): void {
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
}
