# Módulo 1 · Autenticación, usuarios, roles y organizaciones

> Documento de módulo según la metodología del proyecto. Coherente con [01-arquitectura.md](../01-arquitectura.md) (ADR-04, ADR-05, ADR-06, ADR-08, ADR-10), [02-modelo-datos.md](../02-modelo-datos.md) y los contratos de `@centro/shared`.
>
> **Alcance:** login/refresh/logout, gestión de usuarios (ADMIN), perfil y cambio de contraseña, configuración de la organización y consulta de auditoría. Superficie REST bajo `/api/v1` según [04-api-rest.md](../04-api-rest.md).

## 1. Reglas de negocio del módulo (resumen normativo)

- Roles del sistema: `ADMIN` y `PROFESSIONAL`. El "psicólogo" es `PROFESSIONAL` con `specialty = PSICOLOGIA` (ADR-04).
- `specialty` es **obligatoria** para `PROFESSIONAL` y debe ser **NULL** para `ADMIN`.
- `email` es único **global** (el login no pide organización).
- Un admin **no puede desactivarse a sí mismo ni cambiar su propio rol**.
- Los usuarios **nunca se borran físicamente**: `DELETE` = desactivación (`isActive=false`) + revocación de sus sesiones.
- Contraseñas: mínimo 8 caracteres, al menos 1 mayúscula, 1 minúscula y 1 dígito; hash **bcrypt factor 12** (ADR-08).
- Crear usuario / resetear contraseña ⇒ contraseña temporal + `mustChangePassword=true`.
- Login fallido ⇒ **401 genérico** ("Credenciales inválidas"), sin revelar si el email existe; se audita `LOGIN_FAILED`. Cuenta inactiva ⇒ mismo 401 genérico.
- Tokens: access JWT **15 min (900 s)** + refresh **opaco rotativo 7 días**, hasheado SHA-256 en DB. Reuso de un refresh ya rotado ⇒ revocación de **todas** las sesiones del usuario + auditoría `TOKEN_REUSE_DETECTED` (ADR-05).
- Cookies httpOnly: `ct_access` (path `/`), `ct_refresh` (path `/api/v1/auth`), `ct_session` (marcador para el middleware de Next). La API también acepta `Authorization: Bearer` (ADR-06).
- Toda mutación de `User`/`Organization` se audita con valor anterior/nuevo, **excluyendo siempre `password_hash`** (ADR-10).

## 2. Historias de usuario

Formato de criterios: **Dado / Cuando / Entonces**.

### 2.1 Como administrador

#### HU-01 · Iniciar sesión
> Como administrador quiero iniciar sesión con email y contraseña para acceder a la gestión del centro.

- **Dado** un admin activo con credenciales válidas, **cuando** envía `POST /auth/login`, **entonces** recibe 200 con `LoginResponse` (usuario, `accessToken`, `expiresIn: 900`), las cookies `ct_access`, `ct_refresh` y `ct_session`, y se audita `LOGIN`.
- **Dado** una contraseña incorrecta o un email inexistente, **cuando** intenta el login, **entonces** recibe 401 con mensaje genérico "Credenciales inválidas" (sin distinguir el caso) y se audita `LOGIN_FAILED`.
- **Dado** un usuario con `mustChangePassword=true`, **cuando** inicia sesión, **entonces** el login es exitoso y el frontend lo redirige a cambiar su contraseña antes de operar.

#### HU-02 · Crear usuario profesional
> Como administrador quiero crear cuentas de profesionales con su especialidad para que atiendan en el centro.

- **Dado** un `CreateUserRequest` con `role=PROFESSIONAL` y `specialty` válida, **cuando** envía `POST /users`, **entonces** recibe 201 con `UserDto`, el usuario queda con `mustChangePassword=true` y se audita `CREATE` de `User`.
- **Dado** `role=PROFESSIONAL` sin `specialty`, **cuando** intenta crearlo, **entonces** recibe 400 (invariante rol/especialidad).
- **Dado** un email ya registrado en cualquier organización, **cuando** intenta crearlo, **entonces** recibe 409.
- **Dado** una contraseña temporal que no cumple la política, **cuando** intenta crearlo, **entonces** recibe 400.

