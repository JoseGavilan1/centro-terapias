# 04 · Diseño de la API REST

> Documento canónico del contrato REST. Coherente con [01-arquitectura.md](./01-arquitectura.md) (ADR-05, ADR-06, ADR-09, ADR-12) y [02-modelo-datos.md](./02-modelo-datos.md). Los tipos referenciados (`LoginRequest`, `UserDto`, …) viven en `packages/shared` (`@centro/shared`) y son la fuente de verdad del contrato; los DTOs NestJS los **implementan** (ADR-09).

## 1. Convenciones generales

### 1.1 Versionado y prefijo

Toda la API vive bajo el prefijo **`/api/v1`** (ADR-12). Cambios incompatibles ⇒ `/api/v2` conviviendo temporalmente.

### 1.2 Autenticación

Dos mecanismos equivalentes (ADR-06):

| Mecanismo | Uso | Detalle |
|---|---|---|
| **Cookies httpOnly** | Navegador (apps/web vía proxy same-origin) | `ct_access` (JWT, path `/`), `ct_refresh` (token opaco, path `/api/v1/auth`), `ct_session` (marcador para el middleware de Next; sin valor de seguridad por sí mismo) |
| **`Authorization: Bearer <accessToken>`** | Clientes no-navegador, Swagger | El mismo JWT de acceso |

- **Access token:** JWT firmado, vida **15 min** (900 s).
- **Refresh token:** opaco, rotativo, vida **7 días**, almacenado como hash SHA-256 (ADR-05). El reuso de un refresh ya rotado revoca **todas** las sesiones del usuario y audita `TOKEN_REUSE_DETECTED`.
- Guards globales **deny-by-default**: todo endpoint exige JWT salvo los marcados `@Public()`; los endpoints de administración exigen además `@Roles(ADMIN)`.

### 1.3 Autorización (niveles usados en este documento)

| Nivel | Significado |
|---|---|
| **Público** | Sin token |
| **Autenticado** | JWT válido, cualquier rol |
| **ADMIN** | JWT válido + `role = ADMIN` (`403` si es PROFESSIONAL) |

### 1.4 Formato de errores

Formato estándar de NestJS:

```json
{ "statusCode": 400, "message": ["email must be an email"], "error": "Bad Request" }
```

- `message` puede ser `string` o `string[]` (errores de validación).
- Validación global con class-validator: `whitelist + forbidNonWhitelisted + transform` ⇒ propiedades desconocidas producen `400`.
- Los errores de autenticación son **genéricos por diseño**: el login fallido responde siempre `401 "Credenciales inválidas"` sin revelar si el email existe ni si la cuenta está inactiva.

### 1.5 Paginación

Los listados aceptan `page` (default 1) y `pageSize` (default y máximo definidos por endpoint) y responden `Paginated<T>` (`@centro/shared`):

```json
{ "data": [], "total": 0, "page": 1, "pageSize": 20, "totalPages": 0 }
```

### 1.6 Verbos y códigos de estado

| Verbo | Uso | Éxito |
|---|---|---|
| `GET` | Lectura (sin efectos) | `200` |
| `POST` | Creación / acciones | `201` (creación) · `200`/`204` (acciones) |
| `PATCH` | Actualización parcial | `200` con el recurso actualizado |
| `DELETE` | Desactivación (nunca borrado físico) | `204` |

Errores habituales: `400` validación, `401` no autenticado, `403` rol insuficiente, `404` recurso inexistente en el tenant, `409` conflicto de negocio.

### 1.7 Documentación interactiva

Swagger UI en **`/api/docs`**, con esquema Bearer para probar endpoints protegidos.

### 1.8 Multi-tenant

El `organizationId` viaja dentro del JWT y se inyecta en cada llamada a repositorio (ADR-03). **Ningún endpoint recibe `organizationId` por parámetro**: el tenant siempre deriva del token. Un `id` de otro tenant se comporta como inexistente (`404`).

## 2. Módulo 1 — Autenticación, usuarios, organizaciones, auditoría

### 2.1 Autenticación (`/api/v1/auth`)

#### `POST /auth/login` — Público

| | |
|---|---|
| Request | `LoginRequest` `{ email, password }` |
| Response | `200` `LoginResponse` `{ user: AuthUserDto, accessToken, expiresIn: 900 }` |
| Errores | `401` genérico ("Credenciales inválidas") ante email inexistente, contraseña incorrecta **o cuenta inactiva** · `400` validación |

