/**
 * Seed inicial: crea la organización y el usuario administrador si no existen.
 * Idempotente: puede ejecutarse múltiples veces sin duplicar datos.
 *
 *   npm run prisma:seed -w @centro/api
 */
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

const BCRYPT_ROUNDS = 12;

async function main(): Promise<void> {
  const orgName = process.env.SEED_ORG_NAME ?? 'Centro de Terapias Demo';
  const adminEmail = process.env.SEED_ADMIN_EMAIL ?? 'admin@demo.cl';
  const adminPassword = process.env.SEED_ADMIN_PASSWORD ?? 'Admin123!';

  let organization = await prisma.organization.findFirst({ where: { name: orgName } });
  if (!organization) {
    organization = await prisma.organization.create({
      data: { name: orgName, timezone: 'America/Santiago' },
    });
    console.log(`Organización creada: ${organization.name} (${organization.id})`);
  } else {
    console.log(`Organización ya existe: ${organization.name}`);
  }

  const existingAdmin = await prisma.user.findUnique({ where: { email: adminEmail } });
  if (existingAdmin) {
    console.log(`Administrador ya existe: ${adminEmail}`);
    return;
  }

  await prisma.user.create({
    data: {
      organizationId: organization.id,
      email: adminEmail,
      passwordHash: await bcrypt.hash(adminPassword, BCRYPT_ROUNDS),
      firstName: 'Administrador',
      lastName: 'Sistema',
      role: 'ADMIN',
      mustChangePassword: true,
    },
  });
  console.log(`Administrador creado: ${adminEmail} (contraseña inicial: ${adminPassword})`);
  console.log('Debe cambiarse la contraseña en el primer inicio de sesión.');
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
