# Módulo 5 · Documentos (Google Drive)

> Documento de módulo según la metodología del proyecto. Coherente con [01-arquitectura.md](../01-arquitectura.md) (ADR-03, ADR-04, ADR-07, ADR-09, ADR-10, ADR-11) y [02-modelo-datos.md](../02-modelo-datos.md) §7 (borrador de `documents`, revisado en §1.1 de este documento). Plantilla y nivel de detalle según [modulo-04-fichas-clinicas.md](./modulo-04-fichas-clinicas.md).
>
> **Alcance:** subida y consulta de documentos clínicos/administrativos por paciente, con almacenamiento del binario en Google Drive (nunca en la base de datos ni en Azure — requisito de negocio explícito) organizados en una carpeta por paciente con subcarpetas por categoría, y confidencialidad diferenciada para informes psicológicos (ADR-04, mismo criterio que el Módulo 4). **Fuera de alcance:** vincular documentos a incidencias (Módulo 8), reportes de uso de almacenamiento (Módulo 9).

## 1. Reglas de negocio del módulo (resumen normativo)

- `Document` pertenece a una organización y a un paciente (`organizationId`/`patientId`, ADR-03); toda operación de repositorio recibe ambos de forma explícita.
- **Solo `PROFESSIONAL`** sube documentos (spec: *"Profesional puede: ... subir documentos"*; no está en la lista de `ADMIN`), y únicamente para pacientes dentro de su alcance de agenda — mismo criterio cerrado en el Módulo 3 §1.2 y reutilizado por el Módulo 4.
- El binario **nunca se almacena en la base de datos ni en Azure**: vive en el proveedor de almacenamiento detrás de `DocumentStoragePort` (ADR-11). La base de datos solo guarda `driveFileId` (identificador opaco del adaptador activo) y metadatos (`category`, `name`, `mimeType`, `sizeBytes`).
- Cada paciente tiene una carpeta propia con subcarpetas fijas por categoría (spec, árbol textual): `Informes`, `Evoluciones`, `Exámenes`, `Recetas`, `Otros`. La carpeta se crea de forma **perezosa** en la primera subida (no al crear el paciente, para no reabrir el Módulo 2 — ver §1.2) y su id queda en `Patient.driveFolderId`, campo ya reservado desde el Módulo 2 (`modulo-02-pacientes.md` §1: *"queda reservado para el Módulo 5, que creará la carpeta en Google Drive y lo asignará"*).
- `category` es uno de `INFORME | EVOLUCION | EXAMEN | RECETA | OTRO` (enum `DocumentCategory`, mapea 1:1 a las subcarpetas del árbol del spec).
- Un documento puede vincularse opcionalmente a una evolución (`evolutionId`, **no único**: una evolución puede tener varios documentos adjuntos — a diferencia de `Evolution.appointmentId`, que sí es 1:1 con la cita).
- `confidentiality` (`STANDARD | PSYCHOLOGICAL`) se deriva **automáticamente** de `uploadedBy.specialty` al subir (`PSICOLOGIA` ⇒ `PSYCHOLOGICAL`), nunca del request — mismo criterio y misma razón de seguridad que `Evolution.confidentiality` (Módulo 4 §1). Un documento `PSYCHOLOGICAL` (p. ej. un informe psicológico) es ilegible para cualquier actor sin `specialty=PSICOLOGIA`, **ADMIN incluido** (ADR-04).
- **Append-only**: no existe `DELETE` ni reemplazo de un documento ya subido — es un registro administrativo/clínico permanente, mismo criterio que `Evolution` y `Appointment`. Un documento subido por error se corrige subiendo uno nuevo (sin vínculo formal a la corrección, a diferencia de `Evolution.amendsId`: el spec no pide esa trazabilidad para documentos).
- El acceso de lectura (metadatos y descarga) sigue el mismo alcance que Evoluciones (Módulo 4 §1): `ADMIN` cualquier paciente de su organización; `PROFESSIONAL` solo pacientes con un `TherapySlot` activo asignado. Fuera de alcance ⇒ `404`.
- La descarga del binario **nunca expone una URL directa del proveedor** (p. ej. un link `drive.google.com`) al cliente: siempre se proxea a través de la API (`GET .../documents/:id/download`), para que el control de confidencialidad se aplique en cada acceso y no pueda evitarse compartiendo un enlace. Un documento `PSYCHOLOGICAL` fuera del alcance de confidencialidad del actor responde `403` en la descarga (no hay "contenido parcial" que redactar en un binario, a diferencia de los campos de texto de `Evolution`).
- Toda subida se audita en `audit_logs` con `entity='Document'` (ADR-10); el `newValue` auditado nunca incluye el binario (no aplica: solo se auditan metadatos) pero sí omite indicar contenido de un documento `PSYCHOLOGICAL` más allá de su existencia, igual que en evoluciones.
- Tipos y tamaño permitidos: `application/pdf`, `image/jpeg`, `image/png`, `image/webp`; máximo 15 MB por archivo (validación de aplicación, no del spec original — límite operativo razonable para informes/exámenes escaneados, configurable vía `DOCUMENTS_MAX_UPLOAD_BYTES`).

