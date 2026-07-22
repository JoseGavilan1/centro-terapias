# Módulo 4 · Fichas clínicas

> Documento de módulo según la metodología del proyecto. Coherente con [01-arquitectura.md](../01-arquitectura.md) (ADR-03, ADR-04, ADR-07, ADR-09, ADR-10) y [02-modelo-datos.md](../02-modelo-datos.md) §6 (borrador de `clinical_records`/`evolutions`, revisado en §1.1 de este documento). Plantilla y nivel de detalle según [modulo-02-pacientes.md](./modulo-02-pacientes.md) y [modulo-03-agenda.md](./modulo-03-agenda.md).
>
> **Alcance:** registro append-only de evoluciones clínicas por paciente (`Evolution`), con confidencialidad diferenciada para contenido psicológico (ADR-04) y vínculo opcional con la atención (`Appointment`) que las origina. **Fuera de alcance:** adjuntar archivos a una evolución (`Document`, Módulo 5 — aquí el campo queda documentado pero sin endpoint), informes psicológicos como entidad separada (se tratan como evoluciones con `confidentiality=PSYCHOLOGICAL`; un tipo de documento formal queda para el Módulo 5), reportes agregados (Módulo 9).

## 1. Reglas de negocio del módulo (resumen normativo)

- `Evolution` pertenece a una organización (`organizationId`, ADR-03) y a un paciente (`patientId`); toda operación de repositorio recibe ambos de forma explícita.
- **Append-only real**: no existe `UPDATE` ni `DELETE` en el repositorio ni en la API para `Evolution` — ni siquiera para el propio autor. Una corrección es **una evolución nueva** con `amendsId` apuntando a la que corrige (mismo criterio que el histórico de `Appointment`, ver `modulo-03-agenda.md` §1.1).
- **Solo `PROFESSIONAL`** crea evoluciones, y únicamente para pacientes dentro de su alcance de agenda (mismo criterio de `PatientsService` cerrado en el Módulo 3 §1.2: al menos un `TherapySlot` **activo** con ese paciente). `ADMIN` **no crea** evoluciones (rol administrativo, no clínico — spec: *"Profesional puede: crear evoluciones clínicas"*, no está en la lista de `ADMIN`).
- `confidentiality` (`STANDARD` | `PSYCHOLOGICAL`) **nunca es un campo que el cliente envíe**: se deriva automáticamente de `actor.specialty` en el momento de crear (`PSICOLOGIA` ⇒ `PSYCHOLOGICAL`; cualquier otra especialidad ⇒ `STANDARD`) y queda fijo (snapshot), igual que el horario de un `Appointment` generado desde un `TherapySlot`. Aceptar este valor por request sería una vulnerabilidad directa de confidencialidad (un profesional podría marcar contenido sensible como público, o viceversa).
- **Política de acceso a contenido `PSYCHOLOGICAL`** (ADR-04, aplicada aquí por primera vez): únicamente usuarios `PROFESSIONAL` con `specialty=PSICOLOGIA` leen `observation`/`workPlan`/`amendsId` de una evolución `PSYCHOLOGICAL`. Todo el resto de actores (`ADMIN` incluido) reciben la evolución con esos campos en `null` y un flag `redacted=true` — ven que existe, la fecha y el autor, nunca el contenido. **Ni siquiera `ADMIN` lee contenido psicológico** (ADR-04, textual).
- Las evoluciones `STANDARD` son visibles para **cualquier** actor con acceso al paciente: `ADMIN` (todos los pacientes) y `PROFESSIONAL` (pacientes dentro de su alcance de agenda, sin importar qué profesional las escribió — es una ficha única e interdisciplinaria, no un cuaderno privado por especialidad).
- El alcance de "¿puede este actor ver la ficha de este paciente?" es el mismo que cierra `PatientsService` en el Módulo 3: `ADMIN` siempre; `PROFESSIONAL` solo si tiene un `TherapySlot` activo con ese paciente. Fuera de alcance ⇒ `404` (mismo criterio de aislamiento que el resto del sistema), **antes** de aplicar el filtro de confidencialidad.
- `date` no puede ser una fecha futura (mismo validador `IsNotFutureDate` usado en `Patient.birthDate`).
- Toda creación de `Evolution` se audita en `audit_logs` con `entity='Evolution'` (ADR-10). Por ser append-only, la auditoría solo registra `CREATE` (nunca `UPDATE`/`DELETE`) — y, por la misma razón de confidencialidad de la regla anterior, el `newValue` auditado de una evolución `PSYCHOLOGICAL` **tampoco** incluye `observation`/`workPlan` (la auditoría no debe ser una puerta trasera a contenido que la API no expone).
- `archivos` (spec original) queda **fuera de alcance**: el campo `Evolution.hasAttachments` no existe todavía; se agrega en el Módulo 5 cuando `Document` pueda referenciar una evolución (`documents.evolution_id`, ya previsto en `02-modelo-datos.md` §6).

