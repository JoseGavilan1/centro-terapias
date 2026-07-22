import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import {
  CreateRefreshTokenData,
  RefreshTokenRecord,
  RefreshTokenRepository,
} from '../domain/refresh-token.repository';

@Injectable()
export class PrismaRefreshTokenRepository implements RefreshTokenRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(data: CreateRefreshTokenData): Promise<RefreshTokenRecord> {
    return this.prisma.refreshToken.create({ data });
  }

  findByHash(tokenHash: string): Promise<RefreshTokenRecord | null> {
    return this.prisma.refreshToken.findUnique({ where: { tokenHash } });
  }

  async revoke(id: string, replacedById: string | null = null): Promise<boolean> {
    // updateMany + filtro revokedAt:null en vez de update: hace la
    // comprobación "no revocado aún" y la escritura una sola operación
    // atómica, cerrando la carrera entre dos /auth/refresh concurrentes con
    // el mismo token (ADR-05: un refresh token es de un solo uso).
    const result = await this.prisma.refreshToken.updateMany({
      where: { id, revokedAt: null },
      data: { revokedAt: new Date(), replacedById },
    });
    return result.count > 0;
  }

  async revokeAllForUser(userId: string, exceptTokenId?: string): Promise<number> {
    const result = await this.prisma.refreshToken.updateMany({
      where: {
        userId,
        revokedAt: null,
        ...(exceptTokenId ? { id: { not: exceptTokenId } } : {}),
      },
      data: { revokedAt: new Date() },
    });
    return result.count;
  }
}