#### HU-03 · Crear otro administrador
> Como administrador quiero crear otros administradores para no ser punto único de operación.

- **Dado** un `CreateUserRequest` con `role=ADMIN` y **sin** `specialty`, **cuando** envía `POST /users`, **entonces** recibe 201 y el usuario queda con `specialty=null`.
- **Dado** `role=ADMIN` con `specialty` presente, **cuando** intenta crearlo, **entonces** recibe 400.

#### HU-04 · Editar usuario
> Como administrador quiero editar los datos de un usuario para mantener la información al día.

- **Dado** un usuario existente, **cuando** envía `PATCH /users/:id` con campos válidos de `UpdateUserRequest`, **entonces** recibe 200 con el `UserDto` actualizado y se audita `UPDATE` con valor anterior/nuevo (sin `password_hash`).
- **Dado** un cambio a `role=PROFESSIONAL` sin especialidad resultante, o a `role=ADMIN` conservando especialidad, **cuando** envía el PATCH, **entonces** recibe 400.
- **Dado** que el admin edita **su propio** usuario, **cuando** intenta cambiar su `role`, **entonces** recibe 409.
- **Dado** un `id` inexistente en su organización, **cuando** envía el PATCH, **entonces** recibe 404.

#### HU-05 · Desactivar usuario
> Como administrador quiero desactivar usuarios que ya no trabajan en el centro, sin perder su historial.

- **Dado** un usuario activo de su organización, **cuando** envía `DELETE /users/:id`, **entonces** recibe 204, el usuario queda `isActive=false` (nunca se borra la fila), sus refresh tokens se revocan y se audita `DELETE`.
- **Dado** que el `id` es el del propio admin, **cuando** intenta desactivarse (por `DELETE` o `PATCH isActive=false`), **entonces** recibe 409.
- **Dado** un usuario desactivado, **cuando** ese usuario intenta iniciar sesión, **entonces** recibe el 401 genérico.

#### HU-06 · Resetear contraseña
> Como administrador quiero asignar una contraseña temporal a un usuario que la olvidó.

- **Dado** un usuario existente y una contraseña temporal que cumple la política, **cuando** envía `POST /users/:id/reset-password`, **entonces** recibe 204, el usuario queda con `mustChangePassword=true`, sus sesiones se revocan y se audita `PASSWORD_RESET` (sin exponer la contraseña).
- **Dado** una contraseña temporal débil, **cuando** envía el reset, **entonces** recibe 400.

#### HU-07 · Editar datos del centro
> Como administrador quiero mantener los datos del centro (nombre, RUT, zona horaria, contacto).

- **Dado** un `UpdateOrganizationRequest` válido, **cuando** envía `PATCH /organizations/current`, **entonces** recibe 200 con `OrganizationDto` y se audita `UPDATE` de `Organization` con valor anterior/nuevo.
- **Dado** un `timezone` inválido o `name` vacío, **cuando** envía el PATCH, **entonces** recibe 400.

#### HU-08 · Consultar auditoría
> Como administrador quiero revisar quién hizo qué y cuándo, para trazabilidad y seguridad.

- **Dado** registros de auditoría en su organización, **cuando** consulta `GET /audit-logs` con filtros (`entity`, `userId`, `action`, `from`, `to`) y paginación, **entonces** recibe 200 con `Paginated<AuditLogDto>` ordenado por fecha descendente.
- **Dado** cualquier registro devuelto, **entonces** `oldValue`/`newValue` nunca contienen `password_hash`.
- **Dado** un profesional autenticado, **cuando** consulta `GET /audit-logs`, **entonces** recibe 403.

### 2.2 Como profesional

#### HU-09 · Iniciar sesión
- **Dado** un profesional activo con credenciales válidas, **cuando** hace login, **entonces** accede al dashboard con las opciones de su rol (sin gestión de usuarios ni auditoría).

