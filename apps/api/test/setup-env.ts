/**
 * Los tests e2e limpian tablas completas entre casos (ver cleanDatabase en
 * test-app.ts). Deben apuntar a una base de datos dedicada, nunca a la de
 * desarrollo — de lo contrario cada corrida borra los datos de `npm run
 * prisma:seed`. Se sobrescribe aquí (antes de que AppModule cargue
 * ConfigModule) en vez de depender de sintaxis de variables de entorno de
 * shell, que difiere entre bash y PowerShell/cmd.
 */
// Default: puerto 5432 (el que publica docker-compose.yml tal cual, sin override).
// Si tu máquina tiene otro Postgres ocupando ese puerto (ver docker-compose.override.yml),
// exportá TEST_DATABASE_URL con el puerto que corresponda en vez de tocar este archivo.
process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  'postgresql://centro:centro_dev@localhost:5432/centro_terapias_test?schema=public';

/**
 * Módulo 5: los e2e usan siempre el doble local-disk (nunca Google Drive real) en un
 * directorio propio, separado de `storage/` (desarrollo), para no mezclar archivos y poder
 * limpiarlo entre corridas sin afectar al servidor de desarrollo.
 */
process.env.DOCUMENT_STORAGE_DRIVER = 'local-disk';
process.env.DOCUMENT_STORAGE_LOCAL_DIR = 'storage-test';
