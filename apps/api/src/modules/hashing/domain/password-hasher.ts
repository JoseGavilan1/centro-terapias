/**
 * Puerto de hashing de contraseñas (ADR-08).
 * La implementación concreta (bcrypt hoy, argon2id a futuro) es un detalle
 * de infraestructura intercambiable sin tocar los casos de uso.
 */
export interface PasswordHasher {
  hash(plain: string): Promise<string>;
  compare(plain: string, hash: string): Promise<boolean>;
}

export const PASSWORD_HASHER = Symbol('PASSWORD_HASHER');