### 1.1 Decisión de diseño: no existe una tabla `clinical_records` separada

**Contexto.** El borrador de `02-modelo-datos.md` (§2, §6) preveía `ClinicalRecord` como entidad 1–1 con `Patient`, contenedora de `Evolution`. Al diseñar el módulo en detalle, `ClinicalRecord` no agrega ningún campo propio — es un contenedor vacío cuyo único propósito sería expresar "cada paciente tiene una ficha única".

**Decisión.** Se elimina `ClinicalRecord` del modelo. `Evolution.patientId` referencia directamente a `Patient`. La "ficha clínica" no es una fila en la base de datos: es una **vista lógica** (`GET /patients/:patientId/evolutions`) sobre los datos ya existentes de `Patient` + `Evolution`.

**Justificación.** `Patient` ya es la identidad natural de la ficha (existe exactamente una fila `Patient` por paciente, por construcción — es la misma garantía que se buscaba con `ClinicalRecord` 1–1, sin necesidad de una segunda tabla que replicarla). Agregar una tabla sin columnas propias solo para satisfacer un diagrama ER no reduce riesgo ni agrega capacidad: aumenta las migraciones, los joins y las oportunidades de que una fila de `ClinicalRecord` quede huérfana o inconsistente con su `Patient`. Es el mismo criterio de simplicidad que motivó ADR-04 a *no* crear un rol "Psicólogo" separado. Si en el futuro la ficha necesita metadatos propios (p. ej. un estado "en tratamiento / cerrada", o una fecha de apertura distinta a la de creación del paciente), agregar `clinical_records` en ese momento es un cambio aditivo — no hay retrabajo por partir sin ella ahora.

**Actualiza:** `02-modelo-datos.md` §2 (diagrama ER) y §6 pasan a reflejar esta decisión en la sección "Módulo 4 — entidades implementadas" (ver §5 de ese documento tras cerrar este módulo).

### 1.2 Decisión de diseño: el vínculo con `Appointment` es opcional, no obligatorio

**Contexto.** La especificación original dice *"cada atención genera automáticamente una evolución clínica"*. El Módulo 3 (`modulo-03-agenda.md` §1.1) marcó explícitamente esto como fuera de su alcance y lo diferió aquí.

**Decisión.** `Evolution.appointmentId` es **opcional**. Cuando se envía, debe referenciar un `Appointment` de la misma organización y paciente, en estado `ATENDIDA`, cuyo `professionalId` sea el actor autenticado — y ese `Appointment` no puede tener ya otra evolución asociada (`@@unique` en `appointmentId`). El flujo recomendado en el frontend es encadenar "Marcar asistencia (Atendida)" → "Registrar evolución de esta atención", pero la API no lo fuerza a nivel de escritura: se puede registrar una evolución sin cita (evaluación inicial, backfill de historia previa, seguimiento fuera de agenda).

