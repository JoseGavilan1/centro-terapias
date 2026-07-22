# Módulo 7 · Lista de espera

## 1. Reglas de negocio del módulo (resumen normativo)

- Los pacientes **nuevos** llegan por un formulario de Google Forms (uno por organización). Cada
  respuesta crea una `WaitlistEntry` en estado `PENDIENTE`. El administrador también puede crear
  una entrada manualmente (consulta telefónica, presencial, etc.) — mismo modelo, mismo flujo
  desde ese punto.
- Mientras una entrada está `PENDIENTE`, el paciente permanece "en lista de espera": no existe
  como `Patient` ni tiene agenda.
- El administrador decide **terapeuta, horario y sede** (la especialidad queda implícita en el
  terapeuta elegido — ver §1.2). Al asignar:
  1. Se crea un `Patient` nuevo con los datos capturados en la entrada.
  2. Se crea un `TherapySlot` (día/hora/profesional fijos — mismo modelo del Módulo 3, sin
     reservas dinámicas) para ese paciente.
  3. La entrada pasa a `ASIGNADA`, enlazada al `Patient` y al `TherapySlot` creados.
- Alternativamente el administrador puede **descartar** una entrada (familia no responde, decide
  no continuar, etc.), con un motivo obligatorio. `ASIGNADA` y `DESCARTADA` son estados
  terminales — no hay "reabrir" ni "reasignar" desde este módulo (ver §1.1).
- Solo `ADMIN` administra la lista de espera (instructions.txt: "administrar lista de espera" es
  una capacidad exclusiva del administrador). No existe vista de `PROFESSIONAL` sobre este módulo.

### 1.1 Decisión de diseño: tres estados, no cuatro

Una versión anterior de este documento (`02-modelo-datos.md` §9, borrador) anticipaba un cuarto
estado `CONTACTADO` (familia contactada, aún sin horario asignado). Se descarta para el alcance de
este módulo: el spec original no distingue "contactado" de "pendiente", y agregar un estado
intermedio sin un caso de uso que lo consuma (¿quién lo setea? ¿qué acción dispara la transición?)
sería anticipar un requisito no pedido. Si en el futuro se necesita rastrear intentos de contacto,
se agrega como un campo (`lastContactedAt`) o una bitácora, no como un estado de la máquina —
cambio aditivo que no rompe el contrato actual.

Por el mismo motivo, `ASIGNADA`/`DESCARTADA` son terminales: no hay transición de vuelta a
`PENDIENTE`. Si una asignación fue un error, se corrige directamente sobre el `Patient`/
`TherapySlot` ya creados (Módulos 2/3), igual que un error de agenda no se corrige "reabriendo" la
lista de espera.

### 1.2 Decisión de diseño: la especialidad no es un campo propio de la asignación

El formulario puede capturar `requestedSpecialty` (interés declarado por la familia), pero es
solo informativo. La especialidad real queda fijada por `TherapySlot.professional.specialty` una
vez elegido el profesional — igual que en el Módulo 3, donde no existe un campo de especialidad en
`TherapySlot` (se deriva del profesional). Duplicarlo aquí abriría la puerta a que ambos
diverjan sin ninguna validación cruzada que lo impida.

### 1.3 Decisión de diseño: `sede` como texto libre, no una entidad `Location`

El spec pide que el administrador decida "terapeuta, especialidad, sede, horario", pero el resto
del sistema (`Organization` = un centro) nunca modela sedes múltiples — no hay overhead de una
entidad `Location` en ningún módulo anterior. Se modela `sede` como un `String?` libre en
`WaitlistEntry`, informativo, sin relación ni validación contra un catálogo. Si el centro abre
sucursales en el futuro, se promueve a entidad real (con FK desde `Patient`/`TherapySlot`) — no se
anticipa ahora (YAGNI).

### 1.4 Decisión de diseño: ingreso automático vía Google Forms → Apps Script → webhook

