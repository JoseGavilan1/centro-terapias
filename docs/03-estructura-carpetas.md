# 03 · Estructura de carpetas

> Documento canónico. Define dónde vive cada pieza del monorepo y las reglas para agregar código nuevo.
> Complementa: [01-arquitectura.md](./01-arquitectura.md) (ADR-01, ADR-02, ADR-07) · [02-modelo-datos.md](./02-modelo-datos.md)

## 1. Vista general del monorepo

Monorepo **npm workspaces** (ADR-02): dos aplicaciones y un paquete de contratos compartidos. El scaffolding raíz ya existe; los `src/` de `apps/api` y `apps/web` se materializan con el Módulo 1 siguiendo exactamente la estructura descrita aquí.

```
centro-terapias/
├── package.json               # workspaces (apps/*, packages/*) + scripts orquestadores (dev, build, test, db:*)
├── package-lock.json
├── docker-compose.yml         # PostgreSQL 16 local (docker compose up -d)
├── .editorconfig · .prettierrc · .gitattributes · .gitignore
├── docs/                      # documentación canónica (00-analisis, 01-arquitectura, 02-modelo-datos, 03-…)
├── apps/
│   ├── api/                   # backend NestJS + Prisma  (@centro/api)
│   └── web/                   # frontend Next.js         (@centro/web)
└── packages/
    └── shared/                # contratos de API          (@centro/shared)
```

Scripts raíz relevantes: `npm run dev` (api + web en paralelo), `npm run build` (shared → api → web, en ese orden porque ambos consumen `@centro/shared`), `npm run db:migrate`, `npm run db:seed`, `npm run test`, `npm run test:e2e`.

## 2. Backend — `apps/api`

```
apps/api/
├── .env.example               # variables documentadas; copiar a .env (nunca se commitea)
├── nest-cli.json
├── eslint.config.mjs
├── tsconfig.json · tsconfig.build.json
├── package.json
├── prisma/
│   ├── schema.prisma          # modelos M1: Organization, User, RefreshToken, AuditLog
│   ├── migrations/            # migraciones incrementales (una por módulo)
│   └── seed.ts                # organización + admin inicial (SEED_* de .env)
├── test/
│   ├── jest-e2e.json
│   └── *.e2e-spec.ts          # tests end-to-end (supertest contra la app completa)
└── src/
    ├── main.ts                # bootstrap: helmet, cookie-parser, ValidationPipe global, prefijo /api/v1, Swagger en /api/docs
    ├── app.module.ts          # composición: Config + Prisma + módulos de negocio + guards globales
    ├── config/                # configuración tipada y validación de entorno (fail-fast al arranque)
    ├── common/                # transversal SIN lógica de negocio
    │   ├── decorators/        # @Public(), @Roles(), @CurrentUser()
    │   ├── guards/            # JwtAuthGuard, RolesGuard (globales, deny-by-default)
    │   ├── filters/           # filtros de excepción (formato de error NestJS estándar)
    │   └── types/             # p. ej. AuthenticatedUser (payload del JWT: sub, organizationId, role, specialty)
    ├── infrastructure/
    │   └── prisma/            # PrismaService (módulo global; único punto de conexión a la DB)
    └── modules/
        ├── auth/              # login, refresh rotativo, logout, /auth/me, change-password
        ├── users/             # CRUD de usuarios (ADMIN), reset-password, invariantes rol/especialidad
        ├── organizations/     # GET/PATCH /organizations/current
        ├── audit/             # AuditService (usado por los demás módulos) + GET /audit-logs
        └── hashing/           # puerto PasswordHasher + adaptador bcryptjs factor 12 (ADR-08)
```

### 2.1 Anatomía de un módulo (Clean Architecture)

Cada módulo de `modules/` es un **slice vertical** con cuatro capas internas (ADR-01, ADR-07). Ejemplo con `users`:

```
modules/users/
├── users.module.ts                        # wiring DI: bindea tokens de domain → implementaciones de infrastructure
├── presentation/
│   ├── users.controller.ts                # rutas REST, @Roles(ADMIN), Swagger
│   └── dto/
│       ├── create-user.dto.ts             # class-validator; implementa CreateUserRequest de @centro/shared
│       ├── update-user.dto.ts
│       ├── reset-password.dto.ts
│       └── users-query.dto.ts
├── application/
│   └── users.service.ts                   # casos de uso; orquesta repositorio + PasswordHasher + AuditService
├── domain/
│   ├── user.repository.ts                 # interface UserRepository (cada método exige organizationId, ADR-03)
│   ├── tokens.ts                          # export const USER_REPOSITORY = Symbol('USER_REPOSITORY')
│   └── types.ts                           # tipos de dominio (entidad User interna, con passwordHash)
└── infrastructure/
    └── prisma-user.repository.ts          # implementación Prisma de UserRepository
```

