# Módulo 8 · Incidencias

> Documento de módulo según la metodología del proyecto. Coherente con [01-arquitectura.md](../01-arquitectura.md) (ADR-03, ADR-07, ADR-09, ADR-10, ADR-11) y [02-modelo-datos.md](../02-modelo-datos.md) §11 (`incidents`, movida de "diseño de referencia" a "implementada" en este módulo). Plantilla y nivel de detalle según [modulo-07-lista-espera.md](./modulo-07-lista-espera.md).

## 1. Reglas de negocio del módulo (resumen normativo)

- Debe existir un módulo para registrar **violencia, abuso, accidentes y situaciones graves**,
  con **prioridad alta** (instrucciones.txt). Toda incidencia creada dispara una notificación
  inmediata al administrador.
- Un incidente puede o no involucrar a un paciente específico (p. ej. un accidente en las
  instalaciones del centro que no es "de" ningún paciente en particular).
- Tanto `ADMIN` como `PROFESSIONAL` pueden **reportar** un incidente. Un `PROFESSIONAL` solo
  puede indicar un paciente que tenga asignado (mismo criterio que el Módulo 2 §1.2); `ADMIN`
  puede indicar cualquier paciente de su organización.
- El **reporte original** (tipo, descripción, paciente, fecha/hora en que ocurrió) es inmutable
  una vez creado — nadie lo edita después (ni siquiera ADMIN). Lo único que evoluciona es el
  **estado de seguimiento**, y eso es exclusivo de `ADMIN`.
- Estados: `ABIERTA → EN_REVISION → CERRADA`. `CERRADA` es terminal (§1.1).
- Visibilidad: `ADMIN` ve todas las incidencias de su organización; `PROFESSIONAL` ve únicamente
  las que **él mismo** reportó (§1.2) — no las de otros profesionales, aunque sean del mismo
  paciente.

### 1.1 Decisión de diseño: `CERRADA` es terminal, sin reapertura

Mismo criterio que la agenda (Módulo 3) y la lista de espera (Módulo 7): los estados terminales
no se reabren. Si una incidencia se cerró por error o aparece información nueva, se reporta un
incidente nuevo referenciando el contexto en su descripción, en vez de mutar el historial de uno
ya cerrado — preserva la trazabilidad de qué pasó realmente y cuándo.

### 1.2 Decisión de diseño: `PROFESSIONAL` ve solo lo que reportó, no lo de sus pacientes

El spec no aclara si un profesional debería ver incidencias de otros colegas sobre un paciente
compartido. Dado que las categorías del módulo (violencia, abuso, situaciones graves) son
sensibles por naturaleza, se aplica el criterio más conservador — análogo al que el Módulo 2
adoptó originalmente para `PROFESSIONAL` sobre `/patients` (`modulo-02-pacientes.md` §1.1): visibilidad
mínima por defecto, ampliable después si aparece un caso de uso concreto que lo requiera. `ADMIN`
sí ve todo, porque es quien gestiona el seguimiento.

### 1.3 Decisión de diseño: sin campo de notas de seguimiento propio

Una versión de este módulo consideró agregar `resolutionNotes`/`resolvedAt`. Se descarta: el
detalle de cada transición de estado (quién, cuándo, valor anterior/nuevo) ya queda en
`audit_logs` vía `AuditService` — agregar una columna redundante para "por qué se cerró"
duplicaría esa información sin un caso de uso que hoy la consuma (YAGNI, mismo criterio que
`modulo-07-lista-espera.md` §1.1 descartando `CONTACTADO`). Si en el futuro se necesita un campo
de texto libre visible en la UI (no solo en la auditoría), se agrega como cambio aditivo.

### 1.4 Decisión de diseño: notificación por el canal WhatsApp ya existente, no una integración nueva

"Notificar administrador" ya tiene un canal implementado y probado en el Módulo 6 (aviso de
cancelación a los administradores). Este módulo reutiliza exactamente esa pieza —
`WhatsAppMessagingService`, ahora exportado por `WhatsappModule` — en vez de introducir email
(Resend/ACS) u otro proveedor nuevo solo para este caso. Si la organización no tiene
`whatsappPhoneNumberId` configurado, o no hay administradores con teléfono, la notificación se
omite en silencio: **nunca** bloquea ni revierte la creación del incidente (mismo criterio de
resiliencia que el resto del Módulo 6 — R1 de `00-analisis.md`).