#### HU-10 · Ver mi perfil
- **Dado** un profesional autenticado, **cuando** consulta `GET /auth/me`, **entonces** recibe 200 con `AuthUserDto` (incluye `organizationName`, `role`, `specialty`, `mustChangePassword`).
- **Dado** una petición sin token válido, **cuando** consulta `/auth/me`, **entonces** recibe 401.

#### HU-11 · Cambiar mi contraseña
- **Dado** un usuario autenticado que conoce su contraseña actual, **cuando** envía `POST /auth/change-password` con una nueva contraseña que cumple la política, **entonces** recibe 204, `mustChangePassword` pasa a `false`, se revocan **las demás sesiones** (la actual sigue válida) y se audita `PASSWORD_CHANGE`.
- **Dado** una `currentPassword` incorrecta, **entonces** recibe 401.
- **Dado** una `newPassword` que no cumple la política, **entonces** recibe 400.

#### HU-12 · No acceder a la gestión de usuarios
- **Dado** un profesional autenticado, **cuando** invoca cualquier endpoint de `/users`, `/audit-logs` o `PATCH /organizations/current`, **entonces** recibe 403 (RolesGuard).
- **Dado** un profesional en el frontend, **cuando** navega, **entonces** el sidebar no muestra "Usuarios", "Auditoría" ni "Configuración"; el acceso directo por URL redirige o muestra pantalla de acceso denegado.

### 2.3 Como cualquier usuario

#### HU-13 · Sesión renovada silenciosamente
- **Dado** un access token expirado y una cookie `ct_refresh` vigente, **cuando** el cliente recibe 401 y llama `POST /auth/refresh`, **entonces** recibe 200 con nuevo `accessToken`, las cookies rotan (el refresh anterior queda revocado y encadenado vía `replaced_by_id`) y el usuario no percibe interrupción; se audita `TOKEN_REFRESH`.
- **Dado** un refresh token ya rotado (reuso), **cuando** llega a `/auth/refresh`, **entonces** recibe 401, se revocan **todas** las sesiones del usuario y se audita `TOKEN_REUSE_DETECTED`.

#### HU-14 · Cerrar sesión
- **Dado** una sesión activa, **cuando** envía `POST /auth/logout`, **entonces** recibe 204, el refresh token queda revocado, las tres cookies se limpian y se audita `LOGOUT`.
- **Dado** una petición sin cookies o con token inválido, **cuando** llama a logout, **entonces** igual recibe 204 (endpoint tolerante e idempotente).

## 3. Casos de uso

### CU-01 · Login

| | |
|---|---|
| **Actor** | Usuario (ADMIN o PROFESSIONAL), no autenticado |
| **Endpoint** | `POST /api/v1/auth/login` (público) |
| **Precondiciones** | Ninguna |

**Flujo principal**
1. El actor envía `LoginRequest` (`email`, `password`).
2. El sistema normaliza el email y busca el usuario (email único global; sin selector de organización).
3. Verifica que el usuario existe, está `isActive=true` y que `password` coincide con `password_hash` (bcrypt).
4. Genera access JWT (15 min; claims: `sub`, `organizationId`, `role`, `specialty`) y refresh opaco (64 bytes), persiste su SHA-256 en `refresh_tokens` con `expires_at = now + 7 días`, IP y user-agent.
5. Setea cookies `ct_access`, `ct_refresh`, `ct_session` (httpOnly).
6. Audita `LOGIN` (usuario, IP, user-agent).
7. Responde 200 con `LoginResponse`.

**Flujos alternativos / excepciones**
- **A1 — Email inexistente:** responde 401 "Credenciales inválidas"; audita `LOGIN_FAILED` con `user_id=NULL` y el email intentado como snapshot.
- **A2 — Contraseña incorrecta:** mismo 401 genérico; audita `LOGIN_FAILED` con el `user_id`.
- **A3 — Cuenta inactiva:** mismo 401 genérico (no revela el estado); audita `LOGIN_FAILED`.
- **A4 — Body inválido:** 400 de `ValidationPipe` antes de tocar el servicio.
- **Postcondición A1–A3:** no se emite ningún token ni cookie.