Google Forms no permite hacer un `POST` HTTP directo al enviarse una respuesta. El puente estándar
es un **Google Apps Script** vinculado a la hoja de respuestas del formulario, con un disparador
`onFormSubmit` que hace un `fetch` hacia `POST /webhooks/waitlist` con las respuestas mapeadas al
body de `IntakeWaitlistRequest` (ver §4.1) y un header `X-Intake-Token`.

A diferencia del webhook de WhatsApp (Módulo 6, un único endpoint de Meta compartido por todas las
organizaciones, que resuelve el tenant por `phone_number_id` recibido en el payload), cada
organización tiene su **propio** Google Form y su propio Apps Script — no hay un payload
entrante con el id de organización. Se resuelve el tenant por el token mismo: cada organización
tiene un `waitlistIntakeToken` único (`Organization.waitlistIntakeToken`, análogo a
`whatsappPhoneNumberId`), generado por el administrador desde "Centro" (mismo lugar que
`whatsappPhoneNumberId`/`googleFormsUrl`, Módulo 6 HU-06) y pegado en el Apps Script del formulario
correspondiente. El endpoint busca la organización por ese token (`findUnique` + comparación
`timingSafeEqual`, mismo criterio de seguridad que la firma HMAC de WhatsApp) en vez de recibir un
`organizationId` en la URL — así una organización nunca puede enviar entradas a otra ni enumerar
ids ajenos.

Es intencional que la generación del token sea una acción de frontend (`crypto.randomUUID()`
rellena el campo antes de guardar vía el `PATCH /organizations/current` ya existente, no un
endpoint nuevo): mismo nivel de exposición que `whatsappPhoneNumberId` (visible solo a `ADMIN`
autenticado de esa organización, vía HTTPS) — no se justifica una ceremonia de "mostrar una sola
vez" para un secreto operativo de bajo impacto (a lo sumo, alguien con el token puede crear
entradas de lista de espera falsas, no leer ni modificar datos existentes).

### 1.5 Decisión de diseño: solo pacientes *nuevos*

El spec es explícito: "Los pacientes **nuevos** llegan mediante Google Forms". Si el RUT indicado
al asignar ya pertenece a un paciente existente de la organización (activo o inactivo — mismo
criterio de unicidad que `patients.rut`, Módulo 2 §1), `PatientsService.create` lanza `409
Conflict` y la asignación falla explícitamente. Un hijo adicional de una familia ya paciente, o una
nueva terapia para un paciente existente, se gestiona agregando un `TherapySlot` directamente desde
el Módulo 3 — este módulo no lo intenta detectar ni redirigir automáticamente.

### 1.6 Decisión de diseño: compensación si falla la creación del horario (saga simple)