### 1.5 Decisión de diseño: sin campo de severidad

El spec dice "con prioridad alta" para **todo** el módulo, no como un valor que varíe por
incidente — no hay pie para un campo `severity` seleccionable sin inventar una escala no pedida.
Si el negocio necesita diferenciar gravedad dentro de una misma categoría, se resuelve en el
texto de `description`, no en un campo estructurado nuevo (YAGNI).

## 2. Historias de usuario

### 2.1 Como profesional o administrador

#### HU-01 · Reportar un incidente

Como `PROFESSIONAL` o `ADMIN` quiero registrar un incidente (violencia, abuso, accidente o
situación grave), indicando opcionalmente el paciente involucrado, para que quede documentado y
el administrador sea notificado de inmediato.

#### HU-02 · Ver mis incidencias reportadas

Como `PROFESSIONAL` quiero ver la lista de incidencias que yo reporté y su estado de seguimiento,
para saber si ya fueron revisadas.

### 2.2 Como administrador

#### HU-03 · Ver y filtrar todas las incidencias

Como `ADMIN` quiero ver todas las incidencias de mi organización, filtrar por estado y tipo, para
priorizar el seguimiento.

#### HU-04 · Actualizar el estado de seguimiento

Como `ADMIN` quiero mover una incidencia de `ABIERTA` a `EN_REVISION` y finalmente a `CERRADA`,
sin poder alterar el reporte original, para llevar un seguimiento auditable sin riesgo de
manipular la versión de los hechos reportada.

## 3. Casos de uso

### CU-01 · Reportar (`POST /incidents`, ADMIN o PROFESSIONAL)

1. Si `dto.patientId` viene: se verifica que exista en la organización (si no, `404`). Si el
   actor es `PROFESSIONAL`, además debe estar entre sus pacientes asignados
   (`AgendaAccessService.getAssignedPatientIds`, mismo criterio que Módulo 2 §1.2) — si no, `404`
   (mismo criterio de "fuera de alcance ⇒ inexistente" que el resto del sistema).
2. Se crea el `Incident` en `ABIERTA`, con `reportedById = actor.userId` (nunca lo envía el
   cliente).
3. Auditoría `CREATE` sobre `Incident`.
4. Se notifica a los administradores por WhatsApp (§1.4), best-effort.

### CU-02 · Listar / filtrar (`GET /incidents`, cualquier autenticado)

Paginado, filtros opcionales `status`, `type`, `patientId`. `ADMIN`: sin restricción adicional.
`PROFESSIONAL`: forzado a `reportedById = actor.userId` (§1.2), sin importar qué filtros envíe.

### CU-03 · Obtener por id (`GET /incidents/:id`, cualquier autenticado)

`ADMIN`: cualquier incidencia de su organización. `PROFESSIONAL`: solo si `reportedById` coincide
con el actor — si no, `404` (mismo criterio de ocultar existencia que el resto del sistema).

### CU-04 · Actualizar estado (`PATCH /incidents/:id`, solo ADMIN)

1. La incidencia debe existir en la organización (si no, `404`).
2. Debe estar en `ABIERTA` o `EN_REVISION` (si ya está `CERRADA`, `409` — terminal, §1.1).
3. Se actualiza únicamente `status` (nunca tipo/descripción/paciente/fecha).
4. Auditoría `UPDATE` con valor anterior/nuevo completo.

## 4. Reglas de validación (DTOs)

### 4.1 `CreateIncidentRequest`

| Campo | Regla |
|---|---|
| `patientId` | opcional, `uuid` |
| `type` | enum `IncidentType` {`VIOLENCIA`, `ABUSO`, `ACCIDENTE`, `SITUACION_GRAVE`} |
| `description` | `string`, 1–2000 |
| `occurredAt` | fecha y hora ISO 8601, no futura (`IsNotFutureDate`, mismo decorador del Módulo 2) |

### 4.2 `UpdateIncidentStatusRequest`

`status`: enum `IncidentStatus` {`ABIERTA`, `EN_REVISION`, `CERRADA`}. Sin ningún otro campo — el
reporte original no se puede modificar por esta vía (§1.3).

### 4.3 `IncidentsQuery`

`status?`, `type?`, `patientId?`, más `page`/`pageSize` (`PageQuery`).

## 5. Componentes UI (apps/web)

### 5.1 Página nueva `/dashboard/incidencias` (ADMIN y PROFESSIONAL)