### CU-02 · Refresh con rotación y detección de reuso

| | |
|---|---|
| **Actor** | Cliente con sesión (navegador vía cookie `ct_refresh`, o API vía `body.refreshToken`) |
| **Endpoint** | `POST /api/v1/auth/refresh` (público) |
| **Precondiciones** | Posee un refresh token emitido previamente |

**Flujo principal**
1. El cliente envía el refresh token (cookie o body).
2. El sistema calcula SHA-256 y busca el registro en `refresh_tokens`.
3. Valida: existe, no expirado, no revocado, y su usuario sigue `isActive=true`.
4. **Rotación:** revoca el token actual (`revoked_at=now`), emite uno nuevo y enlaza `replaced_by_id` al nuevo registro.
5. Emite nuevo access JWT y setea las cookies rotadas.
6. Audita `TOKEN_REFRESH`.
7. Responde 200 con `RefreshResponse` (`accessToken`, `expiresIn`).

**Flujos alternativos / excepciones**
- **A1 — Token ausente, desconocido o expirado:** 401.
- **A2 — Reuso detectado** (token con `revoked_at` y `replaced_by_id` poblado): se revocan **todas** las sesiones vigentes del usuario, se audita `TOKEN_REUSE_DETECTED` y se responde 401. El usuario legítimo deberá re-autenticarse.
- **A3 — Usuario desactivado después de emitir el token:** 401 sin rotación.

### CU-03 · Logout

| | |
|---|---|
| **Actor** | Cualquier cliente |
| **Endpoint** | `POST /api/v1/auth/logout` (público tolerante) |
| **Precondiciones** | Ninguna (idempotente) |

**Flujo principal**
1. El cliente llama al endpoint (con o sin cookies).
2. Si llega un refresh token válido, el sistema lo revoca y audita `LOGOUT`.
3. Limpia las cookies `ct_access`, `ct_refresh`, `ct_session`.
4. Responde 204.

**Flujos alternativos**
- **A1 — Sin token o token inválido:** se limpian cookies igualmente y se responde 204 (nunca falla).

### CU-04 · Cambio de contraseña

| | |
|---|---|
| **Actor** | Usuario autenticado |
| **Endpoint** | `POST /api/v1/auth/change-password` |
| **Precondiciones** | Access token válido |

**Flujo principal**
1. El actor envía `ChangePasswordRequest` (`currentPassword`, `newPassword`).
2. El sistema verifica `currentPassword` contra el hash almacenado.
3. Valida la política de la nueva contraseña (§4.2) y que difiera de la actual.
4. Persiste el nuevo hash bcrypt (factor 12) y pone `mustChangePassword=false`.
5. Revoca todas las **demás** sesiones del usuario (la sesión actual permanece).
6. Audita `PASSWORD_CHANGE` (sin hashes ni contraseñas).
7. Responde 204.

**Excepciones**
- **A1 — `currentPassword` incorrecta:** 401.
- **A2 — `newPassword` no cumple política:** 400.

### CU-05 · Crear usuario

| | |
|---|---|
| **Actor** | ADMIN |
| **Endpoint** | `POST /api/v1/users` |
| **Precondiciones** | Autenticado con rol ADMIN |

**Flujo principal**
1. El actor envía `CreateUserRequest`.
2. El sistema valida el DTO (§4.3) y las invariantes rol/especialidad.
3. Verifica unicidad global del email.
4. Hashea la contraseña temporal (bcrypt 12) y crea el usuario en la organización del actor con `mustChangePassword=true`, `isActive=true`.
5. Audita `CREATE` de `User` (nuevo valor sin `password_hash`).
6. Responde 201 con `UserDto`.

**Excepciones**
- **A1 — Email duplicado (global):** 409.
- **A2 — `PROFESSIONAL` sin especialidad o `ADMIN` con especialidad:** 400.
- **A3 — Contraseña temporal débil o body con campos no permitidos:** 400.

### CU-06 · Editar usuario

| | |
|---|---|
| **Actor** | ADMIN |
| **Endpoint** | `PATCH /api/v1/users/:id` |
| **Precondiciones** | Autenticado ADMIN; el usuario objetivo pertenece a su organización |

