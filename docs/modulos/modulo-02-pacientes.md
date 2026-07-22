# Módulo 2 · Pacientes

> Documento de módulo según la metodología del proyecto. Coherente con [01-arquitectura.md](../01-arquitectura.md) (ADR-03, ADR-04, ADR-07, ADR-09, ADR-10), [02-modelo-datos.md](../02-modelo-datos.md) y los contratos de `@centro/shared`. Plantilla y nivel de detalle según [modulo-01-autenticacion.md](./modulo-01-autenticacion.md).
>
> **Alcance:** alta, edición, desactivación, búsqueda y consulta de pacientes por parte del ADMIN. Superficie REST bajo `/api/v1/patients` según [04-api-rest.md](../04-api-rest.md). **Fuera de alcance:** ficha clínica y evoluciones (`ClinicalRecord`/`Evolution`, Módulo 4), carpeta de Google Drive (`driveFolderId`, Módulo 5) y acceso de lectura del PROFESSIONAL (diferido al Módulo 3, ver §1.1).

## 1. Reglas de negocio del módulo (resumen normativo)

- `Patient` pertenece a una organización (`organizationId`, ADR-03); toda operación de repositorio recibe el tenant del JWT de forma explícita, nunca por parámetro del cliente.
- En este módulo **solo `ADMIN`** puede crear, editar, desactivar, listar y ver pacientes. `PROFESSIONAL` recibe `403` en todo `/patients` (ver decisión de diseño en §1.1).
- `rut` usa el formato canónico `XXXXXXXX-Y` (sin puntos, con guion, dígito verificador en mayúscula si es `K`), validado con el algoritmo módulo 11 chileno (`isValidRut`/`normalizeRut` de `@centro/shared`, ver §4.4).
- `rut` es **único por organización, no global**: dos organizaciones distintas pueden tener pacientes con el mismo RUT sin conflicto (dos centros son tenants independientes; deduplicar personas entre organizaciones violaría el aislamiento de tenant del ADR-03 y no es un requisito del negocio).
- La unicidad de `rut` se evalúa sobre **todos** los pacientes de la organización, activos e inactivos, porque la fila nunca se borra.
- `birthDate` es requerida y **no puede ser una fecha futura**.
- `phone` es requerido: es el WhatsApp del apoderado, canal de comunicación principal del Módulo 6 (confirmaciones y menú determinista).
- Los pacientes **nunca se borran físicamente**: `DELETE` = desactivación (`isActive=false`), igual que `User` (Módulo 1).
- `driveFolderId` existe en el esquema desde ahora (`NULL` por defecto) pero **ningún endpoint de este módulo lo puebla**; queda reservado para el Módulo 5 (Documentos), que creará la carpeta en Google Drive y lo asignará.
- La ficha clínica (`ClinicalRecord` / `evolutions`) es explícitamente el **Módulo 4**: `Patient` no tiene relación con `clinicalRecord` todavía. Cualquier lectura o escritura de historial clínico queda fuera de este módulo.
- Toda mutación (`CREATE`/`UPDATE`/`DELETE`) se audita en `audit_logs` con `entity='Patient'`, valor anterior/nuevo, reutilizando el mismo `AuditAction` de `@centro/shared` usado para `User` (ADR-10).

### 1.1 Decisión de diseño: el PROFESSIONAL no accede a `/patients` en este módulo

**Contexto.** La especificación original del negocio indica que "el profesional ve pacientes asignados". Sin embargo, la asignación paciente–profesional se define recién en el **Módulo 3 (Agenda)**, mediante `therapy_slots` con profesional fijo (ver [02-modelo-datos.md](../02-modelo-datos.md) §4). En el Módulo 2 esa relación todavía no existe en el modelo de datos.

**Decisión.** `GET /patients` (y el resto de `/patients`) responde **`403`** para `PROFESSIONAL` en este módulo. No se implementa ningún acceso de lectura "sin scope" (por ejemplo, ver todos los pacientes de la organización) como solución provisional.