### 1.1 Decisión de diseño: `DocumentStoragePort` con dos adaptadores, seleccionable por configuración

**Contexto.** ADR-11 ya definía la forma: `DocumentStoragePort` en `domain`, adaptador concreto en `infrastructure`, justificado explícitamente porque *"permite dobles de prueba y desarrollo sin credenciales reales"*. Este entorno de desarrollo no tiene credenciales de una cuenta de servicio de Google Cloud.

**Decisión.** El puerto expone `ensurePatientFolder`, `uploadFile` y `downloadFile`. Existen dos adaptadores intercambiables por la variable de entorno `DOCUMENT_STORAGE_DRIVER`:
- `google-drive` (`GoogleDriveStorageAdapter`): implementación real contra la API REST de Google Drive v3, autenticada con una cuenta de servicio (JWT firmado RS256, intercambiado por un access token OAuth2) — sin la librería `googleapis` completa, usando `fetch` nativo y `jsonwebtoken` (ya presente como dependencia transitiva de `@nestjs/jwt`, evita sumar un SDK pesado para un puerto pequeño).
- `local-disk` (`LocalDiskStorageAdapter`, **default de desarrollo**): escribe en un directorio local (`storage/`, excluido de git) replicando la misma jerarquía paciente → categoría. Implementa exactamente el mismo contrato — id de carpeta = ruta absoluta, id de archivo = ruta absoluta del archivo — por lo que el resto del sistema (`DocumentsService`, tests) es idéntico sin importar el adaptador activo.

**Justificación.** Es la aplicación directa de ADR-11, no una desviación: el "doble de desarrollo" que el ADR anticipaba es ahora necesario porque este módulo se implementa sin credenciales reales disponibles en el entorno. Producción activa `google-drive` con las variables `GOOGLE_DRIVE_SERVICE_ACCOUNT_EMAIL`/`GOOGLE_DRIVE_PRIVATE_KEY`/`GOOGLE_DRIVE_ROOT_FOLDER_ID` (validadas de forma condicional en `env.validation.ts`: obligatorias únicamente si `DOCUMENT_STORAGE_DRIVER=google-drive`, ADR "secretos fail-fast"); local y e2e usan `local-disk` sin ningún cambio de código.

### 1.2 Decisión de diseño: la carpeta del paciente se crea de forma perezosa, no al registrar el paciente

**Contexto.** El Módulo 2 (ya cerrado) deja `Patient.driveFolderId` en `NULL` y ningún endpoint de `/patients` lo asigna.

**Decisión.** `DocumentsService` llama a `ensurePatientFolder` y persiste `driveFolderId` la primera vez que ese paciente recibe un documento — no antes. Si `Patient.driveFolderId` ya existe, se reutiliza directamente sin volver a llamar al puerto.

