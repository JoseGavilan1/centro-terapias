import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { HashingModule } from '../hashing/hashing.module';
import { SessionsModule } from '../sessions/sessions.module';
import { UsersService } from './application/users.service';
import { USER_REPOSITORY } from './domain/user.repository';
import { PrismaUserRepository } from './infrastructure/prisma-user.repository';
import { UsersController } from './presentation/users.controller';

@Module({
  imports: [AuditModule, HashingModule, SessionsModule],
  controllers: [UsersController],
  providers: [UsersService, { provide: USER_REPOSITORY, useClass: PrismaUserRepository }],
  exports: [UsersService, USER_REPOSITORY],
})
export class UsersModule {}