**Justificación.** No se modifica el contrato de `PATCH /appointments/:id/attendance` del Módulo 3, ya cerrado y con e2e en verde — reabrirlo para forzar la creación simultánea de una evolución habría significado romper un contrato público de un módulo ya terminado, exactamente lo que la metodología del proyecto pide evitar ("no avanzar al siguiente módulo sin terminar completamente el anterior" implica también no *reabrir* uno terminado sin una razón de negocio, y aquí no la hay: la cita puede quedar `ATENDIDA` y la evolución escribirse minutos después, o por otro canal). Forzar el vínculo a nivel de escritura tampoco cubriría los casos legítimos sin cita (evaluación inicial de un paciente que aún no tiene `TherapySlot`). El requisito de negocio *"cada atención genera una evolución"* se satisface como guía de UX (§5) y se puede verificar operativamente con un reporte de "atenciones sin evolución" en el Módulo 9, sin necesitar una restricción dura en el Módulo 4.

## 2. Historias de usuario

### 2.1 Como profesional

#### HU-01 · Registrar una evolución clínica
> Como profesional quiero dejar constancia de la atención de un paciente para mantener su historial clínico.

- **Dado** un paciente dentro de mi alcance de agenda (§1), **cuando** envío `POST /patients/:patientId/evolutions` con fecha, observación y plan de trabajo válidos, **entonces** recibo `201` con la evolución creada, `confidentiality` derivado de mi especialidad, y se audita `CREATE`.
- **Dado** un paciente fuera de mi alcance de agenda, **cuando** intento crear una evolución, **entonces** recibo `404` (mismo criterio que el aislamiento de tenant — no se revela si el paciente existe).
- **Dado** una fecha futura, **cuando** intento crear la evolución, **entonces** recibo `400`.
- **Dado** que soy `ADMIN`, **cuando** intento crear una evolución, **entonces** recibo `403`.

#### HU-02 · Vincular una evolución a la atención que la origina
> Como profesional quiero asociar la evolución a la cita que acabo de atender para no perder la trazabilidad de qué atención la generó.

- **Dado** una cita propia en estado `ATENDIDA` sin evolución asociada, **cuando** creo una evolución con `appointmentId` de esa cita, **entonces** la evolución queda vinculada y `GET /appointments` (Módulo 3) puede cruzarse con ella por `id`.
- **Dado** una cita que ya tiene una evolución asociada, **cuando** intento crear otra con el mismo `appointmentId`, **entonces** recibo `409`.
- **Dado** una cita de otro profesional o que no está en estado `ATENDIDA`, **cuando** intento vincularla, **entonces** recibo `400`.

#### HU-03 · Corregir una evolución sin sobrescribirla
> Como profesional quiero corregir una observación errónea sin borrar el registro original, para preservar el historial completo.

- **Dado** una evolución propia o de otro profesional dentro de mi alcance, **cuando** creo una nueva evolución con `amendsId` apuntando a esa evolución, **entonces** ambas coexisten en el historial y la nueva queda marcada como corrección.
- **Dado** un `amendsId` de una evolución de otro paciente o de otra organización, **cuando** intento crearla, **entonces** recibo `400`.

#### HU-04 · Ver el historial clínico de un paciente asignado
> Como profesional quiero ver la evolución de mis pacientes para dar continuidad al tratamiento, incluso si la escribió otro profesional.

- **Dado** un paciente dentro de mi alcance, **cuando** consulto `GET /patients/:patientId/evolutions`, **entonces** veo todas las evoluciones `STANDARD` completas y, si mi especialidad es `PSICOLOGIA`, también las `PSYCHOLOGICAL` completas.
- **Dado** que mi especialidad **no** es `PSICOLOGIA`, **cuando** la lista incluye evoluciones `PSYCHOLOGICAL`, **entonces** las recibo con `observation`/`workPlan`/`amendsId` en `null` y `redacted=true` (veo que existen, fecha y autor, no el contenido).

### 2.2 Como administrador

#### HU-05 · Ver el historial clínico de cualquier paciente (con confidencialidad)
> Como administrador quiero revisar el historial clínico de cualquier paciente para fines de gestión, sin acceder a contenido psicológico.