**Flujo principal**
1. El actor envía `UpdateUserRequest` (parcial).
2. El sistema carga el usuario por `id` + `organizationId` (aislamiento de tenant).
3. Valida las invariantes sobre el **estado resultante**: si el rol final es `PROFESSIONAL` debe haber especialidad; si es `ADMIN`, la especialidad debe quedar NULL.
4. Valida reglas de auto-protección: el actor no puede cambiar su propio `role` ni ponerse `isActive=false`.
5. Si `isActive` pasa a `false`, revoca las sesiones del usuario objetivo.
6. Persiste, audita `UPDATE` con diff anterior/nuevo (sin `password_hash`) y responde 200 con `UserDto`.

**Excepciones**
- **A1 — Usuario inexistente en la organización:** 404.
- **A2 — Invariante rol/especialidad violada:** 400.
- **A3 — Auto-desactivación o cambio de rol propio:** 409.

### CU-07 · Desactivar usuario

| | |
|---|---|
| **Actor** | ADMIN |
| **Endpoint** | `DELETE /api/v1/users/:id` |
| **Precondiciones** | Autenticado ADMIN; usuario objetivo en su organización |

**Flujo principal**
1. El actor invoca DELETE sobre el usuario.
2. El sistema verifica que el objetivo no es el propio actor.
3. Marca `isActive=false` (**nunca** borra la fila) y revoca todos sus refresh tokens.
4. Audita `DELETE` de `User` (estado anterior/nuevo).
5. Responde 204.

**Excepciones**
- **A1 — Auto-desactivación:** 409.
- **A2 — Usuario inexistente en la organización:** 404.
- **A3 — Usuario ya inactivo:** operación idempotente ⇒ 204.

### CU-08 · Reset de contraseña

| | |
|---|---|
| **Actor** | ADMIN |
| **Endpoint** | `POST /api/v1/users/:id/reset-password` |
| **Precondiciones** | Autenticado ADMIN; usuario objetivo en su organización |

**Flujo principal**
1. El actor envía `ResetPasswordRequest` (`temporaryPassword`).
2. El sistema valida la política de contraseñas.
3. Persiste el nuevo hash y pone `mustChangePassword=true`.
4. Revoca todas las sesiones del usuario objetivo.
5. Audita `PASSWORD_RESET` (sin la contraseña).
6. Responde 204.

**Excepciones**
- **A1 — Contraseña temporal débil:** 400.
- **A2 — Usuario inexistente en la organización:** 404.

### CU-09 · Actualizar organización

| | |
|---|---|
| **Actor** | ADMIN |
| **Endpoint** | `PATCH /api/v1/organizations/current` |
| **Precondiciones** | Autenticado ADMIN |

**Flujo principal**
1. El actor envía `UpdateOrganizationRequest` (parcial).
2. El sistema resuelve la organización desde el `organizationId` del JWT (nunca por parámetro del cliente).
3. Valida el DTO (§4.5) y persiste.
4. Audita `UPDATE` de `Organization` con valor anterior/nuevo.
5. Responde 200 con `OrganizationDto`.

**Excepciones**
- **A1 — DTO inválido (nombre vacío, timezone inválida, email malformado):** 400.

## 4. Reglas de validación (formularios / DTOs)

Validación en API con class-validator (`whitelist + forbidNonWhitelisted + transform`); el frontend replica las reglas en los formularios (zod/react-hook-form) para feedback inmediato. Errores en formato NestJS estándar `{statusCode, message, error}`.

### 4.1 `LoginRequest`
| Campo | Reglas |
|---|---|
| `email` | requerido, formato email, trim + lowercase |
| `password` | requerido, string no vacío (sin validar política: no revelar pistas) |

### 4.2 Política de contraseñas (`newPassword`, `temporaryPassword`)
- Mínimo **8** caracteres.
- Al menos **1 mayúscula**, **1 minúscula** y **1 dígito**.
- Se aplica en: crear usuario, reset y cambio de contraseña. Nunca se registra en auditoría ni logs.

