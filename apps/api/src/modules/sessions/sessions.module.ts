import { Module } from '@nestjs/common';
import { REFRESH_TOKEN_REPOSITORY } from './domain/refresh-token.repository';
import { PrismaRefreshTokenRepository } from './infrastructure/prisma-refresh-token.repository';

@Module({
  providers: [{ provide: REFRESH_TOKEN_REPOSITORY, useClass: PrismaRefreshTokenRepository }],
  exports: [REFRESH_TOKEN_REPOSITORY],
})
export class SessionsModule {}