- **Dado** cualquier paciente de mi organización, **cuando** consulto `GET /patients/:patientId/evolutions`, **entonces** veo todas las evoluciones `STANDARD` completas y las `PSYCHOLOGICAL` redactadas (§1), sin excepción — no existe ningún flag ni permiso que me dé acceso al contenido psicológico.
- **Dado** que intento `POST /patients/:patientId/evolutions`, **entonces** recibo `403`.

## 3. Casos de uso

### CU-01 · Crear evolución

| | |
|---|---|
| **Actor** | PROFESSIONAL |
| **Endpoint** | `POST /api/v1/patients/:patientId/evolutions` |

**Flujo principal**
1. Verifica que el paciente exista y esté dentro del alcance de agenda del actor (§1) — reutiliza el mismo criterio que cierra el Módulo 3 §1.2 (`AgendaAccessService.getAssignedPatientIds`); fuera de alcance ⇒ `404`.
2. Valida el DTO: `date` (ISO, no futura), `observation`, `workPlan` (texto requerido), `appointmentId?`, `amendsId?`.
3. Si viene `appointmentId`: carga el `Appointment` (misma organización y paciente); debe estar `ATENDIDA`, `professionalId = actor`, y sin evolución previa asociada — de lo contrario `400`/`404`/`409` según corresponda (ver HU-02).
4. Si viene `amendsId`: verifica que la evolución referenciada exista para el mismo paciente y organización — de lo contrario `400`.
5. Calcula `confidentiality` desde `actor.specialty` (`PSICOLOGIA` ⇒ `PSYCHOLOGICAL`, si no `STANDARD`). El cliente no puede enviar este campo (DTO no lo declara).
6. Crea la evolución y audita `CREATE` sobre `Evolution` (si `confidentiality=PSYCHOLOGICAL`, el `newValue` auditado omite `observation`/`workPlan`, igual que la respuesta HTTP a un actor sin acceso).
7. Responde `201` con `EvolutionDto` (sin redactar: el propio autor siempre ve lo que escribió).

**Excepciones:** `404` paciente fuera de alcance o inexistente en la organización · `400` validación de campos, fecha futura, `appointmentId`/`amendsId` inválidos · `409` `appointmentId` ya vinculado a otra evolución.

### CU-02 · Listar historial clínico de un paciente

| | |
|---|---|
| **Actor** | ADMIN (todos los pacientes) / PROFESSIONAL (pacientes en su alcance) |
| **Endpoint** | `GET /api/v1/patients/:patientId/evolutions` |

**Flujo principal**
1. Verifica que el paciente exista en la organización; si el actor es `PROFESSIONAL`, además que esté en su alcance de agenda — de lo contrario `404` (mismo criterio que `PatientsService`).
2. Pagina el historial (`date` descendente, más reciente primero; `createdAt` descendente como segundo criterio para evoluciones del mismo día).
3. Por cada evolución `PSYCHOLOGICAL`: si `actor.specialty !== PSICOLOGIA`, reemplaza `observation`/`workPlan`/`amendsId` por `null` y marca `redacted=true`; en caso contrario entrega el contenido completo (`redacted=false`).
4. Responde `200` con `Paginated<EvolutionDto>`. Sin efectos secundarios (no se audita lectura).

**Excepciones:** `404` paciente inexistente o fuera de alcance del profesional.

### CU-03 · Obtener una evolución puntual

| | |
|---|---|
| **Actor** | ADMIN / PROFESSIONAL (mismo alcance que CU-02) |
| **Endpoint** | `GET /api/v1/patients/:patientId/evolutions/:id` |

Mismo criterio de alcance y redacción que CU-02, aplicado a un solo registro. `404` si la evolución no existe para ese paciente/organización o si el paciente está fuera del alcance del profesional.

## 4. Reglas de validación (formularios / DTOs)

### 4.1 `CreateEvolutionRequest`

| Campo | Regla |
|---|---|
| `date` | fecha ISO (`YYYY-MM-DD`), requerida, no futura (`IsNotFutureDate`, reutilizado de `patients`) |
| `observation` | string, requerido, 1–5000 caracteres |
| `workPlan` | string, requerido, 1–2000 caracteres |
| `appointmentId` | UUID, opcional |
| `amendsId` | UUID, opcional |