- Visible para ambos roles en el sidebar (a diferencia de Lista de espera, que es solo ADMIN).
- Tabla: tipo, paciente (o "—"), descripción (truncada), fecha/hora ocurrida, estado (badge); para
  `ADMIN` además "reportado por" y acción "Actualizar estado".
- Filtros: `status`, `type` (selects).
- Botón "Reportar incidencia" (ambos roles).

### 5.2 `CreateIncidentDialog`

Formulario: tipo (select), paciente (select opcional, poblado desde `GET /patients` — ya filtrado
por profesional asignado del lado del backend, sin lógica adicional en el frontend), fecha y hora
(`datetime-local`), descripción (textarea). Mismo patrón `react-hook-form` + `zod` del resto del
proyecto.

### 5.3 `UpdateIncidentStatusDialog` (solo ADMIN)

Select con las transiciones válidas hacia adelante únicamente, derivadas del estado actual
(`ABIERTA` → `EN_REVISION`/`CERRADA`; `EN_REVISION` → `CERRADA`; `CERRADA` sin opciones, la acción
ni siquiera se ofrece en la tabla).

## 6. Plan de pruebas

### 6.1 Unitarias (`apps/api`, sin DB — dobles en memoria)

- Reportar sin paciente → `ABIERTA`, audita `CREATE`.
- `PROFESSIONAL` reporta sobre un paciente asignado → éxito; sobre uno no asignado → `404`.
- `ADMIN` reporta sobre cualquier paciente de la organización → éxito; paciente inexistente →
  `404`.
- Notifica a los administradores cuando la organización tiene WhatsApp configurado; no falla ni
  intenta notificar si no lo tiene.
- `ADMIN` ve todas (sin filtro de reportante); `PROFESSIONAL` ve solo las propias.
- `PROFESSIONAL` recibe `404` al pedir una incidencia que no reportó.
- `ADMIN` mueve `ABIERTA → EN_REVISION → CERRADA`; rechaza modificar una ya `CERRADA` (`409`);
  `404` sobre una inexistente.

### 6.2 E2E (`apps/api` + PostgreSQL de prueba)

- Reportar sin paciente notifica al administrador por WhatsApp (`ADMIN_INCIDENT_NOTICE` en
  `whatsapp_messages`).
- `PROFESSIONAL` reporta sobre un paciente asignado (vía `TherapySlot`) → éxito; sobre uno no
  asignado → `404`.
- `ADMIN` ve todas las incidencias de su organización; `PROFESSIONAL` solo las que reportó.
- Aislamiento multi-tenant: el administrador de una organización nunca ve incidencias de otra.
- `PROFESSIONAL` recibe `404` al pedir una incidencia que no reportó.
- `PATCH /incidents/:id` rechaza a un `PROFESSIONAL` con `403`; `ADMIN` mueve
  `ABIERTA → EN_REVISION → CERRADA`; `CERRADA` es terminal (`409` ante un nuevo intento).

### 6.3 Frontend (mínimo del módulo)

- La página carga, filtra por estado y tipo, y permite completar el diálogo de reporte y de
  cambio de estado sin errores de tipos (`tsc --noEmit`).

## 7. Definición de Hecho (DoD)

El módulo 8 se considera **terminado** cuando:

- [x] Migración Prisma aplicada para `incidents` (enums `incident_type`, `incident_status`).
- [x] `POST /incidents` (ADMIN o PROFESSIONAL, con restricción de paciente asignado para
      PROFESSIONAL); `GET /incidents` y `GET /incidents/:id` con el alcance de visibilidad de
      §1.2; `PATCH /incidents/:id` (ADMIN, transición de estado).
- [x] Notificación inmediata al administrador implementada reutilizando el canal WhatsApp del
      Módulo 6 (`WhatsAppMessagingService` exportado por `WhatsappModule`).
- [x] Todas las reglas de negocio de §1 cubiertas por tests unitarios y e2e; suites en verde.
- [x] Frontend operativo: página "Incidencias" (visible para ambos roles), diálogos de reportar y
      actualizar estado, entrada en el sidebar.
- [x] `tsc --noEmit`, ESLint y Prettier sin errores en `apps/api`, `apps/web` y `packages/shared`.
- [x] Documentación actualizada: este archivo, `02-modelo-datos.md`, `04-api-rest.md` y
      `01-arquitectura.md` (tabla de estado del módulo).

Cumplido el DoD, se habilita el inicio del **Módulo 9 · Reportes**.
