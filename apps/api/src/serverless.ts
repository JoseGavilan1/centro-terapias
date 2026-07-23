import type { IncomingMessage, ServerResponse } from 'http';
import { NestFactory } from '@nestjs/core';
import { ExpressAdapter } from '@nestjs/platform-express';
import express from 'express';
import { configureApp } from './bootstrap';
import { AppModule } from './app.module';

/**
 * Entrypoint para Vercel Functions. Se compila con `nest build` (tsc), no con el bundler
 * esbuild que usa Vercel por defecto para TS en `api/` — este último no soporta
 * `emitDecoratorMetadata`, del que depende la inyección de dependencias de Nest.
 * El shim en `api/index.js` solo hace `require()` del `.js` ya compilado.
 */
const server = express();
let appReady: Promise<void> | null = null;

async function bootstrapServerless(): Promise<void> {
  const app = await NestFactory.create(AppModule, new ExpressAdapter(server), { rawBody: true });
  configureApp(app);
  await app.init();
}

export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (!appReady) {
    appReady = bootstrapServerless();
  }
  await appReady;
  server(req, res);
}