No declara `confidentiality`: `ValidationPipe` con `forbidNonWhitelisted` (ya configurado globalmente, ver `test-app.ts`) rechaza con `400` cualquier request que intente enviarlo.

### 4.2 `EvolutionsQuery`

`page`, `pageSize` (`PageQuery`, igual que el resto de listados).

## 5. Componentes UI (apps/web)

### 5.1 Página de detalle de paciente (`/dashboard/pacientes/:id`) — nueva

- Encabezado con datos del paciente (reutiliza el patrón visual de la tabla de Pacientes).
- Timeline de evoluciones (más reciente primero): fecha, autor, contenido; una evolución `PSYCHOLOGICAL` redactada se muestra como una tarjeta con candado — "Contenido psicológico confidencial" — sin observación ni plan de trabajo, sea quien sea el actor (incluido `ADMIN`).
- Una evolución con `amendsId` muestra una referencia visual a la evolución que corrige ("Corrige la evolución del [fecha]").
- Botón **"Nueva evolución"** visible solo para `PROFESSIONAL` (oculto para `ADMIN`, igual que los botones de mutación de Pacientes se ocultan para `PROFESSIONAL` en el Módulo 3). Si el paciente está fuera de su alcance, la página completa muestra el mismo mensaje de "no encontrado" que ya usa Pacientes (no se filtra solo el botón: toda la página respeta el `404`).
- La fila de la tabla de Pacientes (Módulo 2/3) se vuelve clickeable y navega a este detalle, para ambos roles.

### 5.2 Diálogo "Nueva evolución"

- Campos: fecha (default hoy, máximo hoy), observación (textarea), plan de trabajo (textarea).
- Si se abre desde una cita `ATENDIDA` sin evolución (acción "Registrar evolución" en la fila de la tabla de Citas del Módulo 3, visible solo cuando corresponde), precarga `appointmentId` y la fecha de la cita; si se abre desde la página de detalle del paciente, sin `appointmentId`.
- No expone ningún campo de confidencialidad (se deriva en el backend).

### 5.3 Ajuste a la tabla de Citas (Módulo 3)

- Fila con `status=ATENDIDA` y sin evolución conocida: acción adicional "Registrar evolución" que abre el diálogo de §5.2 precargado. Requiere que el frontend sepa si una cita ya tiene evolución — `AppointmentDto` no lo expone (Módulo 3 ya cerrado); se resuelve consultando `GET /patients/:patientId/evolutions` filtrado en el cliente por `appointmentId`, sin tocar el contrato de `/appointments`.

## 6. Plan de pruebas

### 6.1 Unitarias (apps/api, sin DB — dobles en memoria)

**EvolutionsService**
- Crear evolución válida ⇒ `201`/objeto creado; `confidentiality` derivado correctamente para `specialty=PSICOLOGIA` vs. cualquier otra.
- Paciente fuera del alcance de agenda del profesional ⇒ `NotFoundException`; `ADMIN` no tiene esa restricción.
- `ADMIN` intentando crear ⇒ rechazado por `RolesGuard` (probado en e2e; a nivel de servicio no aplica si el guard ya lo bloquea).
- `date` futura ⇒ `BadRequestException`.
- `appointmentId` de una cita no `ATENDIDA`, de otro profesional, o ya vinculada a otra evolución ⇒ `400`/`409` según corresponda.
- `amendsId` de otro paciente/organización ⇒ `BadRequestException`.
- Listado: evolución `PSYCHOLOGICAL` redactada para actor sin `specialty=PSICOLOGIA` (incluido `ADMIN`); completa para `PSICOLOGIA` y para el propio autor.
- Auditoría: `newValue` de una evolución `PSYCHOLOGICAL` no incluye `observation`/`workPlan`.
- Todo método de repositorio recibe `organizationId` explícito; evolución de otra organización ⇒ inexistente.

### 6.2 E2E (apps/api + PostgreSQL de prueba)

