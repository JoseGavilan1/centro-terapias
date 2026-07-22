import { Module } from '@nestjs/common';
import { PASSWORD_HASHER } from './domain/password-hasher';
import { BcryptPasswordHasher } from './infrastructure/bcrypt-password-hasher';

@Module({
  providers: [{ provide: PASSWORD_HASHER, useClass: BcryptPasswordHasher }],
  exports: [PASSWORD_HASHER],
})
export class HashingModule {}