**Efectos secundarios**
- Emite cookies `ct_access`, `ct_refresh` y `ct_session`; persiste el refresh (hash SHA-256) con IP y user-agent.
- Audita `LOGIN` en éxito; `LOGIN_FAILED` en fallo (con `user_id` NULL si el email no existe).
- Si `mustChangePassword = true`, el frontend redirige al cambio obligatorio; la API no bloquea el login.

#### `POST /auth/refresh` — Público

| | |
|---|---|
| Request | Cookie `ct_refresh` **o** body `{ refreshToken }` |
| Response | `200` `RefreshResponse` `{ accessToken, expiresIn: 900 }` |
| Errores | `401` token ausente, inválido, expirado o revocado |

**Efectos secundarios**
- **Rotación**: revoca el refresh usado, emite uno nuevo (cadena `replaced_by_id`) y re-emite las tres cookies. Audita `TOKEN_REFRESH`.
- **Detección de reuso**: si llega un refresh ya rotado ⇒ se revocan **todas** las sesiones del usuario y se audita `TOKEN_REUSE_DETECTED`; responde `401`.

#### `POST /auth/logout` — Público (tolerante)

| | |
|---|---|
| Request | Cookie `ct_refresh` si existe |
| Response | `204` siempre (idempotente: no falla sin sesión) |

**Efectos secundarios:** revoca el refresh de la sesión actual, limpia las tres cookies y audita `LOGOUT` cuando había sesión identificable.

#### `GET /auth/me` — Autenticado

| | |
|---|---|
| Response | `200` `AuthUserDto` |
| Errores | `401` |

Sin efectos secundarios. Es la fuente del frontend para rol, especialidad y `mustChangePassword`.

#### `POST /auth/change-password` — Autenticado

| | |
|---|---|
| Request | `ChangePasswordRequest` `{ currentPassword, newPassword }` |
| Response | `204` |
| Errores | `400` política de contraseña (mín. 8 caracteres, 1 mayúscula, 1 minúscula, 1 dígito) · `401` `currentPassword` incorrecta |

**Efectos secundarios:** re-hashea con bcrypt (factor 12), pone `mustChangePassword = false`, **revoca las demás sesiones** (conserva la actual) y audita `PASSWORD_CHANGE` (nunca se registran hashes; ADR-10).

### 2.2 Usuarios (`/api/v1/users`) — todos ADMIN

#### `GET /users`

| | |
|---|---|
| Query | `UsersQuery`: `search` (nombre/email), `role`, `specialty`, `isActive`, `page`, `pageSize` |
| Response | `200` `Paginated<UserDto>` |
| Errores | `400` query inválida · `401` · `403` |

`UserDto` nunca incluye `password_hash`. Sin efectos secundarios.

#### `GET /users/:id`

| | |
|---|---|
| Response | `200` `UserDto` |
| Errores | `404` inexistente o de otro tenant · `401` · `403` |

#### `POST /users`

| | |
|---|---|
| Request | `CreateUserRequest` `{ email, firstName, lastName, role, specialty?, phone?, temporaryPassword }` |
| Response | `201` `UserDto` |
| Errores | `409` email ya registrado (unicidad **global**) · `400` invariantes rol/especialidad (`specialty` obligatoria si PROFESSIONAL; prohibida si ADMIN) o política de contraseña · `401` · `403` |

**Efectos secundarios:** hashea `temporaryPassword` (bcrypt 12), crea el usuario con `mustChangePassword = true` en la organización del admin, y audita `CREATE` sobre `User` (nuevo valor sin hash).

#### `PATCH /users/:id`

| | |
|---|---|
| Request | `UpdateUserRequest` `{ firstName?, lastName?, role?, specialty?, phone?, isActive? }` |
| Response | `200` `UserDto` |
| Errores | `409` el admin intenta **desactivarse a sí mismo o cambiar su propio rol** · `400` invariantes rol/especialidad · `404` · `401` · `403` |

**Efectos secundarios:** audita `UPDATE` con valor anterior/nuevo (sin hash). Si `isActive` pasa a `false`, se revocan las sesiones del usuario desactivado.

#### `DELETE /users/:id`

| | |
|---|---|
| Response | `204` |
| Errores | `409` auto-desactivación · `404` · `401` · `403` |