**Justificación.** Dar acceso de "solo lectura sin scope" ahora sería **peor que no dar acceso**: implementaría una regla de visibilidad incompleta (el profesional vería pacientes que no atiende) que habría que deshacer o parchear en el Módulo 3, generando trabajo de migración de permisos y una ventana donde el profesional vería datos clínicos de pacientes ajenos. Es el mismo criterio protector y reversible usado en ADR-04 (confidencialidad psicológica): ante la duda, restringir primero y abrir el acceso correcto una sola vez.

**Evolución.** El Módulo 3 reemplazará el `403` por acceso de solo lectura a `GET /patients` y `GET /patients/:id`, filtrado por los `therapy_slots` asignados al profesional autenticado. Este documento y el DoD (§7) dejan registrada esta decisión para que el Módulo 3 la revise explícitamente antes de cerrarse.

## 2. Historias de usuario

Formato de criterios: **Dado / Cuando / Entonces**.

### 2.1 Como administrador

#### HU-01 · Registrar paciente
> Como administrador quiero registrar un paciente nuevo con sus datos y los de su apoderado para poder atenderlo y contactarlo.

- **Dado** un `CreatePatientRequest` con todos los campos requeridos válidos, **cuando** envía `POST /patients`, **entonces** recibe `201` con `PatientDto` (`isActive=true`, `driveFolderId=null`) y se audita `CREATE` de `Patient`.
- **Dado** un `rut` con dígito verificador inválido o con formato irreconocible, **cuando** intenta crear el paciente, **entonces** recibe `400`.
- **Dado** una `birthDate` posterior a la fecha actual, **cuando** intenta crear el paciente, **entonces** recibe `400`.
- **Dado** que falta `firstName`, `lastName`, `rut`, `birthDate` o `phone`, **cuando** intenta crear el paciente, **entonces** recibe `400`.
- **Dado** un `rut` que ya pertenece a otro paciente (activo o inactivo) de **su misma organización**, **cuando** intenta crear el paciente, **entonces** recibe `409`.
- **Dado** un `rut` que ya existe en **otra organización**, **cuando** crea el paciente en la suya, **entonces** recibe `201` sin conflicto (unicidad por organización, no global).

#### HU-02 · Editar paciente
> Como administrador quiero corregir o actualizar los datos de un paciente para mantener su información al día.

- **Dado** un paciente existente de su organización, **cuando** envía `PATCH /patients/:id` con campos válidos de `UpdatePatientRequest`, **entonces** recibe `200` con el `PatientDto` actualizado y se audita `UPDATE` con valor anterior/nuevo.
- **Dado** un cambio de `rut` a uno inválido o de `birthDate` a una fecha futura, **cuando** envía el PATCH, **entonces** recibe `400`.
- **Dado** un cambio de `rut` que coincide con el de otro paciente de la misma organización, **cuando** envía el PATCH, **entonces** recibe `409`.
- **Dado** un `id` inexistente en su organización, **cuando** envía el PATCH, **entonces** recibe `404`.

#### HU-03 · Buscar y filtrar pacientes
> Como administrador quiero buscar pacientes por nombre o RUT y filtrar por estado para encontrarlos rápidamente.

- **Dado** pacientes registrados en su organización, **cuando** consulta `GET /patients` con `search` (nombre o RUT), `isActive`, `page` y `pageSize`, **entonces** recibe `200` con `Paginated<PatientDto>` filtrado y paginado.
- **Dado** una organización con pacientes, **cuando** otro ADMIN de una organización distinta consulta `GET /patients`, **entonces** solo ve los pacientes de su propia organización (nunca los de la primera).

#### HU-04 · Ver el detalle de un paciente
- **Dado** un paciente existente en su organización, **cuando** consulta `GET /patients/:id`, **entonces** recibe `200` con `PatientDto`.
- **Dado** un `id` inexistente o de otra organización, **cuando** consulta `GET /patients/:id`, **entonces** recibe `404` (un tenant ajeno se comporta como inexistente).

