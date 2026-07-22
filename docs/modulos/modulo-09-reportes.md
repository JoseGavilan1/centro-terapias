# Módulo 9 · Reportes

> Documento de módulo según la metodología del proyecto. Coherente con [01-arquitectura.md](../01-arquitectura.md) (ADR-03, ADR-07, ADR-09) y [02-modelo-datos.md](../02-modelo-datos.md) (sin entidades nuevas — ver §1.1). Plantilla y nivel de detalle según [modulo-08-incidencias.md](./modulo-08-incidencias.md).

## 1. Reglas de negocio del módulo (resumen normativo)

- El spec pide "Cantidad de: Pacientes, Atenciones, Inasistencias, Cancelaciones, Terapeutas,
  Lista espera" y "Rendimiento mensual" (instrucciones.txt). Es agregación de solo lectura sobre
  datos que ya existen en el sistema desde los Módulos 2/3/7 — ningún dato nuevo que persistir.
- Solo `ADMIN` accede a reportes ("ver estadísticas" es una capacidad exclusiva del administrador,
  instrucciones.txt). `PROFESSIONAL` no tiene ninguna vista de este módulo.
- Tres superficies:
  1. **Resumen** — estado actual (no acotado a un período): pacientes activos, terapeutas activos,
     lista de espera pendiente.
  2. **Atenciones** — atenciones, inasistencias y cancelaciones dentro de un rango de fechas
     explícito (por defecto, el mes en curso).
  3. **Rendimiento mensual** — serie de los últimos N meses (por defecto 6) con las mismas
     métricas de atención más pacientes nuevos y nuevos ingresos a la lista de espera, para ver
     tendencia sin tener que pedir un rango a la vez.

### 1.1 Decisión de diseño: sin domain/infrastructure propios

A diferencia de todos los módulos anteriores, este no tiene una entidad de negocio propia que
persistir — es agregación de lectura pura sobre `Patient`, `Appointment`, `User` y
`WaitlistEntry`. Crear una interfaz de repositorio y una implementación Prisma para envolver
`count()`/`groupBy()` sin ningún caso de uso de escritura sería una capa vacía sin propósito
(YAGNI). Se sigue el mismo criterio ya establecido para lecturas cruzadas en
`WhatsAppConversationService` (Módulo 6) e `IncidentsService` (Módulo 8): `ReportsService` inyecta
`PrismaService` directamente en su única capa (`application/`), sin `domain/` ni
`infrastructure/`. `presentation/` sí existe (controller + DTOs de query), como cualquier otro
módulo.

### 1.2 Decisión de diseño: sin tabla ni migración nueva

Ninguna de las tres superficies requiere una columna que no exista ya. `02-modelo-datos.md` no
se modifica más que para señalar que este módulo no agrega entidades — no hay `## Módulo 9 —
entidades implementadas` porque no hay ninguna.

### 1.3 Decisión de diseño: `Rendimiento mensual` reemplaza al rango libre, no lo excluye

"Atenciones" (`/reports/attendance`) ya permite cualquier rango custom (`from`/`to`). "Rendimiento
mensual" (`/reports/monthly`) no es un caso particular de eso resuelto con un loop en el
frontend: es su propio endpoint porque agrega, además de las métricas de atención, pacientes
nuevos y nuevos ingresos a la lista de espera por mes calendario — información que
`/reports/attendance` no expone. Mantenerlos separados evita que el frontend tenga que llamar N
veces a `/reports/attendance` (uno por mes) para construir la serie.

### 1.4 Decisión de diseño: sin gráficos, tabla y tarjetas de estado

El frontend no incorpora una librería de gráficos nueva: todo el resto de la aplicación presenta
listados como tabla (pacientes, usuarios, lista de espera, incidencias, auditoría, mensajes de
WhatsApp) y números únicos como tarjetas de estado (nunca un gráfico) — introducir la primera
dependencia de charting del proyecto para una sola vista de reportes sería inconsistente con ese
lenguaje visual ya establecido. "Rendimiento mensual" se presenta como tabla (mismo componente
`Table` de siempre); los conteos de "Resumen" y "Atenciones" como tarjetas de número único
(`StatCard`), reutilizable también por el Módulo 10 (Dashboard).

## 2. Historias de usuario

### 2.1 Como administrador

#### HU-01 · Ver el resumen operacional

Como `ADMIN` quiero ver de un vistazo cuántos pacientes activos, terapeutas activos y personas en
lista de espera tengo, sin tener que contarlos manualmente.

#### HU-02 · Ver atenciones de un período

Como `ADMIN` quiero ver cuántas atenciones, inasistencias y cancelaciones hubo en un rango de
fechas que yo elija, para evaluar el funcionamiento del centro en ese período.

#### HU-03 · Ver el rendimiento mensual

Como `ADMIN` quiero ver la evolución mes a mes de atenciones, inasistencias, cancelaciones,
pacientes nuevos e ingresos a la lista de espera, para detectar tendencias sin pedir un reporte
por cada mes.