**Efectos secundarios:** **desactiva** (`isActive = false`), nunca borra físicamente; revoca todas las sesiones del usuario y audita `DELETE` sobre `User`.

#### `POST /users/:id/reset-password`

| | |
|---|---|
| Request | `ResetPasswordRequest` `{ temporaryPassword }` |
| Response | `204` |
| Errores | `400` política de contraseña · `404` · `401` · `403` |

**Efectos secundarios:** hashea la contraseña temporal, pone `mustChangePassword = true`, revoca todas las sesiones del usuario afectado y audita `PASSWORD_RESET`.

### 2.3 Organización (`/api/v1/organizations`)

El recurso es siempre **`current`** (la organización del token); no existe acceso por `:id` de otro tenant.

#### `GET /organizations/current` — Autenticado

| | |
|---|---|
| Response | `200` `OrganizationDto` |
| Errores | `401` |

#### `PATCH /organizations/current` — ADMIN

| | |
|---|---|
| Request | `UpdateOrganizationRequest` `{ name?, legalId?, timezone?, address?, phone?, email?, whatsappPhoneNumberId?, googleFormsUrl?, waitlistIntakeToken? }` |
| Response | `200` `OrganizationDto` |
| Errores | `400` validación (p. ej. timezone inválida) · `401` · `403` |

**Efectos secundarios:** audita `UPDATE` sobre `Organization` con valor anterior/nuevo.

### 2.4 Auditoría (`/api/v1/audit-logs`)

#### `GET /audit-logs` — ADMIN

| | |
|---|---|
| Query | `AuditLogsQuery`: `entity`, `userId`, `action` (`AuditAction`), `from`, `to` (ISO 8601), `page`, `pageSize` |
| Response | `200` `Paginated<AuditLogDto>` |
| Errores | `400` query inválida · `401` · `403` |

Solo lectura: la API **no expone** creación, edición ni borrado de logs (append-only, ADR-10). `oldValue`/`newValue` jamás contienen `password_hash`.

### 2.5 Salud

#### `GET /health` — Público

`200` `{ "status": "ok" }`. Usado por probes de Azure. Sin autenticación ni efectos.

## 3. Módulo 2 — Pacientes

> Diseño completo en [modulo-02-pacientes.md](./modulos/modulo-02-pacientes.md). `POST`/`PATCH`/`DELETE` exigen `role=ADMIN` (`403` para `PROFESSIONAL`). Las lecturas (`GET`) aceptan también `PROFESSIONAL` desde el Módulo 3, filtradas por asignación vía agenda — ver [modulo-03-agenda.md](./modulos/modulo-03-agenda.md) §1.2 (cierra la decisión diferida en el §1.1 del Módulo 2).

### 3.1 Pacientes (`/api/v1/patients`)

#### `GET /patients` — ADMIN (todos) / PROFESSIONAL (asignados)

| | |
|---|---|
| Query | `PatientsQuery`: `search` (nombre o RUT, con o sin formato), `isActive`, `page`, `pageSize` |
| Response | `200` `Paginated<PatientDto>` |
| Errores | `400` query inválida · `401` |

Filtra siempre por el `organizationId` del token. Si el actor es `PROFESSIONAL`, además filtra por los pacientes con un `TherapySlot` activo asignado a él (Módulo 3 §1.2) — un profesional sin pacientes asignados recibe una página vacía, no error. Sin efectos secundarios (no se audita lectura).

#### `GET /patients/:id` — ADMIN (todos) / PROFESSIONAL (asignados)

| | |
|---|---|
| Response | `200` `PatientDto` |
| Errores | `404` inexistente, de otro tenant, o (`PROFESSIONAL`) sin `TherapySlot` activo asignado a él · `401` |

#### `POST /patients` — ADMIN

| | |
|---|---|
| Request | `CreatePatientRequest` `{ firstName, lastName, rut, birthDate, diagnosis?, phone, email?, address?, observations? }` |
| Response | `201` `PatientDto` (`isActive=true`, `driveFolderId=null`) |
| Errores | `409` RUT ya registrado en la organización (activo o inactivo) · `400` RUT con dígito verificador inválido, `birthDate` futura o campo requerido faltante · `401` · `403` |

**Efectos secundarios:** normaliza el `rut` a formato canónico antes de persistir; audita `CREATE` sobre `Patient` (valor nuevo).