### 4.3 `CreateUserRequest`
| Campo | Reglas |
|---|---|
| `email` | requerido, email válido, trim + lowercase; unicidad global ⇒ 409 |
| `firstName` / `lastName` | requeridos, 1–100 caracteres, trim |
| `role` | requerido, enum `UserRole` |
| `specialty` | enum `Specialty`; **obligatoria si `role=PROFESSIONAL`, prohibida si `role=ADMIN`** ⇒ 400 |
| `phone` | opcional, 6–20 caracteres |
| `temporaryPassword` | requerida, política §4.2 |

### 4.4 `UpdateUserRequest`
| Campo | Reglas |
|---|---|
| `firstName` / `lastName` | opcionales, 1–100 caracteres |
| `role` | opcional, enum; prohibido sobre uno mismo ⇒ 409 |
| `specialty` | opcional, enum o `null`; invariante rol/especialidad evaluada sobre el estado **resultante** ⇒ 400 |
| `phone` | opcional, string o `null` |
| `isActive` | opcional, boolean; `false` sobre uno mismo ⇒ 409 |
| (email) | **no editable** por contrato; campo desconocido ⇒ 400 (`forbidNonWhitelisted`) |

### 4.5 `UpdateOrganizationRequest`
| Campo | Reglas |
|---|---|
| `name` | opcional, 1–150 caracteres, no vacío |
| `legalId` | opcional, string o `null` |
| `timezone` | opcional, identificador IANA válido (p. ej. `America/Santiago`) |
| `address` / `phone` / `email` | opcionales, `null` permitido; `email` con formato válido |

### 4.6 `ChangePasswordRequest`
| Campo | Reglas |
|---|---|
| `currentPassword` | requerida, no vacía; incorrecta ⇒ 401 |
| `newPassword` | política §4.2; debe diferir de la actual |

### 4.7 Queries (`UsersQuery`, `AuditLogsQuery`)
| Campo | Reglas |
|---|---|
| `page` | entero ≥ 1, default 1 |
| `pageSize` | entero 1–100, default 20 |
| `role` / `specialty` / `action` | enum válido ⇒ 400 si no |
| `isActive` | `'true'`/`'false'` (string por query param) |
| `search` | texto libre; busca en nombre, apellido y email |
| `from` / `to` | fecha ISO 8601 válida |

## 5. Componentes UI (apps/web)

Stack: Next.js App Router + Tailwind + shadcn/ui. Todas las llamadas van al propio origen `/api/*` (rewrite, ADR-06). El middleware de Next usa la cookie `ct_session` para proteger rutas del dashboard.

### 5.1 Página de login (`/login`)
- Formulario centrado: email, contraseña (con toggle de visibilidad), botón "Ingresar".
- **Carga:** botón con spinner y deshabilitado. **Error:** alert con el mensaje genérico "Credenciales inválidas" (nunca detalla la causa).
- Con `mustChangePassword=true` redirige a la pantalla de cambio de contraseña obligatorio antes del dashboard.
- Usuario ya autenticado que visita `/login` ⇒ redirección al dashboard.

### 5.2 Shell del dashboard
- Sidebar con navegación por rol: ADMIN ve Usuarios, Configuración y Auditoría; PROFESSIONAL solo las secciones de su rol. Header con nombre del centro, menú de usuario (perfil, cambiar contraseña, cerrar sesión).
- Cliente HTTP con interceptor: ante 401 intenta `POST /auth/refresh` una vez y reintenta la petición; si falla, limpia estado y redirige a `/login` (HU-13).
- Acceso directo a rutas de ADMIN por un PROFESSIONAL ⇒ pantalla "Acceso denegado" (espejo del 403 de la API).

### 5.3 Tabla de usuarios (`/usuarios`, solo ADMIN)
- Columnas: nombre, email, rol, especialidad, teléfono, estado (badge activo/inactivo), acciones.
- Filtros: búsqueda con debounce (nombre/email), selects de rol, especialidad y estado; paginación server-side (`Paginated<UserDto>`).
- Acciones por fila: editar, resetear contraseña, desactivar/reactivar (confirmación previa; deshabilitadas sobre el propio usuario donde aplique).
- **Estados:** carga = skeleton rows; vacío = mensaje + CTA "Crear usuario"; error = alert con reintento.

