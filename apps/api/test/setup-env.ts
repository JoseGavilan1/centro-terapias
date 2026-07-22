/**
 * Los tests e2e limpian tablas completas entre casos (ver cleanDatabase en
 * test-app.ts). Deben apuntar a una base de datos dedicada, nunca a la de
 * desarrollo — de lo contrario cada corrida borra los datos de `npm run
 * prisma:seed`. Se sobrescribe aquí (antes de que AppModule cargue
 * ConfigModule) en vez de depender de sintaxis de variables de entorno de
 * shell, que difiere entre bash y PowerShell/cmd.
 */
// Puerto 5433 (no 5432): ver docker-compose.override.yml — este host ya tenía otro
// proyecto ocupando 5432. Ajustar si el mapeo de puertos de Postgres cambia.
process.env.DATABASE_URL =
  'postgresql://centro:centro_dev@localhost:5433/centro_terapias_test?schema=public';

/**
 * Módulo 5: los e2e usan siempre el doble local-disk (nunca Google Drive real) en un
 * directorio propio, separado de `storage/` (desarrollo), para no mezclar archivos y poder
 * limpiarlo entre corridas sin afectar al servidor de desarrollo.
 */
process.env.DOCUMENT_STORAGE_DRIVER = 'local-disk';
process.env.DOCUMENT_STORAGE_LOCAL_DIR = 'storage-test';