#### `PATCH /patients/:id` — ADMIN

| | |
|---|---|
| Request | `UpdatePatientRequest` `{ firstName?, lastName?, rut?, birthDate?, diagnosis?, phone?, email?, address?, observations?, isActive? }` |
| Response | `200` `PatientDto` |
| Errores | `409` el `rut` modificado coincide con el de otro paciente de la misma organización · `400` RUT inválido o `birthDate` futura · `404` · `401` · `403` |

**Efectos secundarios:** audita `UPDATE` con valor anterior/nuevo. `isActive` es editable aquí (permite reactivar sin pasar por `DELETE`); `driveFolderId` no es editable por contrato en este módulo (reservado al Módulo 5).

#### `DELETE /patients/:id` — ADMIN

| | |
|---|---|
| Response | `204` |
| Errores | `404` · `401` · `403` |

**Efectos secundarios:** **desactiva** (`isActive=false`), nunca borra físicamente; idempotente (repetir sobre un paciente ya inactivo también responde `204`); audita `DELETE` sobre `Patient`.

## 4. Módulo 3 — Agenda

> Diseño completo en [modulo-03-agenda.md](./modulos/modulo-03-agenda.md). Cierra la decisión diferida en el Módulo 2 §1.1 (ver §3.1 más arriba).

### 4.1 Plantillas (`/api/v1/therapy-slots`)

#### `GET /therapy-slots` — ADMIN (todas) / PROFESSIONAL (propias)

| | |
|---|---|
| Query | `TherapySlotsQuery`: `professionalId?` (ignorado si el actor es `PROFESSIONAL`, se fuerza a sí mismo), `patientId?`, `page`, `pageSize` |
| Response | `200` `Paginated<TherapySlotDto>` |
| Errores | `400` query inválida · `401` |

#### `POST /therapy-slots` — ADMIN

| | |
|---|---|
| Request | `CreateTherapySlotRequest` `{ patientId, professionalId, weekday, startTime, durationMinutes, validFrom, validTo? }` |
| Response | `201` `TherapySlotDto` (`isActive=true`) |
| Errores | `404` paciente/profesional inexistente en la organización · `400` profesional sin `role=PROFESSIONAL`, horario/duración inválidos o `validTo < validFrom` · `409` solapamiento con otro slot activo del mismo profesional o del mismo paciente en el mismo `weekday` · `401` · `403` (`PROFESSIONAL`) |

**Efectos secundarios:** audita `CREATE` sobre `TherapySlot`.

#### `PATCH /therapy-slots/:id` — ADMIN

| | |
|---|---|
| Request | `UpdateTherapySlotRequest` (todos los campos de creación opcionales + `isActive?`) |
| Response | `200` `TherapySlotDto` |
| Errores | `404` · `400` · `409` solapamiento con el horario resultante · `401` · `403` |

**Efectos secundarios:** audita `UPDATE`.

#### `DELETE /therapy-slots/:id` — ADMIN

| | |
|---|---|
| Response | `204` |
| Errores | `404` · `401` · `403` |

**Efectos secundarios:** **desactiva** (`isActive=false`), nunca borra físicamente; no afecta `Appointment` ya generados; idempotente; audita `DELETE`.

#### `POST /therapy-slots/generate-appointments` — ADMIN

| | |
|---|---|
| Request | `GenerateAppointmentsRequest` `{ from, to }` (ISO, `to >= from`, rango ≤ 60 días) |
| Response | `200` `{ created: number, skipped: number }` |
| Errores | `400` rango inválido o mayor a 60 días · `401` · `403` |

**Efectos secundarios:** crea un `Appointment` en `PENDIENTE` por cada `(TherapySlot activo, fecha)` del rango que aún no existía (idempotente); no audita cada instancia individualmente (operación de sistema), pero registra un único `CREATE` agregado sobre `Appointment` con el conteo generado.

### 4.2 Citas (`/api/v1/appointments`)

#### `GET /appointments` — ADMIN (todas) / PROFESSIONAL (propias)

| | |
|---|---|
| Query | `AppointmentsQuery`: `dateFrom?`, `dateTo?`, `professionalId?` (ignorado si el actor es `PROFESSIONAL`), `patientId?`, `status?`, `page`, `pageSize` |
| Response | `200` `Paginated<AppointmentDto>` |
| Errores | `400` query inválida · `401` |