### 2.2 Regla de dependencia entre capas

Las flechas apuntan **hacia adentro**; `infrastructure` implementa `domain` y se conecta por DI:

```
presentation ──▶ application ──▶ domain ◀╌╌ implementa ╌╌ infrastructure
```

| Capa | Puede importar | Prohibido |
|---|---|---|
| `presentation` | `application`, DTOs propios, `@centro/shared`, `common` | Prisma, repositorios concretos |
| `application` | `domain` (interfaces + tokens), servicios de otros módulos vía su capa pública | Prisma, HTTP/Express, DTOs de presentation |
| `domain` | solo tipos propios y `@centro/shared` | cualquier framework (Nest, Prisma, Express) |
| `infrastructure` | `domain` (para implementarlo), `PrismaService` | `presentation`, `application` |

Consecuencias prácticas:

- **Prisma solo existe en `infrastructure`** (más `infrastructure/prisma/` global). Si un import de `@prisma/client` aparece en otra capa, es un defecto de revisión.
- Los servicios de `application` reciben interfaces por token: `@Inject(USER_REPOSITORY) private readonly users: UserRepository`. Eso permite testearlos con dobles en memoria, sin base de datos.
- El aislamiento multi-tenant se garantiza en la firma: **todo método de repositorio recibe `organizationId` explícito** (ADR-03).
- Dependencias entre módulos: siempre a través del servicio de aplicación o puerto exportado por el `*.module.ts` ajeno (p. ej. `auth` y `users` inyectan `PasswordHasher` de `hashing`, y todos usan `AuditService` de `audit`). Nunca se importa el repositorio interno de otro módulo.

## 3. Frontend — `apps/web`

```
apps/web/
├── next.config.ts             # rewrite /api/* → API (proxy same-origin, ADR-06)
├── postcss.config.mjs
├── eslint.config.mjs · tsconfig.json · package.json
└── src/
    ├── middleware.ts          # protege (dashboard) leyendo la cookie marcador ct_session; redirige a /login
    ├── app/                   # App Router
    │   ├── layout.tsx · globals.css
    │   ├── (auth)/
    │   │   └── login/page.tsx             # ruta pública /login (+ flujo de cambio de contraseña obligatorio)
    │   └── (dashboard)/                   # rutas autenticadas con layout de navegación
    │       ├── layout.tsx
    │       ├── page.tsx                   # inicio
    │       ├── users/…                    # gestión de usuarios (solo ADMIN)
    │       ├── organization/…             # datos del centro
    │       └── audit/…                    # visor de auditoría
    ├── components/
    │   ├── ui/                # primitivas estilo shadcn/ui (button.tsx, input.tsx, dialog.tsx, …)
    │   └── <feature>/         # componentes por dominio: users/, auth/, organization/, audit/
    └── lib/
        ├── api-client.ts      # fetch tipado contra /api/v1 usando tipos de @centro/shared; maneja 401 → refresh
        ├── providers.tsx      # providers de contexto (sesión, toasts, …)
        └── utils.ts           # helpers (cn, formatos de fecha)
```

Reglas: los *route groups* `(auth)` y `(dashboard)` no afectan la URL, solo separan layouts; ningún componente llama a `fetch` directo — siempre a través de `lib/api-client.ts`, que habla con el **propio origen** `/api/*` (las cookies httpOnly viajan solas; el token nunca toca JavaScript).

## 4. Contratos — `packages/shared`

```
packages/shared/
├── package.json               # @centro/shared; main/types → dist (se compila en postinstall)
├── tsconfig.json
└── src/
    ├── index.ts               # barrel: re-exporta todo
    ├── enums.ts               # UserRole, Specialty + labels de UI
    ├── pagination.ts          # PageQuery, Paginated<T>
    ├── auth.ts                # LoginRequest/Response, AuthUserDto, RefreshResponse, ChangePasswordRequest
    ├── users.ts               # UserDto, Create/UpdateUserRequest, ResetPasswordRequest, UsersQuery
    ├── organizations.ts       # OrganizationDto, UpdateOrganizationRequest
    └── audit.ts               # AuditAction, AuditLogDto, AuditLogsQuery
```

Convención: **un archivo por dominio de contrato**, exportado desde `index.ts`. Aquí solo hay tipos, enums y constantes de presentación — nada de lógica, nada de dependencias (ADR-09). Los DTOs NestJS `implements` estas interfaces: si el contrato cambia, el compilador rompe en ambos extremos.

