# Centro de Terapias

Plataforma web para administrar un centro de terapias infantiles (fonoaudiología, psicología,
terapia ocupacional, kinesiología y psicopedagogía): pacientes, agenda, fichas clínicas,
documentos (Google Drive), confirmaciones por WhatsApp, lista de espera, incidencias, reportes y
dashboard. Diseñada multi-tenant desde el primer día, aunque hoy la use un solo centro.

Reemplaza el flujo actual del negocio (WhatsApp manual + Google Calendar + Google Drive + Google
Forms, todo desconectado) centralizando todo salvo Drive y Forms, que se mantienen por decisión
del negocio y se integran vía API.

## Stack

| Capa          | Tecnología                                                               |
| ------------- | ------------------------------------------------------------------------ |
| Frontend      | Next.js (App Router) + TypeScript + TailwindCSS + shadcn/ui              |
| Backend       | NestJS + TypeScript                                                      |
| Base de datos | PostgreSQL + Prisma ORM                                                  |
| Documentos    | Google Drive API (driver `local-disk` en desarrollo, sin credenciales)   |
| Mensajería    | WhatsApp Business API (driver `console` en desarrollo, sin credenciales) |
| Monorepo      | npm workspaces (`apps/api`, `apps/web`, `packages/shared`)               |

Arquitectura: Clean Architecture por módulo (`domain` / `application` / `infrastructure` /
`presentation`), Repository Pattern + Dependency Injection, monolito modular (no microservicios).
Detalle completo en [`docs/01-arquitectura.md`](./docs/01-arquitectura.md) y
[`docs/03-estructura-carpetas.md`](./docs/03-estructura-carpetas.md).

## Estado de los módulos

Los 10 módulos del alcance original están completos (código + tests + documentación cada uno):

| #   | Módulo                                           | Estado      |
| --- | ------------------------------------------------ | ----------- |
| 1   | Autenticación, usuarios, roles, organizaciones   | ✅ Completo |
| 2   | Pacientes (CRUD)                                 | ✅ Completo |
| 3   | Agenda (horarios fijos → instancias con estado)  | ✅ Completo |
| 4   | Fichas clínicas (append-only + confidencialidad) | ✅ Completo |
| 5   | Documentos (Google Drive)                        | ✅ Completo |
| 6   | WhatsApp (menú determinista + confirmación 24 h) | ✅ Completo |
| 7   | Lista de espera (Google Forms → admisión)        | ✅ Completo |
| 8   | Incidencias                                      | ✅ Completo |
| 9   | Reportes                                         | ✅ Completo |
| 10  | Dashboard                                        | ✅ Completo |

~190 tests unitarios y ~95 tests e2e en verde. Detalle módulo por módulo, reglas de negocio y
decisiones de diseño en [`docs/modulos/`](./docs/modulos/).

## Requisitos previos

- **Node.js 20+**
- **Docker Desktop** (para PostgreSQL local)
- **Git**

## Puesta en marcha

```bash
git clone https://github.com/JoseGavilan1/centro-terapias.git
cd centro-terapias

# 1. Instalar dependencias (compila automáticamente packages/shared vía postinstall)
npm install

# 2. Levantar PostgreSQL local
docker compose up -d

# 3. Configurar variables de entorno del backend
cp apps/api/.env.example apps/api/.env
# Editar apps/api/.env si hace falta (ver tabla de variables más abajo).
# El valor por defecto de DATABASE_URL ya apunta al Postgres del paso 2.

# 4. Aplicar migraciones y cargar el seed (organización + admin inicial)
npm run db:migrate
npm run db:seed

# 5. Levantar API + frontend juntos
npm run dev
```

- Frontend: http://localhost:3000
- API: http://localhost:3001 · Swagger: http://localhost:3001/api/docs
- Login inicial: `admin@demo.cl` / `Admin123!` (o los valores de `SEED_ADMIN_EMAIL`/
  `SEED_ADMIN_PASSWORD` si los cambiaste) — pide cambiar la contraseña al primer ingreso.

Si el puerto **5432** ya está ocupado por otro Postgres en tu máquina, creá un
`docker-compose.override.yml` (no versionado, ver `.gitignore`) publicando otro puerto, por
ejemplo:

```yaml
services:
  postgres:
    ports:
      - '5433:5432'
```

y ajustá el puerto en `DATABASE_URL` dentro de `apps/api/.env` acorde.

### Variables de entorno relevantes (`apps/api/.env`)

Documentadas con detalle en `apps/api/.env.example`. Las que importan para arrancar en local:

| Variable                                   | Para qué                                                                                                 | Default en desarrollo                 |
| ------------------------------------------ | -------------------------------------------------------------------------------------------------------- | ------------------------------------- |
| `DATABASE_URL`                             | conexión a Postgres                                                                                      | apunta al contenedor del paso 2       |
| `JWT_ACCESS_SECRET`                        | firma de los access tokens                                                                               | cualquier string largo sirve en local |
| `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` | credenciales del admin inicial                                                                           | `admin@demo.cl` / `Admin123!`         |
| `DOCUMENT_STORAGE_DRIVER`                  | `local-disk` (sin credenciales) o `google-drive` (producción)                                            | `local-disk`                          |
| `MESSAGING_DRIVER`                         | `console` (sin credenciales, loguea en la tabla `whatsapp_messages`) o `whatsapp-cloud-api` (producción) | `console`                             |