Sin efectos secundarios (no se audita lectura).

#### `POST /appointments` — ADMIN

| | |
|---|---|
| Request | `CreateAppointmentRequest` `{ patientId, professionalId, date, startTime, durationMinutes, notes? }` (sobrecupo, sin plantilla) |
| Response | `201` `AppointmentDto` (`therapySlotId=null`, `status=SOBRECUPO`) |
| Errores | `404` paciente/profesional inexistente · `400` validación · `409` solapamiento con otra cita no cancelada del mismo profesional o paciente · `401` · `403` |

**Efectos secundarios:** audita `CREATE` sobre `Appointment`.

#### `PATCH /appointments/:id/status` — ADMIN

| | |
|---|---|
| Request | `UpdateAppointmentStatusRequest` `{ status: 'CONFIRMADA' \| 'CANCELADA', notes? }` |
| Response | `200` `AppointmentDto` |
| Errores | `404` · `409` transición inválida (estado terminal previo, o transición no soportada por esta vía) · `401` · `403` |

**Efectos secundarios:** `CONFIRMADA` fija `confirmedVia=MANUAL`; audita `UPDATE` con valor anterior/nuevo.

#### `PATCH /appointments/:id/attendance` — ADMIN (cualquiera) / PROFESSIONAL (propias)

| | |
|---|---|
| Request | `MarkAttendanceRequest` `{ status: 'ATENDIDA' \| 'NO_ASISTIO' \| 'CANCELADA', notes? }` |
| Response | `200` `AppointmentDto` |
| Errores | `404` inexistente, de otro tenant, o (`PROFESSIONAL`) de otro profesional · `400` (`PROFESSIONAL`) fecha futura · `409` estado terminal previo · `401` |

**Efectos secundarios:** registra `attendanceMarkedById`/`attendanceMarkedAt`; audita `UPDATE`.

## 5. Módulo 4 — Fichas clínicas

> Diseño completo en [modulo-04-fichas-clinicas.md](./modulos/modulo-04-fichas-clinicas.md). No existe un recurso `clinical-records`: la ficha es una vista lógica sobre `Patient` + `Evolution` (§1.1 de ese documento). Append-only real: no hay `PATCH`/`DELETE` de evoluciones; una corrección es una evolución nueva con `amendsId`.

### 5.1 Evoluciones (`/api/v1/patients/:patientId/evolutions`)

#### `GET /patients/:patientId/evolutions` — ADMIN (todos los pacientes) / PROFESSIONAL (asignados)

| | |
|---|---|
| Query | `EvolutionsQuery`: `page`, `pageSize` |
| Response | `200` `Paginated<EvolutionDto>`, orden `date` descendente |
| Errores | `404` paciente inexistente o (`PROFESSIONAL`) fuera de su alcance de agenda · `401` |

Evoluciones `confidentiality=PSYCHOLOGICAL` viajan redactadas (`redacted=true`, `observation`/`workPlan`/`amendsId=null`) para todo actor sin `specialty=PSICOLOGIA` — **incluido `ADMIN`** (ADR-04). Sin efectos secundarios (no se audita lectura).

#### `GET /patients/:patientId/evolutions/:id` — mismo alcance que el listado

| | |
|---|---|
| Response | `200` `EvolutionDto` (redactado según confidencialidad, igual que el listado) |
| Errores | `404` inexistente para ese paciente/organización, o paciente fuera de alcance · `401` |

#### `POST /patients/:patientId/evolutions` — PROFESSIONAL

| | |
|---|---|
| Request | `CreateEvolutionRequest` `{ date, observation, workPlan, appointmentId?, amendsId? }` |
| Response | `201` `EvolutionDto` (`redacted=false`: el autor siempre ve lo que escribió) |
| Errores | `404` paciente inexistente o fuera de su alcance de agenda · `400` `date` futura, `appointmentId` no `ATENDIDA`/de otro profesional/de otro paciente, `amendsId` de otro paciente · `409` `appointmentId` ya vinculado a otra evolución · `401` · `403` (`ADMIN`) |

**Efectos secundarios:** `confidentiality` se deriva de `actor.specialty` (`PSICOLOGIA` ⇒ `PSYCHOLOGICAL`, si no `STANDARD`) — **no es un campo del request** (el `ValidationPipe` global lo rechaza con `400` si se envía); audita `CREATE` sobre `Evolution` **sin** `observation`/`workPlan` en `newValue` cuando `confidentiality=PSYCHOLOGICAL`.

