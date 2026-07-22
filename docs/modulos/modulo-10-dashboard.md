# Módulo 10 · Dashboard

> Documento de módulo según la metodología del proyecto. Coherente con [01-arquitectura.md](../01-arquitectura.md) y [04-api-rest.md](../04-api-rest.md) (sin superficie propia — ver §1.1). Plantilla y nivel de detalle según [modulo-09-reportes.md](./modulo-09-reportes.md). Cierra el alcance original de módulos (1–10, `00-analisis.md` §4.1).

## 1. Reglas de negocio del módulo (resumen normativo)

- El spec solo nombra "Dashboard" (instrucciones.txt) sin requisitos adicionales: es la página de
  inicio (`/dashboard`) que ya existía desde el Módulo 1 con un saludo y los datos de la cuenta —
  este módulo la completa con la información operacional relevante para cada rol, sin volverla
  una pantalla nueva.
- Visible para **ambos roles** (a diferencia de Reportes, que es solo ADMIN): cada uno ve lo que
  le sirve, no una versión reducida de la vista del otro.
  - **ADMIN**: el mismo resumen de `/reports/summary` (pacientes activos, terapeutas activos,
    lista de espera pendiente) + agenda del día completa de la organización.
  - **PROFESSIONAL**: cantidad de pacientes asignados + su propia agenda del día.
- "Agenda de hoy" es una vista de solo lectura: no ofrece confirmar/cancelar/marcar asistencia
  (eso ya existe en `/dashboard/agenda`, Módulo 3) — un enlace lleva a la vista completa para
  actuar.

### 1.1 Decisión de diseño: sin superficie de API propia

Confirmado en el diseño (no solo previsto en el borrador de `04-api-rest.md`): las cuatro piezas
de información que necesita este módulo ya existen y ya están correctamente aisladas por rol —

| Dato | Endpoint reutilizado | Módulo de origen |
|---|---|---|
| Resumen (ADMIN) | `GET /reports/summary` | 9 |
| Pacientes asignados (PROFESSIONAL) / nombres para la agenda | `GET /patients` (ya scopeado por rol) | 2/3 |
| Agenda de hoy (ambos roles) | `GET /appointments?dateFrom=hoy&dateTo=hoy` (ya scopeado por rol) | 3 |
| Nombres de profesionales (para la vista ADMIN) | `GET /users?role=PROFESSIONAL` | 1 |

No se crea ningún endpoint, DTO, módulo NestJS, tabla ni migración nueva — el Módulo 10 es
enteramente composición de frontend sobre superficie ya construida y ya probada en sus propios
módulos. Coherente con la nota de `04-api-rest.md` §11 (ya retirada de "superficie futura" al
cerrar este módulo): "Reutiliza `/reports/*`, sin superficie propia salvo necesidad detectada en
diseño" — al diseñarlo, no se detectó ninguna.

### 1.2 Decisión de diseño: `StatCard` reutilizado, no un dashboard de gráficos

Mismo criterio que el Módulo 9 (§1.4 de `modulo-09-reportes.md`): el proyecto no tiene ni
introduce una librería de gráficos. El resumen del Módulo 10 reutiliza literalmente el componente
`StatCard` creado para Reportes — no una versión nueva ni un widget de gráfico.

## 2. Historias de usuario

### 2.1 Como administrador

#### HU-01 · Ver el estado operacional al entrar

Como `ADMIN` quiero ver, apenas entro a la plataforma, cuántos pacientes/terapeutas activos y
lista de espera tengo, y qué citas hay agendadas hoy en todo el centro, sin tener que navegar a
Reportes o Agenda primero.

### 2.2 Como profesional

#### HU-02 · Ver mi día al entrar

Como `PROFESSIONAL` quiero ver, apenas entro, cuántos pacientes tengo asignados y cuáles son mis
citas de hoy, sin tener que ir a "Agenda" primero.

## 3. Casos de uso

No hay casos de uso de backend nuevos (§1.1). El "caso de uso" del módulo es enteramente de
composición de frontend: la página `/dashboard` llama a los hooks ya existentes
(`useReportsSummary`, `usePatients`, `useAppointments`, `useUsers`) con los mismos parámetros que
ya usan Reportes y Agenda, y renderiza según `currentUser.role`.

## 4. Reglas de validación (DTOs)

No aplica — sin DTOs nuevos (§1.1).

## 5. Componentes UI (apps/web)

### 5.1 Página `/dashboard` (ya existente desde el Módulo 1, completada aquí)

- **ADMIN**: sección "Resumen" (tres `StatCard`, igual que Reportes) + enlace "Ver reportes
  completos"; sección "Agenda de hoy" con paciente, hora, profesional y estado de cada cita de la
  organización.
- **PROFESSIONAL**: `StatCard` "Mis pacientes asignados"; misma sección "Agenda de hoy", sin la
  columna de profesional (es siempre él mismo).
- Ambos: enlace "Ver agenda completa" hacia `/dashboard/agenda`; tarjeta "Tu cuenta" (sin cambios
  respecto al Módulo 1).

## 6. Plan de pruebas

### 6.1 Unitarias (`apps/api`)

No aplica — sin código de backend nuevo (§1.1).

### 6.2 E2E (`apps/api` + PostgreSQL de prueba)

No aplica — la superficie que consume (`/reports/summary`, `/patients`, `/appointments`,
`/users`) ya tiene su propia cobertura e2e en los módulos 1, 2, 3 y 9 respectivamente.

### 6.3 Frontend (verificación manual en navegador)

Verificado con Playwright headless contra los servidores de desarrollo reales (API + web +
PostgreSQL de dev): login como `ADMIN` y como un `PROFESSIONAL` de prueba, captura de
`/dashboard` en ambos casos, con y sin una cita agendada para hoy. Confirmado: cada rol ve
únicamente su sección correspondiente (sin `Resumen` para `PROFESSIONAL`, sin columna de
profesional en su agenda), la fila de "Agenda de hoy" muestra correctamente paciente/hora/estado,
y no hay errores de consola atribuibles a este módulo (los `403` de fondo en la vista
`PROFESSIONAL` son las mismas llamadas ya aceptadas como no-bloqueantes en otras páginas — p. ej.
`pacientes/[id]/page.tsx` con `useUsers` — que fallan en silencio para un rol sin acceso a
`/reports` o `/users`, sin afectar el render).

## 7. Definición de Hecho (DoD)

El módulo 10 se considera **terminado** cuando:

- [x] Página `/dashboard` completa para ambos roles según §5.1, sin superficie de API nueva
      (§1.1 verificado en diseño).
- [x] Frontend operativo: verificado manualmente en navegador (login real, ambos roles, con y sin
      datos) — ver §6.3.
- [x] `tsc --noEmit`, ESLint y Prettier sin errores en `apps/web` (sin cambios en `apps/api` ni
      `packages/shared`).
- [x] Documentación actualizada: este archivo y `01-arquitectura.md` (tabla de estado del
      módulo). `02-modelo-datos.md` y `04-api-rest.md` no requieren cambios de superficie (§1.1);
      se retira la fila del Módulo 10 de la sección "Superficie futura" de `04-api-rest.md`, que
      queda sin pendientes.

Cumplido el DoD, se completan los diez módulos del alcance original (`00-analisis.md` §4.1).