**Justificación.** Mismo criterio que evitó reabrir el contrato de `PATCH /appointments/:id/attendance` en el Módulo 4 (§1.2 de ese documento): tocar `PatientsService.create` para crear la carpeta en el mismo momento habría significado modificar un módulo ya cerrado y, además, acoplar la creación de un paciente a la disponibilidad del proveedor de almacenamiento (si Google Drive fallara, `POST /patients` fallaría por una razón ajena a registrar un paciente). Crearla perezosamente es además más eficiente: la mayoría de los pacientes pueden no requerir documentos nunca, y no vale la pena crear cinco carpetas en Drive por cada alta si no se van a usar.

## 2. Historias de usuario

### 2.1 Como profesional

#### HU-01 · Subir un documento
> Como profesional quiero subir el informe/examen/receta de un paciente para centralizar su historial documental.

- **Dado** un paciente dentro de mi alcance de agenda, **cuando** subo un archivo válido (PDF o imagen, ≤15 MB) con una categoría, **entonces** recibo `201` con los metadatos del documento y se audita `CREATE`.
- **Dado** que es la primera subida de ese paciente, **cuando** se completa, **entonces** `Patient.driveFolderId` queda asignado (antes estaba `NULL`).
- **Dado** un archivo de un tipo o tamaño no permitido, **cuando** intento subirlo, **entonces** recibo `400`.
- **Dado** un paciente fuera de mi alcance, **cuando** intento subir un documento, **entonces** recibo `404`.

#### HU-02 · Adjuntar un documento a una evolución
> Como profesional quiero vincular un examen a la evolución que lo motivó.

- **Dado** una evolución propia o de otro profesional dentro de mi alcance, **cuando** subo un documento con `evolutionId`, **entonces** el documento queda asociado; puedo repetir esto con varios documentos para la misma evolución.
- **Dado** un `evolutionId` de otro paciente, **cuando** intento subir el documento, **entonces** recibo `400`.

### 2.2 Como administrador o profesional (lectura)

#### HU-03 · Consultar los documentos de un paciente
> Como administrador o profesional quiero ver los documentos de un paciente para acceder a su información sin depender de WhatsApp o carpetas sueltas.

- **Dado** un paciente dentro de mi alcance (todos si soy `ADMIN`), **cuando** consulto `GET /patients/:patientId/documents`, **entonces** veo metadatos de todos los documentos `STANDARD` y, si soy `PROFESSIONAL` con `specialty=PSICOLOGIA`, también de los `PSYCHOLOGICAL`.
- **Dado** un documento `PSYCHOLOGICAL` y que no tengo `specialty=PSICOLOGIA` (incluido si soy `ADMIN`), **cuando** lo veo en el listado, **entonces** aparece con `redacted=true` y sin poder descargarlo.
- **Dado** un documento dentro de mi alcance de confidencialidad, **cuando** solicito `GET .../documents/:id/download`, **entonces** recibo el binario con el `mimeType` original.
- **Dado** un documento `PSYCHOLOGICAL` fuera de mi alcance de confidencialidad, **cuando** solicito la descarga, **entonces** recibo `403`.

## 3. Casos de uso

### CU-01 · Subir un documento

| | |
|---|---|
| **Actor** | PROFESSIONAL |
| **Endpoint** | `POST /api/v1/patients/:patientId/documents` (`multipart/form-data`: campo `file` + `category` + `evolutionId?`) |

**Flujo principal**
1. Verifica que el paciente exista y esté en el alcance de agenda del actor (§1) — `404` en caso contrario.
2. Valida el archivo: `mimeType` permitido, tamaño ≤ `DOCUMENTS_MAX_UPLOAD_BYTES` — `400` en caso contrario.
3. Si viene `evolutionId`: verifica que exista para el mismo paciente/organización — `400` si no.
4. Si `Patient.driveFolderId` es `NULL`, llama a `DocumentStoragePort.ensurePatientFolder` y persiste el id devuelto.
5. Llama a `DocumentStoragePort.uploadFile` con la subcarpeta de la `category` (resuelta u obtenida dentro del propio adaptador — no se persiste un id por subcategoría, solo el de la carpeta raíz del paciente).
6. Calcula `confidentiality` desde `actor.specialty` (igual que Módulo 4 §1) y crea el registro `Document`.
7. Audita `CREATE` sobre `Document`.
8. Responde `201` con `DocumentDto` (`redacted=false`: el autor siempre puede ver lo que subió).