## 6. Módulo 5 — Documentos (Google Drive)

> Diseño completo en [modulo-05-documentos.md](./modulos/modulo-05-documentos.md). El binario nunca pasa por la API en reposo: vive detrás de `DocumentStoragePort` (ADR-11, `GoogleDriveStorageAdapter` en producción / `LocalDiskStorageAdapter` en desarrollo y test). La descarga siempre se proxea — nunca se expone una URL directa del proveedor.

### 6.1 Documentos (`/api/v1/patients/:patientId/documents`)

#### `GET /patients/:patientId/documents` — ADMIN (todos) / PROFESSIONAL (asignados)

| | |
|---|---|
| Query | `DocumentsQuery`: `page`, `pageSize` |
| Response | `200` `Paginated<DocumentDto>`, orden `createdAt` descendente |
| Errores | `404` paciente inexistente o (`PROFESSIONAL`) fuera de su alcance de agenda · `401` |

Documentos `confidentiality=PSYCHOLOGICAL` viajan redactados (`redacted=true`, `name`/`mimeType`/`sizeBytes=null`) para todo actor sin `specialty=PSICOLOGIA` — incluido `ADMIN` (ADR-04, mismo criterio que Evoluciones). Sin efectos secundarios.

#### `GET /patients/:patientId/documents/:id/download` — mismo alcance que el listado

| | |
|---|---|
| Response | `200` binario (`Content-Type`/`Content-Disposition` del documento) |
| Errores | `404` inexistente o paciente fuera de alcance · `403` `confidentiality=PSYCHOLOGICAL` sin `specialty=PSICOLOGIA` (un binario no tiene versión parcial que redactar) · `401` |

#### `POST /patients/:patientId/documents` — PROFESSIONAL

| | |
|---|---|
| Request | `multipart/form-data`: campo `file` + `category` (`DocumentCategory`) + `evolutionId?` |
| Response | `201` `DocumentDto` (`redacted=false`) |
| Errores | `404` paciente inexistente o fuera de su alcance de agenda · `400` tipo de archivo no permitido, tamaño mayor a `DOCUMENTS_MAX_UPLOAD_BYTES`, `evolutionId` de otro paciente · `401` · `403` (`ADMIN`) |

**Efectos secundarios:** si `Patient.driveFolderId` es `NULL`, aprovisiona la carpeta (raíz + subcarpetas por categoría) antes de subir y persiste el id devuelto; `confidentiality` se deriva de `actor.specialty` (igual que Evoluciones) — no es un campo del request; audita `CREATE` sobre `Document` (sin `name` en `newValue` cuando `confidentiality=PSYCHOLOGICAL`, por si el nombre del archivo fuera sensible).

## 7. Módulo 6 — WhatsApp

> Diseño completo en [modulo-06-whatsapp.md](./modulos/modulo-06-whatsapp.md). Sin IA (spec textual): toda respuesta es texto fijo elegido por un árbol de decisión determinista. `Organization.whatsappPhoneNumberId` identifica a qué organización pertenece cada webhook entrante.

### 7.1 Webhook (`/api/v1/webhooks/whatsapp`) — `@Public()`, sin JWT

#### `GET /webhooks/whatsapp` — verificación (handshake de Meta)

| | |
|---|---|
| Query | `hub.mode`, `hub.verify_token`, `hub.challenge` |
| Response | `200` con `hub.challenge` en texto plano si `hub.verify_token` coincide con `WHATSAPP_VERIFY_TOKEN` |
| Errores | `403` si no coincide (o si no hay `WHATSAPP_VERIFY_TOKEN` configurado) |

#### `POST /webhooks/whatsapp` — mensajes entrantes

| | |
|---|---|
| Request | Payload de Meta Cloud API (`entry[].changes[].value.{metadata,messages}`) |
| Response | `200 { received: true }` siempre (Meta reintenta el mismo mensaje si no recibe 2xx) |
| Errores | `401` firma `X-Hub-Signature-256` inválida (solo si `WHATSAPP_APP_SECRET` está configurado) |

**Efectos secundarios:** resuelve la organización por `phone_number_id` (mensaje a un número no registrado se descarta); ejecuta el motor conversacional determinista (§1 de `modulo-06-whatsapp.md`); puede mutar `Appointment.status`/`confirmedVia=WHATSAPP` y auditar con actor de sistema (`userId=null`); registra cada mensaje entrante/saliente en `whatsapp_messages`.