## 5. Receta: agregar un módulo nuevo (backend + frontend)

Ejemplo: módulo `patients` (M2). Orden recomendado:

1. **Contrato** — crear `packages/shared/src/patients.ts` (DTOs, requests, query, enums del dominio) y re-exportarlo en `index.ts`.
2. **Persistencia** — agregar los modelos al `apps/api/prisma/schema.prisma` (con `organization_id` + índice, ADR-03) y generar la migración: `npm run db:migrate`.
3. **Esqueleto del módulo** — crear `apps/api/src/modules/patients/` con las cuatro capas:
   - `domain/`: `patient.repository.ts` (interface; todo método con `organizationId`), `tokens.ts` (`PATIENT_REPOSITORY`), `types.ts`.
   - `infrastructure/`: `prisma-patient.repository.ts` implementando la interface.
   - `application/`: `patients.service.ts` con los casos de uso; inyecta el repositorio por token y `AuditService` para cada mutación.
   - `presentation/`: `patients.controller.ts` + `dto/` con class-validator implementando los tipos de `@centro/shared`.
4. **Wiring** — `patients.module.ts`: `providers: [{ provide: PATIENT_REPOSITORY, useClass: PrismaPatientRepository }, PatientsService]`, importar `AuditModule`; registrar el módulo en `app.module.ts`.
5. **Seguridad** — decorar el controller con `@Roles(...)` según la matriz de permisos; nada es público salvo `@Public()` explícito (guards globales deny-by-default).
6. **Tests** — `*.spec.ts` junto al servicio (repositorio en memoria, sin DB) y `apps/api/test/patients.e2e-spec.ts`.
7. **Frontend** — tipos ya disponibles vía `@centro/shared`; agregar funciones en `lib/api-client.ts`, componentes en `components/patients/` y la ruta en `app/(dashboard)/patients/`.
8. **Documentación** — actualizar `docs/02-modelo-datos.md` (detalle fino de columnas) y la superficie REST del módulo.

## 6. Convenciones de nombres

| Elemento | Convención | Ejemplo |
|---|---|---|
| Carpetas y archivos TS (api y web) | `kebab-case` | `clinical-records/`, `api-client.ts` |
| Módulo NestJS | `<modulo>.module.ts` en la raíz del módulo | `users.module.ts` |
| Controller | `<modulo>.controller.ts` en `presentation/` | `auth.controller.ts` |
| DTOs | `presentation/dto/<accion>-<recurso>.dto.ts`; clase `PascalCase` + sufijo `Dto` | `create-user.dto.ts` → `CreateUserDto` |
| Servicio de casos de uso | `<modulo>.service.ts` en `application/` | `users.service.ts` |
| Interface de repositorio | `<entidad>.repository.ts` en `domain/` (singular) | `user.repository.ts` → `UserRepository` |
| Tokens DI | `domain/tokens.ts`; constante `SCREAMING_SNAKE_CASE` | `USER_REPOSITORY` |
| Implementación Prisma | `prisma-<entidad>.repository.ts` en `infrastructure/` | `prisma-user.repository.ts` → `PrismaUserRepository` |
| Puertos (adaptadores externos) | `<capacidad>.port.ts` en `domain/`; adaptador `<proveedor>.adapter.ts` | `password-hasher.port.ts` / `bcrypt.adapter.ts` |
| Tests unitarios | `<archivo>.spec.ts` junto al código | `users.service.spec.ts` |
| Tests e2e | `apps/api/test/<modulo>.e2e-spec.ts` | `auth.e2e-spec.ts` |
| Rutas Next (App Router) | carpetas `kebab-case`; archivos reservados `page.tsx`, `layout.tsx`; grupos `(nombre)` | `app/(dashboard)/users/page.tsx` |
| Componentes React | archivo `kebab-case`, export `PascalCase` (estilo shadcn) | `login-form.tsx` → `LoginForm` |
| Contratos shared | un archivo por dominio, `camelCase`/`PascalCase` en tipos | `users.ts` → `UserDto` |
| Prisma | modelos `PascalCase`, tablas/columnas `snake_case` vía `@@map`/`@map` | `RefreshToken` → `refresh_tokens` |

Regla general: si un archivo no encaja de forma obvia en una capa de un módulo, es señal de diseño incorrecto — se discute antes de crear carpetas nuevas. `common/` es solo para piezas transversales sin lógica de negocio; la lógica de negocio siempre vive en `modules/<modulo>/application` o `domain`.