#### HU-05 · Desactivar paciente
> Como administrador quiero desactivar un paciente que ya no asiste al centro, sin perder su historial.

- **Dado** un paciente activo de su organización, **cuando** envía `DELETE /patients/:id`, **entonces** recibe `204`, el paciente queda `isActive=false` (nunca se borra la fila) y se audita `DELETE`.
- **Dado** un paciente ya inactivo, **cuando** repite el `DELETE`, **entonces** recibe `204` igualmente (operación idempotente).
- **Dado** un `id` inexistente en su organización, **cuando** envía el `DELETE`, **entonces** recibe `404`.

### 2.2 Como profesional

#### HU-06 · Sin acceso a pacientes todavía
> Como profesional, hoy no puedo ver la lista de pacientes del centro.

- **Dado** un profesional autenticado, **cuando** invoca cualquier endpoint de `/patients` (`GET`, `POST`, `PATCH`, `DELETE`), **entonces** recibe `403` (ver decisión de diseño §1.1).
- **Dado** un profesional en el frontend, **cuando** navega el dashboard, **entonces** el sidebar no muestra "Pacientes"; el acceso directo por URL a `/dashboard/pacientes` muestra la pantalla de acceso denegado (mismo patrón que Usuarios/Auditoría en el Módulo 1).

## 3. Casos de uso

### CU-01 · Crear paciente

| | |
|---|---|
| **Actor** | ADMIN |
| **Endpoint** | `POST /api/v1/patients` |
| **Precondiciones** | Autenticado con rol ADMIN |

**Flujo principal**
1. El actor envía `CreatePatientRequest`.
2. El sistema valida el DTO (§4.1): campos requeridos, formato de RUT, `birthDate` no futura, longitudes máximas.
3. Normaliza el `rut` a formato canónico (`normalizeRut`) y verifica su unicidad dentro de la organización del actor, considerando pacientes activos e inactivos.
4. Crea el paciente en la organización del actor con `isActive=true` y `driveFolderId=null`.
5. Audita `CREATE` de `Patient` (valor nuevo).
6. Responde `201` con `PatientDto`.

**Flujos alternativos / excepciones**
- **A1 — RUT con dígito verificador inválido o formato irreconocible:** `400`.
- **A2 — `birthDate` futura:** `400`.
- **A3 — Campo requerido faltante o campo no permitido en el body:** `400` (`forbidNonWhitelisted`).
- **A4 — RUT ya registrado en la organización (paciente activo o inactivo):** `409`.

### CU-02 · Editar paciente

| | |
|---|---|
| **Actor** | ADMIN |
| **Endpoint** | `PATCH /api/v1/patients/:id` |
| **Precondiciones** | Autenticado ADMIN; el paciente objetivo pertenece a su organización |

**Flujo principal**
1. El actor envía `UpdatePatientRequest` (parcial).
2. El sistema carga el paciente por `id` + `organizationId` (aislamiento de tenant).
3. Valida el DTO sobre el **estado resultante**: formato de RUT si cambia, `birthDate` no futura si cambia, longitudes máximas.
4. Si el `rut` cambia, lo normaliza y verifica unicidad en la organización, excluyendo al propio paciente.
5. Persiste, audita `UPDATE` con valor anterior/nuevo y responde `200` con `PatientDto`.

**Flujos alternativos / excepciones**
- **A1 — Paciente inexistente en la organización:** `404`.
- **A2 — RUT inválido o `birthDate` futura:** `400`.
- **A3 — RUT modificado coincide con el de otro paciente de la misma organización:** `409`.

### CU-03 · Listar y buscar pacientes

| | |
|---|---|
| **Actor** | ADMIN |
| **Endpoint** | `GET /api/v1/patients` |
| **Precondiciones** | Autenticado con rol ADMIN |

**Flujo principal**
1. El actor envía `PatientsQuery` (`search?`, `isActive?`, `page`, `pageSize`).
2. El sistema filtra siempre por el `organizationId` del token; aplica `search` (nombre completo o RUT, con o sin formato) e `isActive` cuando se envían.
3. Pagina los resultados y responde `200` con `Paginated<PatientDto>`.