Asignar es, en términos de dominio, una operación atómica ("esta entrada se convierte en un
paciente con un horario"), pero se implementa como dos escrituras independientes reutilizando
servicios existentes (`PatientsService.create` seguido de `TherapySlotsService.create`, ver §3
CU-04) — no una transacción de base de datos, porque envolverlas exigiría que ambos servicios
acepten un cliente Prisma transaccional inyectado desde afuera, un cambio invasivo a dos módulos ya
cerrados (Módulos 2 y 3) por un caso de uso nuevo.

Si `TherapySlotsService.create` falla (el caso esperable: `ConflictException` por solapamiento de
horario), el `Patient` ya fue creado. `WaitlistService` lo compensa: `prisma.patient.delete` del
paciente recién creado (borrado físico real, no `deactivate` — no tiene ninguna fila dependiente
todavía, a diferencia de cualquier `Patient` con historia clínica, donde el borrado físico nunca
sería seguro) y relanza el error original. La entrada permanece `PENDIENTE` y el administrador
reintenta con otro horario. Es una compensación (saga), no una transacción: hay una ventana breve
donde el `Patient` existe sin horario, pero nunca queda visible como resultado de una asignación
fallida.

## 2. Historias de usuario

### 2.1 Como administrador

#### HU-01 · Ver la lista de espera y filtrar

Como ADMIN quiero ver todas las entradas de mi organización, filtrar por estado y por especialidad
solicitada, para priorizar a quién contactar y agendar primero.

#### HU-02 · Asignar una entrada (crear paciente + horario)

Como ADMIN quiero elegir terapeuta, día, hora, duración, vigencia y sede para una entrada
pendiente, para que el sistema cree el paciente y su horario fijo en un solo paso.

#### HU-03 · Descartar una entrada

Como ADMIN quiero descartar una entrada indicando el motivo, para sacarla de la lista de espera
activa sin que quede ambigua (se conserva el motivo, no se borra el registro).

#### HU-04 · Crear una entrada manualmente

Como ADMIN quiero registrar una consulta que llegó por teléfono o presencial (no por el
formulario), para que siga el mismo flujo de asignación que una entrada de Google Forms.

#### HU-05 · Editar una entrada pendiente

Como ADMIN quiero corregir datos de contacto mal capturados por el formulario (p. ej. un teléfono
mal escrito) mientras la entrada sigue pendiente, para no tener que descartarla y recrearla.

#### HU-06 · Configurar el token de ingreso del formulario

Como ADMIN quiero generar (o regenerar) el token que identifica a mi organización ante el webhook
de ingreso, para conectar el Apps Script de mi Google Form o para invalidar uno filtrado.

### 2.2 Como sistema (Google Forms vía Apps Script)

#### HU-07 · Ingreso automático de una respuesta del formulario

Cuando una familia completa el Google Form, el Apps Script asociado envía la respuesta al webhook
de la plataforma, que crea la entrada en estado `PENDIENTE` sin intervención humana.

## 3. Casos de uso

### CU-01 · Webhook de ingreso (`POST /webhooks/waitlist`, `@Public()`)

1. Se recibe `X-Intake-Token` + body (`IntakeWaitlistRequest`).
2. Se busca la organización por `waitlistIntakeToken` (comparación `timingSafeEqual`). Si no hay
   token, no coincide, o la organización no tiene uno configurado → `401 Unauthorized`.
3. Se valida el body (mismo `ValidationPipe` global; `childFirstName`, `childLastName`,
   `guardianName`, `guardianPhone` obligatorios).
4. Se crea la `WaitlistEntry` en `PENDIENTE`. No hay respuesta de negocio que devolver más allá de
   `201 Created` con la entrada creada (Apps Script no hace nada con la respuesta).

### CU-02 · Ingreso manual (`POST /waitlist`, ADMIN)

Mismo cuerpo (`CreateWaitlistEntryRequest`, idéntico a `IntakeWaitlistRequest`) autenticado con JWT
en vez de token de intake. Misma validación, mismo resultado (`PENDIENTE`).

### CU-03 · Listar / filtrar (`GET /waitlist`, ADMIN)

Paginado, filtros opcionales `status` y `requestedSpecialty`. Orden: `PENDIENTE` primero (más
antigua primero dentro de cada grupo), luego resueltas por fecha de resolución descendente — así
la cola de trabajo real queda arriba sin un parámetro de orden adicional que el frontend deba
construir.

### CU-04 · Asignar (`PATCH /waitlist/:id/assign`, ADMIN)

1. La entrada debe existir y estar `PENDIENTE` (si no, `404` o `409` respectivamente).
2. RUT final = `dto.rut ?? entry.childRut`; si ninguno está presente → `400`. Mismo criterio para
   `birthDate`.
3. `PatientsService.create(...)` con los datos de la entrada (`firstName`/`lastName` del niño,
   `phone`/`email` del apoderado, `diagnosis` = `entry.reason`). Puede lanzar `409` si el RUT ya
   pertenece a un paciente existente (§1.5) — se propaga tal cual, la entrada sigue `PENDIENTE`.
4. `TherapySlotsService.create(...)` con `patientId` recién creado + `professionalId`/`weekday`/
   `startTime`/`durationMinutes`/`validFrom` del DTO. Si falla, se compensa (§1.6) y se propaga el
   error.
5. Se actualiza la entrada: `status=ASIGNADA`, `assignedPatientId`, `assignedTherapySlotId`,
   `sede` (del DTO o la ya guardada en la entrada), `resolvedAt=now()`.
6. Auditoría `UPDATE` sobre `WaitlistEntry` (además de las auditorías `CREATE` que ya registran
   `PatientsService`/`TherapySlotsService` por su cuenta — no se duplican).

### CU-05 · Descartar (`PATCH /waitlist/:id/discard`, ADMIN)

Requiere `reason` (obligatorio, a diferencia de la cancelación de una cita que no lo exige — aquí
es el único registro de por qué esa familia no llegó a ser paciente). Solo válido desde
`PENDIENTE`. Marca `status=DESCARTADA`, `discardReason`, `resolvedAt=now()`.

### CU-06 · Editar entrada pendiente (`PATCH /waitlist/:id`, ADMIN)

Igual que CU-02 pero parcial (`UpdateWaitlistEntryRequest`) y solo permitido si `status=PENDIENTE`
(`409` en cualquier otro estado — no tiene sentido "corregir el teléfono" de una entrada ya
resuelta).

## 4. Reglas de validación (DTOs)

### 4.1 `IntakeWaitlistRequest` / `CreateWaitlistEntryRequest` (idénticos)

| Campo | Regla |
|---|---|
| `childFirstName`, `childLastName` | `string`, 1–100 |
| `childRut` | opcional; si viene, se normaliza (`normalizeRut`) y se valida con `IsChileanRut` — mismo decorador del Módulo 2 |
| `childBirthDate` | opcional, ISO `YYYY-MM-DD`, no futura (`IsNotFutureDate`, Módulo 2) |
| `guardianName` | `string`, 1–150 |
| `guardianPhone` | `string`, 6–20 (mismo criterio que `Patient.phone`) |
| `guardianEmail` | opcional, `IsEmail` |
| `requestedSpecialty` | opcional, enum `Specialty` |
| `reason` | opcional, `string`, máx. 1000 |

### 4.2 `UpdateWaitlistEntryRequest`

Mismos campos que 4.1, todos opcionales, más `sede` (`string`, máx. 100) — no se puede cambiar
`status` por esta vía (solo por `assign`/`discard`).

### 4.3 `AssignWaitlistEntryRequest`

| Campo | Regla |
|---|---|
| `professionalId` | `string` (uuid), debe ser un `User` `PROFESSIONAL` activo de la organización — reutiliza `AgendaValidationService.assertProfessionalValid` |
| `weekday` | enum `Weekday` |
| `startTime` | `"HH:MM"` (`IsTimeString`, Módulo 3) |
| `durationMinutes` | `int`, 1–240 |
| `validFrom` | ISO `YYYY-MM-DD` |
| `sede` | opcional, `string`, máx. 100 |
| `rut` | opcional (obligatorio en la práctica si la entrada no trae `childRut`; validado en el servicio, no en el DTO — depende de datos ya guardados) |
| `birthDate` | opcional, mismo motivo que `rut` |

### 4.4 `DiscardWaitlistEntryRequest`

`reason`: `string`, 1–500, obligatorio.

### 4.5 `WaitlistQuery`

`status?: WaitlistStatus`, `requestedSpecialty?: Specialty`, más `page`/`pageSize` (`PageQuery`).

## 5. Componentes UI (apps/web)

### 5.1 Página nueva `/dashboard/lista-espera` (ADMIN)

- Tabla: nombre del niño/a, apoderado + teléfono, especialidad solicitada, estado (badge), fecha
  de ingreso.
- Filtros: `status` (select, default "Pendiente"), `requestedSpecialty` (select).
- Acciones por fila (solo si `PENDIENTE`): "Asignar", "Descartar", "Editar".
- Botón "Nueva entrada" (CU-02, ingreso manual).

### 5.2 `AssignWaitlistEntryDialog`

Formulario: profesional (select, poblado desde `GET /users?role=PROFESSIONAL`), día de la semana,
hora de inicio, duración, vigencia desde, sede, y — condicionalmente, solo si la entrada no trae
`childRut`/`childBirthDate` — los campos de RUT/fecha de nacimiento. Mismo patrón de
`react-hook-form` + `zod` que `create-patient-dialog.tsx`/`create-therapy-slot-dialog.tsx`.

### 5.3 `DiscardWaitlistEntryDialog` / `CreateWaitlistEntryDialog` / `EditWaitlistEntryDialog`

Mismo patrón de diálogo que el resto del proyecto (`Dialog` + `Button` + toasts de éxito/error).

### 5.4 Página "Organización" (Módulo 1) — un campo nuevo

Campo "Token de ingreso (lista de espera)" (input de solo lectura + botón "Generar nuevo" que
rellena el campo con `crypto.randomUUID()` antes de guardar, igual criterio que §1.4) junto a los
campos de WhatsApp ya existentes.

## 6. Plan de pruebas

### 6.1 Unitarias (`apps/api`, sin DB — dobles en memoria)

- Crear entrada (intake y manual) → `PENDIENTE`.
- Asignar: crea `Patient` + `TherapySlot`, marca `ASIGNADA`, propaga `sede`.
- Asignar sin `rut` en la entrada ni en el DTO → `400`.
- Asignar con RUT de un paciente ya existente → `409`, entrada sigue `PENDIENTE`.
- Asignar con horario solapado → `409`, el paciente creado se compensa (se verifica que
  `patientRepository`/`prisma.patient.delete` fue invocado), entrada sigue `PENDIENTE`.
- Asignar una entrada no `PENDIENTE` → `409`.
- Descartar sin motivo → rechazado por DTO (`400`); descartar una entrada no `PENDIENTE` → `409`.
- Editar una entrada `ASIGNADA`/`DESCARTADA` → `409`.

### 6.2 E2E (`apps/api` + PostgreSQL de prueba)

- Webhook con token inválido/ausente → `401`; con token válido → `201` y la entrada existe.
- Flujo completo: intake → `GET /waitlist` la muestra `PENDIENTE` → `assign` → se puede
  `GET /patients/:id` y `GET /therapy-slots?patientId=...` y existen → `GET /waitlist` ya no
  cuenta esa entrada como pendiente.
- Aislamiento por organización: el token de la organización A no crea entradas en B; `GET
  /waitlist` de A nunca devuelve entradas de B.

### 6.3 Frontend (mínimo del módulo)

- La página carga, filtra por estado, y permite completar el diálogo de asignación sin errores de
  tipos (`tsc --noEmit`).

## 7. Definición de Hecho (DoD)

El módulo 7 se considera **terminado** cuando:

- [x] Migración Prisma aplicada para `waitlist_entries` y `organizations.waitlist_intake_token`.
- [x] Webhook `POST /webhooks/waitlist` público, autenticado por token de organización.
- [x] CRUD de administración completo: listar/filtrar, crear manual, editar (solo pendiente),
      asignar (crea `Patient`+`TherapySlot`), descartar — todos ADMIN.
- [x] Compensación implementada y probada si falla la creación del horario tras crear el paciente.
- [x] `PATCH /organizations/current` acepta `waitlistIntakeToken`; `OrganizationDto` lo expone.
- [x] Todas las reglas de negocio de §1 cubiertas por tests unitarios o e2e; suites en verde.
- [x] Frontend operativo: página "Lista de espera", diálogos de asignar/descartar/crear/editar,
      campo de token en "Organización", entrada en el sidebar.
- [x] `tsc --noEmit`, ESLint y Prettier sin errores en `apps/api`, `apps/web` y `packages/shared`.
- [x] Documentación actualizada: este archivo, `02-modelo-datos.md`, `04-api-rest.md` y
      `01-arquitectura.md` (tabla de estado del módulo).

Cumplido el DoD, se habilita el inicio del **Módulo 8 · Incidencias**.