### 7.2 Administración (`/api/v1/whatsapp`) — ADMIN

#### `GET /whatsapp/messages`

| | |
|---|---|
| Query | `WhatsAppMessagesQuery`: `page`, `pageSize` |
| Response | `200` `Paginated<WhatsAppMessageDto>`, orden `createdAt` descendente |
| Errores | `401` · `403` |

#### `POST /whatsapp/reminders/run`

| | |
|---|---|
| Response | `200` `{ created: number, skipped: number }` → en rigor `{ sent, skipped }` (`ReminderRunResult`) |
| Errores | `401` · `403` |

**Efectos secundarios:** mismo método que el `@Cron` diario (idempotente): busca citas `PENDIENTE` de "mañana" en todas las organizaciones, envía el recordatorio a las que no lo tengan ya y deja la conversación de ese teléfono en `AWAITING_ATTENDANCE_CONFIRMATION`.

## 8. Módulo 7 — Lista de espera

> Diseño completo en [modulo-07-lista-espera.md](./modulos/modulo-07-lista-espera.md). Tres estados terminales (`PENDIENTE → ASIGNADA|DESCARTADA`, §1.1); solo ADMIN administra el recurso, no hay vista de `PROFESSIONAL`.

### 8.1 Webhook (`/api/v1/webhooks/waitlist`) — `@Public()`, sin JWT

#### `POST /webhooks/waitlist` — ingreso automático (Google Forms → Apps Script)

| | |
|---|---|
| Header | `X-Intake-Token` (token de la organización, `Organization.waitlistIntakeToken`) |
| Request | `IntakeWaitlistRequest` (idéntico a `CreateWaitlistEntryRequest`, ver §8.2) |
| Response | `201` `WaitlistEntryDto`, `status=PENDIENTE` |
| Errores | `401` token ausente o inválido (comparación segura contra `waitlistIntakeToken`) |

### 8.2 Administración (`/api/v1/waitlist`) — ADMIN

#### `GET /waitlist`

| | |
|---|---|
| Query | `WaitlistQuery`: `status?`, `requestedSpecialty?`, `page`, `pageSize` |
| Response | `200` `Paginated<WaitlistEntryDto>`, orden: `PENDIENTE` primero (más antigua primero), luego resueltas por `resolvedAt` descendente |
| Errores | `401` · `403` |

#### `POST /waitlist` — ingreso manual

| | |
|---|---|
| Request | `CreateWaitlistEntryRequest` `{ childFirstName, childLastName, childRut?, childBirthDate?, guardianName, guardianPhone, guardianEmail?, requestedSpecialty?, reason? }` |
| Response | `201` `WaitlistEntryDto`, `status=PENDIENTE` |
| Errores | `400` validación · `401` · `403` |

#### `PATCH /waitlist/:id` — editar (solo `PENDIENTE`)

| | |
|---|---|
| Request | `UpdateWaitlistEntryRequest` (mismos campos que `Create`, todos opcionales, más `sede?`) |
| Response | `200` `WaitlistEntryDto` |
| Errores | `400` · `401` · `403` · `404` · `409` si la entrada ya fue resuelta |

#### `PATCH /waitlist/:id/assign` — crea `Patient` + `TherapySlot`

| | |
|---|---|
| Request | `AssignWaitlistEntryRequest` `{ professionalId, weekday, startTime, durationMinutes, validFrom, sede?, rut?, birthDate? }` (`rut`/`birthDate` obligatorios en la práctica si la entrada no los trae) |
| Response | `200` `WaitlistEntryDto`, `status=ASIGNADA`, `assignedPatientId`/`assignedTherapySlotId` completos |
| Errores | `400` falta `rut`/`birthDate` · `401` · `403` · `404` · `409` entrada ya resuelta, RUT ya usado por otro paciente, u horario solapado (compensa borrando el `Patient` recién creado, §1.6) |

#### `PATCH /waitlist/:id/discard` — descartar (solo `PENDIENTE`)

| | |
|---|---|
| Request | `DiscardWaitlistEntryRequest` `{ reason }` (obligatorio) |
| Response | `200` `WaitlistEntryDto`, `status=DESCARTADA` |
| Errores | `400` sin motivo · `401` · `403` · `404` · `409` entrada ya resuelta |