**Flujos alternativos / excepciones**
- **A1 — Query inválida (`page`/`pageSize` fuera de rango, `isActive` no booleano):** `400`.

Sin efectos secundarios (no se audita lectura).

### CU-04 · Ver detalle de un paciente

| | |
|---|---|
| **Actor** | ADMIN |
| **Endpoint** | `GET /api/v1/patients/:id` |
| **Precondiciones** | Autenticado con rol ADMIN |

**Flujo principal**
1. El actor solicita el recurso por `id`.
2. El sistema busca por `id` + `organizationId`.
3. Responde `200` con `PatientDto`.

**Flujos alternativos / excepciones**
- **A1 — Inexistente o de otra organización:** `404`.

### CU-05 · Desactivar paciente

| | |
|---|---|
| **Actor** | ADMIN |
| **Endpoint** | `DELETE /api/v1/patients/:id` |
| **Precondiciones** | Autenticado ADMIN; paciente objetivo en su organización |

**Flujo principal**
1. El actor invoca `DELETE` sobre el paciente.
2. El sistema lo busca por `id` + `organizationId`.
3. Marca `isActive=false` (**nunca** borra la fila).
4. Audita `DELETE` de `Patient` (estado anterior/nuevo).
5. Responde `204`.

**Flujos alternativos / excepciones**
- **A1 — Paciente inexistente en la organización:** `404`.
- **A2 — Paciente ya inactivo:** operación idempotente ⇒ `204`.

## 4. Reglas de validación (formularios / DTOs)

Validación en API con class-validator (`whitelist + forbidNonWhitelisted + transform`); el frontend replica las reglas en los formularios (zod/react-hook-form) para feedback inmediato. Errores en formato NestJS estándar `{statusCode, message, error}`.

### 4.1 `CreatePatientRequest`
| Campo | Reglas |
|---|---|
| `firstName` | requerido, 1–100 caracteres, trim |
| `lastName` | requerido, 1–100 caracteres, trim |
| `rut` | requerido; se normaliza (quita puntos/espacios) antes de validar; dígito verificador módulo 11 (§4.4); único **por organización** (activos e inactivos) ⇒ `409` |
| `birthDate` | requerido, fecha ISO 8601 (`YYYY-MM-DD`); no puede ser posterior a la fecha actual ⇒ `400` |
| `diagnosis` | opcional, hasta 500 caracteres |
| `phone` | requerido, 6–20 caracteres (WhatsApp del apoderado) |
| `email` | opcional, formato email válido |
| `address` | opcional, hasta 200 caracteres |
| `observations` | opcional, texto libre, hasta 1000 caracteres |
| (`isActive`, `driveFolderId`) | **no aceptados** en creación; campo desconocido ⇒ `400` (`forbidNonWhitelisted`). Se fijan por el sistema: `isActive=true`, `driveFolderId=null` |

### 4.2 `UpdatePatientRequest`
| Campo | Reglas |
|---|---|
| `firstName` / `lastName` | opcionales, 1–100 caracteres |
| `rut` | opcional; misma normalización y validación de dígito verificador que en creación; si cambia y coincide con otro paciente de la organización ⇒ `409` |
| `birthDate` | opcional; no puede quedar en una fecha futura ⇒ `400` |
| `diagnosis` | opcional, hasta 500 caracteres, o `null` |
| `phone` | opcional, 6–20 caracteres |
| `email` | opcional, formato válido, o `null` |
| `address` | opcional, hasta 200 caracteres, o `null` |
| `observations` | opcional, hasta 1000 caracteres, o `null` |
| `isActive` | opcional, boolean (permite reactivar un paciente sin pasar por `DELETE`) |
| (`driveFolderId`) | **no editable** por contrato en este módulo; campo desconocido ⇒ `400` |