El frontend no necesita `.env` propio en desarrollo (llama a su propio origen y Next reescribe
`/api/*` hacia la API — ver `apps/web/next.config.ts`).

## Cómo está construido (mapa rápido)

```
centro-terapias/
├── apps/
│   ├── api/            # NestJS. src/modules/<modulo>/{domain,application,infrastructure,presentation}
│   └── web/             # Next.js App Router. src/app/(auth) y src/app/(dashboard)
├── packages/
│   └── shared/           # Contratos TS compartidos (DTOs, enums, tipos) — @centro/shared
├── docs/                 # Documentación canónica (fuente de verdad de negocio y arquitectura)
│   └── modulos/          # Un documento por módulo: reglas de negocio, casos de uso, DoD
└── docker-compose.yml    # Postgres local
```

Reglas clave para orientarse en el código (con más detalle en los docs enlazados):

- **Cada módulo del backend es una porción vertical** con 4 capas
  (`domain → application ← infrastructure`, `presentation` por encima). Prisma **solo** aparece
  en `infrastructure/`. Ver [`docs/03-estructura-carpetas.md`](./docs/03-estructura-carpetas.md).
- **Multi-tenant desde el modelo**: toda tabla de negocio tiene `organization_id`, y todo método
  de repositorio lo recibe explícito — el aislamiento entre organizaciones está en la firma, no
  es una convención informal.
- **Confidencialidad psicológica**: las evoluciones/documentos de especialidad Psicología solo
  los lee quien tiene esa especialidad — ni siquiera el administrador (ver ADR-04 en
  [`docs/01-arquitectura.md`](./docs/01-arquitectura.md)).
- **Auditoría inmutable**: toda mutación relevante queda en `audit_logs` (append-only).
- **Contratos compartidos**: los tipos de `packages/shared` son la fuente de verdad de la API;
  los DTOs de NestJS `implements` esos tipos, así un cambio de contrato rompe la compilación en
  ambos lados si queda inconsistente.

## Comandos útiles

```bash
npm run dev          # API + frontend juntos
npm run dev:api      # solo API (watch mode)
npm run dev:web      # solo frontend
npm run build        # build de los 3 paquetes, en orden (shared → api → web)
npm run lint         # ESLint en api y web
npm run test         # tests unitarios (apps/api)
npm run test:e2e     # tests e2e contra una base de datos de prueba (ver abajo)
npm run db:migrate   # aplica migraciones de Prisma (desarrollo)
npm run db:seed      # organización + admin inicial
npm run format       # Prettier sobre todo el repo
```

### Tests e2e

Corren contra una base de datos **separada** de la de desarrollo (nunca se mezclan datos):
`apps/api/test/setup-env.ts` fuerza `DATABASE_URL` a `centro_terapias_test`, en el puerto 5432
por defecto. Antes de la primera corrida, creá esa base y aplicá las migraciones ahí también:

```bash
docker exec centro-terapias-db psql -U centro -d postgres -c "CREATE DATABASE centro_terapias_test;"
DATABASE_URL="postgresql://centro:centro_dev@localhost:5432/centro_terapias_test?schema=public" \
  npx prisma migrate deploy --schema apps/api/prisma/schema.prisma
npm run test:e2e
```

Si usás un `docker-compose.override.yml` propio con otro puerto (ver más arriba), no edites
`setup-env.ts`: exportá `TEST_DATABASE_URL` con el puerto correcto antes de correr los comandos de
arriba, por ejemplo `TEST_DATABASE_URL="postgresql://centro:centro_dev@localhost:5433/centro_terapias_test?schema=public"`.

## Documentación completa

Este README es solo el punto de partida. Todo el detalle de negocio y arquitectura vive en
`docs/`, que es la **fuente de verdad** — si algo en el código y algo en `docs/` no coinciden, se
corrige la inconsistencia, no se asume que el código manda:

| Documento                                                            | Contenido                                                                                                            |
| -------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| [`docs/00-analisis.md`](./docs/00-analisis.md)                       | Contexto de negocio, actores, objetivos, restricciones duras del cliente, riesgos                                    |
| [`docs/01-arquitectura.md`](./docs/01-arquitectura.md)               | Decisiones de arquitectura (ADRs), estado de módulos, despliegue de referencia                                       |
| [`docs/02-modelo-datos.md`](./docs/02-modelo-datos.md)               | Modelo de datos completo, diagrama entidad-relación, decisiones de modelado                                          |
| [`docs/03-estructura-carpetas.md`](./docs/03-estructura-carpetas.md) | Cómo se organiza el código y cómo agregar un módulo nuevo                                                            |
| [`docs/04-api-rest.md`](./docs/04-api-rest.md)                       | Contrato REST completo, endpoint por endpoint                                                                        |
| [`docs/modulos/modulo-XX-*.md`](./docs/modulos/)                     | Un documento por módulo: reglas de negocio, historias de usuario, casos de uso, plan de pruebas, Definición de Hecho |

## Notas sobre despliegue

El documento de análisis fija **Azure** como hosting (restricción original del cliente, ver
`docs/00-analisis.md` §6). Si en algún momento se decide desplegar en **Vercel** (frontend) +
**Railway/Render** (backend) + **Supabase** (Postgres gestionado) en su lugar, es una migración
de bajo esfuerzo en código — Prisma no cambia, solo el `DATABASE_URL` — pero conviene actualizar
esa restricción en los docs antes de dar el salto, para que quede como decisión registrada y no
como una divergencia silenciosa entre lo documentado y lo real.