**Excepciones:** `404` paciente fuera de alcance o inexistente · `400` archivo inválido (tipo/tamaño), `evolutionId` de otro paciente · `403` (`ADMIN`).

### CU-02 · Listar documentos de un paciente

| | |
|---|---|
| **Actor** | ADMIN (todos) / PROFESSIONAL (alcance de agenda) |
| **Endpoint** | `GET /api/v1/patients/:patientId/documents` |

Mismo criterio de alcance y redacción que Evoluciones (Módulo 4, CU-02): `PSYCHOLOGICAL` sin acceso ⇒ metadatos con `redacted=true`. Sin efectos secundarios.

### CU-03 · Descargar un documento

| | |
|---|---|
| **Actor** | ADMIN / PROFESSIONAL (mismo alcance que CU-02) |
| **Endpoint** | `GET /api/v1/patients/:patientId/documents/:id/download` |

**Flujo principal**
1. Mismo chequeo de alcance que CU-02.
2. Carga el documento; si es `PSYCHOLOGICAL` y el actor no puede leer contenido psicológico, responde `403` (no hay versión parcial de un binario).
3. Llama a `DocumentStoragePort.downloadFile(driveFileId)` y transmite el binario con el `mimeType`/`name` guardados en la base de datos (nunca se re-consulta el `mimeType` al proveedor: es responsabilidad de la base de datos, no del almacenamiento).

**Excepciones:** `404` documento/paciente inexistente o fuera de alcance · `403` confidencialidad psicológica sin acceso.

## 4. Reglas de validación (formularios / DTOs)

### 4.1 `CreateDocumentDto` (multipart)

| Campo | Regla |
|---|---|
| `file` | requerido; `mimeType` ∈ {`application/pdf`, `image/jpeg`, `image/png`, `image/webp`}; tamaño ≤ `DOCUMENTS_MAX_UPLOAD_BYTES` (default 15 MB) |
| `category` | enum `DocumentCategory`, requerido |
| `evolutionId` | UUID, opcional |

### 4.2 `DocumentsQuery`

`page`, `pageSize` (`PageQuery`, igual que el resto de listados).

## 5. Componentes UI (apps/web)

### 5.1 Sección "Documentos" en la página de detalle de paciente (Módulo 4)

- Lista de documentos (tabla o tarjetas): nombre, categoría, fecha, quién lo subió; una tarjeta `PSYCHOLOGICAL` sin acceso se muestra con candado, igual que una evolución redactada, sin botón de descarga.
- Botón "Descargar" para documentos dentro del alcance de confidencialidad — dispara `GET .../download` y el navegador guarda el archivo (respuesta con `Content-Disposition: attachment`).
- Botón **"Subir documento"** visible solo para `PROFESSIONAL` (oculto para `ADMIN`, mismo criterio que "Nueva evolución").

### 5.2 Diálogo "Subir documento"

- Campos: selector de archivo (input `type=file`, `accept` limitado a los tipos permitidos), categoría (select con las 5 opciones del spec), y opcionalmente "vincular a una evolución" (select de las evoluciones ya visibles del paciente en la misma página).
- No expone ningún campo de confidencialidad (se deriva en el backend, igual que evoluciones).

## 6. Plan de pruebas

### 6.1 Unitarias (apps/api, sin DB — dobles en memoria; `DocumentStoragePort` con un doble simple, no el adaptador de disco real)

**DocumentsService**
- Subir un documento válido ⇒ `201`; `confidentiality` derivada correctamente para `specialty=PSICOLOGIA` vs. cualquier otra.
- Primera subida de un paciente sin `driveFolderId` ⇒ llama a `ensurePatientFolder` y persiste el resultado; segunda subida del mismo paciente ⇒ no vuelve a llamarlo.
- Paciente fuera del alcance de agenda ⇒ `NotFoundException`; `ADMIN` no tiene esa restricción.
- Archivo con `mimeType` no permitido o que excede el tamaño máximo ⇒ `BadRequestException`.
- `evolutionId` de otro paciente ⇒ `BadRequestException`.
- Listado: documento `PSYCHOLOGICAL` con `redacted=true` para actor sin `specialty=PSICOLOGIA` (incluido `ADMIN`); `redacted=false` para `PSICOLOGIA` y para el propio autor.
- Descarga: documento `PSYCHOLOGICAL` sin acceso ⇒ `ForbiddenException`, sin llamar a `downloadFile` del puerto.
- Todo método de repositorio recibe `organizationId` explícito; documento de otra organización ⇒ inexistente.