### 4.3 `PatientsQuery`
| Campo | Reglas |
|---|---|
| `page` | entero ≥ 1, default 1 |
| `pageSize` | entero 1–100, default 20 |
| `isActive` | `'true'` / `'false'` (string por query param) |
| `search` | texto libre; busca en nombre completo (`firstName`/`lastName`) y en `rut` (con o sin formato) |

### 4.4 Formato y validación de RUT
- Formato canónico almacenado: `XXXXXXXX-Y` (7–8 dígitos, guion, dígito verificador `0-9` o `K` mayúscula).
- El cliente puede enviar el RUT con puntos y/o minúscula; el backend lo normaliza con `normalizeRut` antes de validar y persistir.
- Validación del dígito verificador con el algoritmo módulo 11 estándar (`isValidRut`), ya implementado en `packages/shared/src/rut.ts` y reutilizable por API y frontend (evita divergencia de reglas, mismo criterio que el resto de `@centro/shared`, ADR-09).

## 5. Componentes UI (apps/web)

Mismo patrón visual que la página de usuarios del Módulo 1 (Next.js App Router + Tailwind + shadcn/ui, llamadas al propio origen `/api/*`).

### 5.1 Página de pacientes (`/dashboard/pacientes`, solo ADMIN)
- Columnas: nombre completo, RUT, teléfono (WhatsApp del apoderado), diagnóstico (truncado), estado (badge activo/inactivo), acciones.
- Filtros: búsqueda con debounce (nombre/RUT), select de estado; paginación server-side (`Paginated<PatientDto>`).
- Acciones por fila: editar, desactivar/reactivar (confirmación previa).
- **Estados:** carga = skeleton rows; vacío = mensaje + CTA "Registrar paciente"; error = alert con reintento.
- El elemento "Pacientes" del sidebar solo aparece para ADMIN; un PROFESSIONAL que navega directo a la URL ve la pantalla de "Acceso denegado" (espejo del `403` de la API, HU-06).

### 5.2 Diálogo crear paciente
- Modal (shadcn `Dialog`) con react-hook-form + zod replicando §4.1.
- Campo RUT con formateo en vivo y validación de dígito verificador antes de enviar (misma lógica de `@centro/shared`).
- `birthDate` con selector de fecha que impide elegir fechas futuras.
- Errores del servidor mapeados al formulario: `409` ⇒ error en el campo RUT; `400` ⇒ errores por campo.

### 5.3 Diálogo editar paciente
- Mismo formulario que creación, precargado con el `PatientDto` actual; mismas validaciones (§4.2).
- El estado (`isActive`) no se edita desde este diálogo: se mantiene un único camino de cambio de estado (acción "desactivar/reactivar" en la tabla) para evitar dos flujos divergentes que produzcan el mismo efecto.

### 5.4 Confirmación de desactivar
- Diálogo de confirmación con nombre y RUT del paciente; aclara que no se elimina ningún dato: el registro y su futura ficha clínica (Módulo 4) se preservan.
- Éxito ⇒ toast de confirmación; error ⇒ mensaje inline sin cerrar el diálogo.

## 6. Plan de pruebas

### 6.1 Unitarias (apps/api, sin DB — dobles en memoria vía interfaces de repositorio, ADR-07)

**PatientsService**
- Crear con RUT válido pero con puntos/minúsculas se normaliza y persiste en formato canónico.
- Crear con RUT de dígito verificador inválido ⇒ `BadRequestException`.
- Crear con `birthDate` futura ⇒ `BadRequestException`.
- Crear con RUT ya usado por otro paciente (activo o inactivo) de la misma organización ⇒ `ConflictException`; el mismo RUT en otra organización ⇒ permitido, sin colisión.
- Editar cambiando el RUT a uno ya existente en la organización ⇒ `409`; conservar el RUT propio (sin cambio real) no debe fallar.
- Toda operación de repositorio recibe `organizationId` explícito (aislamiento de tenant); `id` de otra organización en `GET`/`PATCH`/`DELETE` ⇒ `404`.
- Desactivar marca `isActive=false` y nunca borra la fila; repetido ⇒ idempotente (`204`).
- `driveFolderId` permanece `null` tras crear y editar en todos los casos (no lo puebla ningún caso de uso de este módulo).
- Toda mutación (`CREATE`/`UPDATE`/`DELETE`) genera un registro vía `AuditService` con `entity='Patient'` y el diff correcto.

