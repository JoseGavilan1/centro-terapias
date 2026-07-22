import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AuditModule } from '../audit/audit.module';
import { HashingModule } from '../hashing/hashing.module';
import { SessionsModule } from '../sessions/sessions.module';
import { UsersModule } from '../users/users.module';
import { AuthService } from './application/auth.service';
import { TokenService } from './application/token.service';
import { AuthController } from './presentation/auth.controller';

@Module({
  imports: [JwtModule.register({}), AuditModule, HashingModule, SessionsModule, UsersModule],
  controllers: [AuthController],
  providers: [AuthService, TokenService],
  // TokenService se exporta porque JwtAuthGuard (guard global registrado en
  // AppModule) lo inyecta para verificar el access token en un único lugar.
  exports: [TokenService],
})
export class AuthModule {}