### 6.2 E2E (apps/api + PostgreSQL de prueba; `DOCUMENT_STORAGE_DRIVER=local-disk`)

1. **Ciclo completo:** profesional con paciente asignado sube un PDF ⇒ `201`, `Patient.driveFolderId` pasa de `NULL` a un valor; el archivo existe en `storage/` en la ruta esperada; aparece en el listado de ese profesional y de `ADMIN`.
2. **Confidencialidad psicológica:** psicólogo sube un informe ⇒ `confidentiality=PSYCHOLOGICAL`; `ADMIN` y un profesional no-psicólogo lo ven redactado en el listado y reciben `403` al descargarlo; otro psicólogo (mismo paciente asignado) lo descarga completo.
3. **RBAC:** `ADMIN` recibe `403` al intentar subir.
4. **Validación de archivo:** tipo no permitido ⇒ `400`; archivo que excede el tamaño máximo ⇒ `400`.
5. **Vínculo con evolución:** subir un documento con `evolutionId` de una evolución del mismo paciente ⇒ `201` con el vínculo; con el de otro paciente ⇒ `400`.
6. **Multi-tenant:** documento de la organización A no visible ni descargable desde la organización B.
7. **Alcance por profesional:** profesional sin `TherapySlot` activo con el paciente ⇒ `404` al listar y al subir.
8. **Auditoría:** cada subida deja un registro `CREATE` en `audit_logs` con `entity=Document`.

### 6.3 Frontend (mínimo del módulo)

- La tarjeta de un documento redactado nunca muestra un enlace de descarga, aunque el backend devolviera `redacted=false` por error (defensa en profundidad, mismo criterio que evoluciones).

## 7. Definición de Hecho (DoD)

El módulo 5 se considera **terminado** cuando:

- [x] Superficie REST completa (`POST`/`GET /patients/:patientId/documents`, `GET .../documents/:id/download`) implementada y documentada en Swagger, incluyendo códigos de error.
- [x] Migración Prisma aplicada para `documents` (enum `DocumentCategory`; renombre de `EvolutionConfidentiality` a `ClinicalConfidentiality`, reutilizado por `Evolution` y `Document`).
- [x] `DocumentStoragePort` implementado con `GoogleDriveStorageAdapter` (real, REST + JWT de cuenta de servicio) y `LocalDiskStorageAdapter` (doble de desarrollo/test), seleccionables por `DOCUMENT_STORAGE_DRIVER`.
- [x] Todas las reglas de negocio de §1 (carpeta perezosa, confidencialidad derivada, append-only, descarga proxeada sin exponer URLs del proveedor) cubiertas por tests unitarios o e2e; suites en verde.
- [x] `RolesGuard` aplicado: subida exclusiva de `PROFESSIONAL`; lectura accesible a ambos roles con el alcance de §1.
- [x] Auditoría verificada para `Document`.
- [x] Ningún documento `PSYCHOLOGICAL` es descargable por un actor sin `specialty=PSICOLOGIA` — verificado explícitamente en e2e.
- [x] Frontend operativo: subida y descarga desde la página de detalle de paciente, con redacción correcta para actores sin acceso psicológico.
- [x] Aislamiento multi-tenant y de alcance por profesional verificado en e2e.
- [x] `tsc --noEmit`, ESLint y Prettier sin errores en `apps/api`, `apps/web` y `packages/shared`.
- [x] Documentación actualizada: este archivo, `02-modelo-datos.md` (`documents` implementada, renombre del enum de confidencialidad), `04-api-rest.md` (sección Documentos reemplaza el borrador) y `01-arquitectura.md` (tabla de estado del módulo).

Cumplido el DoD, se habilita el inicio del **Módulo 6 · WhatsApp**.