### 5.4 Diálogo crear/editar usuario
- Modal (shadcn `Dialog`) con react-hook-form + zod replicando §4.3/§4.4.
- El select de especialidad **aparece y es obligatorio** solo con rol PROFESSIONAL; se limpia y oculta con rol ADMIN. En edición, el email se muestra deshabilitado.
- En creación: campo de contraseña temporal con validación en vivo de la política e indicación de que el usuario deberá cambiarla.
- Errores del servidor mapeados al formulario: 409 ⇒ error en el campo email; 400 ⇒ errores por campo.

### 5.5 Diálogo reset de contraseña
- Confirmación con nombre del usuario, input de contraseña temporal (política §4.2 en vivo) y advertencia: "Se cerrarán todas las sesiones del usuario y deberá cambiar la contraseña al ingresar".
- Éxito ⇒ toast de confirmación; error ⇒ mensaje inline sin cerrar el diálogo.

### 5.6 Configuración del centro (`/configuracion`, solo ADMIN)
- Formulario con `OrganizationDto`: nombre, RUT (legalId), zona horaria (select IANA), dirección, teléfono, email.
- **Estados:** carga = skeleton del formulario; guardado = botón con spinner; éxito = toast; error = alert conservando los cambios ingresados.

### 5.7 Auditoría (`/auditoria`, solo ADMIN)
- Tabla paginada de `AuditLogDto`: fecha, usuario (email snapshot), acción (badge por tipo), entidad, registro; filtros por entidad, usuario, acción y rango de fechas.
- Detalle expandible con diff `oldValue`/`newValue` en formato legible.
- **Estados:** carga/vacío/error análogos a §5.3.

## 6. Plan de pruebas

### 6.1 Unitarias (apps/api, sin DB — dobles en memoria vía interfaces de repositorio, ADR-07)

**AuthService**
- Login OK emite access+refresh, audita `LOGIN`; el refresh se persiste hasheado (nunca en claro).
- Login con email inexistente / contraseña errónea / cuenta inactiva ⇒ misma `UnauthorizedException` genérica y auditoría `LOGIN_FAILED` (los tres casos indistinguibles para el cliente).
- Refresh válido rota: revoca el anterior, encadena `replaced_by_id`, audita `TOKEN_REFRESH`.
- Refresh reusado ⇒ revoca todas las sesiones del usuario y audita `TOKEN_REUSE_DETECTED`.
- Refresh expirado/desconocido/de usuario inactivo ⇒ 401 sin rotación.
- Logout revoca el token si existe y nunca lanza (204 idempotente).
- Cambio de contraseña: verifica actual, aplica política, `mustChangePassword=false`, revoca las demás sesiones, audita `PASSWORD_CHANGE`.

**UsersService**
- Crear PROFESSIONAL sin specialty ⇒ 400; ADMIN con specialty ⇒ 400; email duplicado ⇒ 409.
- Crear usuario deja `mustChangePassword=true` y hashea con bcrypt (verificar que no se persiste texto plano).
- Update valida invariante sobre el estado resultante (cambio de rol con/sin especialidad).
- Auto-desactivación y cambio de rol propio ⇒ 409 (por PATCH y por DELETE).
- DELETE marca `isActive=false`, revoca sesiones y nunca elimina; repetido ⇒ idempotente.
- Reset de contraseña: política aplicada, `mustChangePassword=true`, sesiones revocadas, auditoría `PASSWORD_RESET`.
- Toda operación de repositorio recibe `organizationId` explícito (aislamiento de tenant); id de otra organización ⇒ 404.
- Auditoría de mutaciones excluye `password_hash` en `oldValue`/`newValue`.