**Efectos secundarios:** toda mutación audita sobre `WaitlistEntry`; `assign` además dispara la auditoría propia de `PatientsService`/`TherapySlotsService` (no se duplica).

## 9. Módulo 8 — Incidencias

> Diseño completo en [modulo-08-incidencias.md](./modulos/modulo-08-incidencias.md). Violencia, abuso, accidentes y situaciones graves, con prioridad alta ⇒ notificación inmediata al administrador (reutiliza el canal WhatsApp del Módulo 6).

### `GET /incidents` — cualquier autenticado

| | |
|---|---|
| Query | `IncidentsQuery`: `status?`, `type?`, `patientId?`, `page`, `pageSize` |
| Response | `200` `Paginated<IncidentDto>`. `ADMIN`: todas las de la organización. `PROFESSIONAL`: solo las que reportó (§1.2) |
| Errores | `401` |

### `GET /incidents/:id` — cualquier autenticado

| | |
|---|---|
| Response | `200` `IncidentDto` |
| Errores | `401` · `404` (inexistente, o `PROFESSIONAL` pidiendo una que no reportó) |

### `POST /incidents` — ADMIN o PROFESSIONAL

| | |
|---|---|
| Request | `CreateIncidentRequest` `{ patientId?, type, description, occurredAt }` |
| Response | `201` `IncidentDto`, `status=ABIERTA` |
| Errores | `400` validación · `401` · `404` paciente inexistente, o no asignado si el actor es `PROFESSIONAL` |

### `PATCH /incidents/:id` — solo ADMIN

| | |
|---|---|
| Request | `UpdateIncidentStatusRequest` `{ status }` (no admite tocar tipo/descripción/paciente/fecha) |
| Response | `200` `IncidentDto` |
| Errores | `400` · `401` · `403` (`PROFESSIONAL`) · `404` · `409` la incidencia ya está `CERRADA` (terminal) |

**Efectos secundarios:** `POST` audita `CREATE` y notifica por WhatsApp a los administradores con teléfono configurado (best-effort, se omite en silencio si la organización no tiene `whatsappPhoneNumberId`); `PATCH` audita `UPDATE` con valor anterior/nuevo completo.

## 10. Módulo 9 — Reportes

> Diseño completo en [modulo-09-reportes.md](./modulos/modulo-09-reportes.md). Agregación de solo lectura sobre `Patient`/`Appointment`/`User`/`WaitlistEntry` — sin entidad ni migración propia. Todos los endpoints `@Roles(ADMIN)`.

### `GET /reports/summary`

| | |
|---|---|
| Response | `200` `ReportsSummaryDto` `{ activePatients, activeProfessionals, pendingWaitlistEntries }` |
| Errores | `401` · `403` |

### `GET /reports/attendance`

| | |
|---|---|
| Query | `AttendanceReportQuery`: `from?`, `to?` (ISO `YYYY-MM-DD`; default: mes actual hasta hoy) |
| Response | `200` `AttendanceReportDto` `{ from, to, total, pending, confirmed, cancelled, noShow, overbooked, attended }` |
| Errores | `400` · `401` · `403` |

### `GET /reports/monthly`

| | |
|---|---|
| Query | `MonthlyReportQuery`: `months?` (entero 1–24, default 6) |
| Response | `200` `MonthlyReportEntryDto[]`, un elemento por mes (`{ month, totalAppointments, attended, noShow, cancelled, newPatients, newWaitlistEntries }`) |
| Errores | `400` · `401` · `403` |

## 11. Superficie futura (borrador)

> **Borrador no vinculante.** Lista de recursos previstos por módulo, solo para reservar nomenclatura y verificar coherencia REST. Rutas, campos, códigos y reglas se cierran en el diseño de cada módulo (regla: no se avanza sin cerrar el anterior).

| Módulo | Recursos previstos (bajo `/api/v1`) | Notas |
|---|---|---|
| **10 · Dashboard** | Reutiliza `/reports/*` | Sin superficie propia salvo necesidad detectada en diseño |

Invariantes que aplicarán a toda la superficie futura: prefijo `/api/v1`, autenticación por cookie/Bearer, `Paginated<T>` en listados, tenant desde el JWT, auditoría de toda mutación y contratos en `@centro/shared`.