1. **Ciclo completo:** profesional con paciente asignado (vía `TherapySlot`, Módulo 3) crea una evolución `STANDARD` → aparece completa en su propio listado y en el de `ADMIN` → aparece redactada para un profesional de otra especialidad sin ese paciente asignado (`404`, no llega a evaluarse la redacción).
2. **Confidencialidad psicológica:** profesional `PSICOLOGIA` crea una evolución para un paciente asignado ⇒ `confidentiality=PSYCHOLOGICAL`; `ADMIN` y un profesional no-psicólogo con el mismo paciente asignado la ven redactada; otro profesional `PSICOLOGIA` (distinto, mismo paciente asignado) la ve completa.
3. **RBAC:** `ADMIN` recibe `403` en `POST .../evolutions`.
4. **Vínculo con cita:** marcar una cita `ATENDIDA` (Módulo 3) → crear evolución con ese `appointmentId` ⇒ `201`; repetir con el mismo `appointmentId` ⇒ `409`; usar el `appointmentId` de una cita `PENDIENTE` ⇒ `400`; usar el de otro profesional ⇒ `400`.
5. **Multi-tenant:** evoluciones de la organización A no visibles ni referenciables (`amendsId`/`appointmentId`) desde una sesión de la organización B.
6. **Alcance por profesional:** profesional sin `TherapySlot` activo con el paciente ⇒ `404` en `GET`/`POST .../evolutions`, aunque el paciente exista en su organización.
7. **Auditoría:** cada `POST` exitoso deja un registro `CREATE` en `audit_logs` con `entity=Evolution`; el registro de una evolución `PSYCHOLOGICAL` no contiene `observation`/`workPlan` en `newValue`.

### 6.3 Frontend (mínimo del módulo)

- Unitarias del schema zod del diálogo "Nueva evolución", en paridad con §4.1.
- La tarjeta de una evolución redactada nunca renderiza `observation`/`workPlan` aunque el backend los devolviera (defensa en profundidad en el cliente, no solo confiar en el backend).

## 7. Definición de Hecho (DoD)

El módulo 4 se considera **terminado** cuando:

- [x] Superficie REST completa (`POST`/`GET /patients/:patientId/evolutions`, `GET /patients/:patientId/evolutions/:id`) implementada y documentada en Swagger, incluyendo códigos de error.
- [x] Migración Prisma aplicada para `evolutions` (enum `EvolutionConfidentiality`), sin la entidad `clinical_records` (§1.1), con los índices que soportan el listado paginado y la unicidad de `appointmentId`.
- [x] Todas las reglas de negocio de §1 (append-only, derivación automática de `confidentiality`, redacción para no-psicólogos) cubiertas por tests unitarios o e2e; suites en verde.
- [x] `RolesGuard` aplicado: `POST` exclusivo de `PROFESSIONAL`; `GET` accesible a ambos roles con el alcance de §1.
- [x] Auditoría verificada para `Evolution`, incluyendo la omisión de contenido psicológico en `audit_logs`.
- [x] Ninguna ruta de la API (ni la auditoría) expone `observation`/`workPlan` de una evolución `PSYCHOLOGICAL` a un actor sin `specialty=PSICOLOGIA` — verificado explícitamente en e2e, no solo por inspección.
- [x] Frontend operativo: página de detalle de paciente con historial y creación de evolución para `PROFESSIONAL`; visualización redactada correcta para `ADMIN`.
- [x] Aislamiento multi-tenant y de alcance por profesional verificado en e2e.
- [x] `tsc --noEmit`, ESLint y Prettier sin errores en `apps/api`, `apps/web` y `packages/shared`.
- [x] Documentación actualizada: este archivo, `02-modelo-datos.md` (entidad `evolutions` movida de "futuro" a "implementada", diagrama ER sin `ClinicalRecord`), `04-api-rest.md` (sección Fichas clínicas reemplaza el borrador) y `01-arquitectura.md` (tabla de estado del módulo).

Cumplido el DoD, se habilita el inicio del **Módulo 5 · Documentos (Google Drive)**.