## 3. Casos de uso

### CU-01 · Resumen (`GET /reports/summary`, ADMIN)

Cuenta, en paralelo: `patients` activos de la organización, `users` `PROFESSIONAL` activos, y
`waitlist_entries` en estado `PENDIENTE`. Sin parámetros.

### CU-02 · Atenciones (`GET /reports/attendance`, ADMIN)

1. Resuelve el rango: `from`/`to` explícitos (ISO `YYYY-MM-DD`), o por defecto el mes en curso
   completo hasta hoy (inclusive).
2. `appointment.groupBy(['status'])` filtrado por `organization_id` y `date` dentro del rango
   (límite superior exclusivo internamente, para no depender de "fin de día").
3. Devuelve el total y el conteo de cada uno de los seis valores de `AppointmentStatus`
   (`PENDIENTE`, `CONFIRMADA`, `CANCELADA`, `NO_ASISTIO`, `SOBRECUPO`, `ATENDIDA`) — un estado sin
   citas en el rango se reporta como `0`, nunca se omite.

### CU-03 · Rendimiento mensual (`GET /reports/monthly`, ADMIN)

1. Resuelve los últimos `months` meses calendario (por defecto 6, máximo 24), incluyendo el
   actual, del más antiguo al más reciente.
2. Por cada mes, en paralelo: el mismo `groupBy` de CU-02 acotado a ese mes, más
   `patient.count`/`waitlist_entry.count` por `created_at` dentro del mes.
3. Devuelve un arreglo con una entrada por mes (`{ month: "YYYY-MM", totalAppointments, attended,
   noShow, cancelled, newPatients, newWaitlistEntries }`).

## 4. Reglas de validación (DTOs)

### 4.1 `AttendanceReportQuery`

| Campo | Regla |
|---|---|
| `from` | opcional, `IsDateString` |
| `to` | opcional, `IsDateString`, inclusive |

### 4.2 `MonthlyReportQuery`

| Campo | Regla |
|---|---|
| `months` | opcional, entero 1–24 (`MAX_MONTHLY_REPORT_MONTHS`), default 6 |

## 5. Componentes UI (apps/web)

### 5.1 Página nueva `/dashboard/reportes` (solo ADMIN)

- **Resumen**: tres `StatCard` (pacientes activos, terapeutas activos, lista de espera
  pendiente).
- **Atenciones**: filtros `from`/`to` (inputs de fecha) + `StatCard` por cada campo de
  `AttendanceReportDto`.
- **Rendimiento mensual**: selector de 3/6/12 meses + tabla con una fila por mes.

### 5.2 `StatCard` (`components/reports/stat-card.tsx`)

Tarjeta de número único (label + valor), sin gráfico — reutilizable por el Módulo 10 (Dashboard).

## 6. Plan de pruebas

### 6.1 Unitarias (`apps/api`, sin DB)

- `report-range.util`: rango de atención por defecto (mes actual hasta hoy) y explícito; límites
  de meses correctos incluyendo cruce de año.
- `ReportsService.getSummary`: mapea los tres conteos.
- `ReportsService.getAttendance`: suma el total y mapea cada estado a su campo; respeta el rango
  explícito.
- `ReportsService.getMonthly`: una entrada por mes solicitado; usa el default (6) si no se
  especifica; respeta el máximo (24) aunque se pida más.

### 6.2 E2E (`apps/api` + PostgreSQL de prueba)

- `RolesGuard`: `PROFESSIONAL` recibe `403` en los tres endpoints.
- `GET /reports/summary`: conteos correctos y aislados por organización.
- `GET /reports/attendance`: conteos correctos para un rango con citas; un rango sin citas
  devuelve todo en cero (no un error).
- `GET /reports/monthly`: devuelve la cantidad de meses solicitada.

### 6.3 Frontend (mínimo del módulo)

- La página carga las tres secciones, permite cambiar el rango de atenciones y la cantidad de
  meses, sin errores de tipos (`tsc --noEmit`).

## 7. Definición de Hecho (DoD)

El módulo 9 se considera **terminado** cuando:

- [x] `GET /reports/summary`, `GET /reports/attendance` y `GET /reports/monthly` implementados,
      todos `@Roles(ADMIN)`.
- [x] Sin migración Prisma nueva (§1.2) — verificado que ninguna de las tres superficies necesita
      una columna que no exista ya.
- [x] Todas las reglas de negocio de §1 cubiertas por tests unitarios y e2e; suites en verde.
- [x] Frontend operativo: página "Reportes" con las tres secciones, entrada en el sidebar (solo
      ADMIN).
- [x] `tsc --noEmit`, ESLint y Prettier sin errores en `apps/api`, `apps/web` y `packages/shared`.
- [x] Documentación actualizada: este archivo, `04-api-rest.md` y `01-arquitectura.md` (tabla de
      estado del módulo). `02-modelo-datos.md` no requiere cambios de entidades (§1.2).

Cumplido el DoD, se habilita el inicio del **Módulo 10 · Dashboard**.