**Guards**
- `RolesGuard` sobre `/patients`: `PROFESSIONAL` ⇒ `403` en los cinco endpoints; `ADMIN` pasa.

**Validadores compartidos (`@centro/shared`)**
- `isValidRut`/`normalizeRut`: casos límite (con y sin puntos, dígito verificador `K`, largo de 7 y 8 dígitos, dígito verificador incorrecto).

### 6.2 E2E (apps/api + PostgreSQL de prueba, supertest)

1. **CRUD completo como ADMIN:** crear paciente (`201`) → aparece en `GET /patients` con filtros (`search`, `isActive`) → editar (`200`) → desactivar (`204`, fila viva con `is_active=false` en DB).
2. **RBAC:** sesión `PROFESSIONAL` contra cualquier endpoint de `/patients` (`GET`, `GET /:id`, `POST`, `PATCH`, `DELETE`) ⇒ `403`.
3. **Multi-tenant:** un paciente creado en la organización A no aparece ni es accesible (`404`) desde una sesión ADMIN de la organización B, incluso usando el mismo `id` o el mismo RUT.
4. **Duplicados:** crear dos pacientes con el mismo RUT en la misma organización ⇒ el segundo `409`; el mismo RUT en dos organizaciones distintas ⇒ ambos `201`.
5. **Validaciones:** RUT con dígito verificador incorrecto, `birthDate` futura y falta de `phone` ⇒ `400` en los tres casos.
6. **Auditoría:** cada creación/edición/desactivación deja en `audit_logs` un registro con `entity='Patient'` y el `old_value`/`new_value` esperados.

### 6.3 Frontend (mínimo del módulo)
- Unitarias del schema zod de paciente, en paridad con §4 (incluida la validación de RUT compartida con el backend vía `@centro/shared`).
- La navegación oculta "Pacientes" para sesión `PROFESSIONAL`; el acceso directo por URL muestra la pantalla de acceso denegado.

## 7. Definición de Hecho (DoD)

El módulo 2 se considera **terminado** cuando:

- [ ] La superficie REST completa (§3 en `04-api-rest.md`) está implementada y documentada en Swagger (`/api/docs`), incluyendo códigos de error.
- [ ] Migración Prisma aplicada para `patients`, incluyendo el índice único compuesto `(organization_id, rut)`.
- [ ] Todas las reglas de negocio de §1 tienen test que las cubre (unitario o e2e); suites unitaria y e2e en verde y ejecutables por CI.
- [ ] `RolesGuard` aplicado a los cinco endpoints de `/patients` (`@Roles(ADMIN)`); `PROFESSIONAL` recibe `403` en todos, sin excepción.
- [ ] Auditoría verificada: toda mutación de `Patient` genera `audit_logs` con `entity='Patient'` y el diff correcto.
- [ ] Frontend operativo: listado con filtros/paginación, crear, editar, desactivar/reactivar, con estados de carga/vacío/error, siguiendo el patrón visual de la página de usuarios del Módulo 1.
- [ ] Aislamiento multi-tenant verificado: el mismo RUT en dos organizaciones distintas no genera conflicto; un `id` de otra organización responde `404` en todos los endpoints.
- [ ] `tsc --noEmit`, ESLint y Prettier sin errores en `apps/api`, `apps/web` y `packages/shared`.
- [ ] Documentación del módulo (este archivo) consistente con el código entregado.
- [ ] La decisión de diseño §1.1 (PROFESSIONAL sin acceso a `/patients`) queda registrada explícitamente en el backlog del Módulo 3, que deberá reemplazarla por acceso de solo lectura filtrado por `therapy_slots`.

Cumplido el DoD, se habilita el inicio del **Módulo 3 · Agenda**.