**Guards y política**
- `JwtAuthGuard`: token válido pasa; expirado/ausente/malformado ⇒ 401; `@Public()` hace bypass; acepta cookie `ct_access` y `Authorization: Bearer`.
- `RolesGuard`: PROFESSIONAL sobre endpoint `@Roles(ADMIN)` ⇒ 403; ADMIN pasa; sin metadata de roles ⇒ pasa (deny-by-default lo da el JwtAuthGuard global).
- `PasswordHasher` (bcryptjs): hash/verify round-trip; factor 12.
- Validador de política de contraseñas: casos límite (7 chars, sin mayúscula, sin dígito, etc.).

### 6.2 E2E (apps/api + PostgreSQL de prueba, supertest)

Flujo completo sobre la app real (guards y pipes globales activos), con datos sembrados por test:

1. **Login → me → logout:** login setea las 3 cookies; `/auth/me` responde el `AuthUserDto`; logout limpia cookies y el refresh queda revocado en DB.
2. **Ciclo refresh:** access expirado (TTL corto de test o token manipulado) ⇒ `/auth/refresh` con cookie rota tokens; el refresh viejo reutilizado ⇒ 401 + todas las sesiones del usuario revocadas + registro `TOKEN_REUSE_DETECTED` en `audit_logs`.
3. **CRUD de usuarios como ADMIN:** crear profesional (201) → aparece en `GET /users` con filtros → editar (200) → reset password (204, `must_change_password=true` en DB) → desactivar (204, fila viva con `is_active=false`) → login del desactivado ⇒ 401 genérico.
4. **Invariantes:** POST PROFESSIONAL sin specialty ⇒ 400; email duplicado ⇒ 409; auto-desactivación ⇒ 409.
5. **RBAC:** con sesión PROFESSIONAL, `GET /users` y `GET /audit-logs` ⇒ 403; `GET /auth/me` y `change-password` ⇒ OK; tras cambiar contraseña, la otra sesión del mismo usuario queda revocada.
6. **Organización:** `GET/PATCH /organizations/current` como ADMIN ⇒ 200 y auditoría `UPDATE`; PATCH como PROFESSIONAL ⇒ 403.
7. **Auditoría:** los flujos anteriores dejan las acciones esperadas y ningún `new_value`/`old_value` contiene `password_hash`.
8. **401 genérico:** login con email inexistente y con contraseña errónea devuelven cuerpo idéntico.

### 6.3 Frontend (mínimo del módulo)
- Unitarias de los schemas zod (paridad con §4).
- Middleware de Next: sin `ct_session` redirige a `/login`; con sesión, `/login` redirige al dashboard.

## 7. Definición de Hecho (DoD)

El módulo 1 se considera **terminado** cuando:

- [ ] La superficie REST completa (§ superficie del módulo en 04-api-rest.md) está implementada y documentada en Swagger (`/api/docs`), incluyendo códigos de error.
- [ ] Migraciones Prisma aplicadas para `organizations`, `users`, `refresh_tokens`, `audit_logs`, más seed de desarrollo (organización + admin inicial).
- [ ] Todas las reglas de negocio de §1 tienen test que las cubre (unitario o e2e); suites unitaria y e2e en verde y ejecutables por CI.
- [ ] Guards globales deny-by-default activos (`JwtAuthGuard` + `RolesGuard`); endpoints públicos solo los marcados `@Public()`.
- [ ] Auditoría verificada: toda mutación de User/Organization y todos los eventos de seguridad generan registro, sin `password_hash` en ningún caso.
- [ ] Frontend operativo: login, cambio de contraseña obligatorio, shell con navegación por rol, CRUD de usuarios con filtros/paginación, reset de contraseña, configuración del centro y vista de auditoría, con estados de carga/vacío/error.
- [ ] Refresh silencioso funcionando en el navegador (interceptor + cookies httpOnly; sin tokens en `localStorage`).
- [ ] `tsc --noEmit`, ESLint y Prettier sin errores en `apps/api`, `apps/web` y `packages/shared`.
- [ ] Documentación del módulo (este archivo) consistente con el código entregado; revisión cruzada contra ADR-04/05/06/08/10.

Cumplido el DoD, se habilita el inicio del **Módulo 2 · Pacientes**.
