# 00 · Análisis del problema

> Documento canónico. Fuente de verdad de negocio: requisitos del cliente (`instrucciones.txt`).
> Complementa: [01-arquitectura.md](./01-arquitectura.md) · [02-modelo-datos.md](./02-modelo-datos.md)

## 1. Contexto del negocio y situación actual

Centro de terapias infantiles que atiende cinco especialidades: **fonoaudiología, psicología, terapia ocupacional, kinesiología y psicopedagogía**. Su operación administrativa y clínica se sostiene hoy sobre cuatro herramientas desconectadas entre sí:

| Herramienta actual | Uso hoy | Destino con la plataforma |
|---|---|---|
| WhatsApp | Comunicación manual con apoderados: recordatorios, confirmaciones, cancelaciones | **Se automatiza** vía WhatsApp Business API con menú de respuestas predefinidas (sin IA) |
| Google Calendar | Agenda de sesiones | **Se reemplaza** por el módulo de agenda (horarios fijos por paciente) |
| Google Drive | Almacenamiento de informes, exámenes y documentos clínicos | **Se mantiene** como almacenamiento documental (decisión del negocio); la plataforma lo orquesta vía API y la DB solo guarda `drive_folder_id` / `drive_file_id` |
| Google Forms | Ingreso de pacientes nuevos | **Se mantiene** como canal de entrada a la lista de espera; la plataforma consume sus respuestas para gestionar la admisión |

La plataforma **reemplaza la mayor parte de ese flujo** y centraliza pacientes, agenda, fichas clínicas, asistencia, incidencias y reportes. Google Forms y Google Drive permanecen por decisión explícita del negocio: son integraciones, no piezas a sustituir.

El sistema nace para un centro pero se diseña **multi-tenant desde la primera migración** (`organization_id` en toda tabla de negocio, ADR-03), previendo la expansión a múltiples centros sin reescritura.

## 2. Actores

| Actor | Acceso a la plataforma | Capacidades |
|---|---|---|
| **Administrador** (`ADMIN`) | Sí | Administra pacientes, agenda, terapeutas, usuarios y lista de espera; ve estadísticas; configura el sistema. No puede desactivarse a sí mismo ni cambiar su propio rol. |
| **Profesional** (`PROFESSIONAL` + `specialty`) | Sí | Ve su agenda y sus pacientes asignados, crea evoluciones clínicas, sube documentos, marca asistencia. **No** modifica la agenda. |
| **Psicólogo** | Sí (caso especial) | No es un tercer rol: es `PROFESSIONAL` con `specialty = PSICOLOGIA` (ADR-04). Es el **único** que puede leer evoluciones e informes psicológicos; ni siquiera el ADMIN accede a ese contenido (solo metadatos administrativos). |
| **Paciente / apoderado** | **Nunca** | Toda su interacción ocurre por WhatsApp con **respuestas predefinidas y deterministas — sin IA** (sin ChatGPT ni Gemini): confirmar, cancelar, reagendar o registrarse como paciente nuevo (redirección a Google Forms). |

## 3. Dolores actuales y objetivos medibles

### 3.1 Dolores

1. **Información fragmentada**: pacientes en formularios, documentos en Drive, agenda en Calendar y conversaciones en WhatsApp, sin vínculo entre sí ni vista única del paciente.
2. **Confirmaciones manuales**: alguien debe escribir a cada apoderado antes de cada sesión; las inasistencias se detectan tarde y no se miden.
3. **Ficha clínica sin trazabilidad**: no hay garantía de historial completo, ni de quién escribió qué y cuándo; la información puede sobrescribirse o perderse.
4. **Confidencialidad no garantizada**: el material psicológico es visible para cualquiera con acceso al Drive compartido.
5. **Lista de espera opaca**: las respuestas de Google Forms no tienen estado ni seguimiento de admisión.
6. **Sin métricas**: no existen reportes de atenciones, inasistencias, cancelaciones ni rendimiento mensual.

### 3.2 Objetivos medibles

| Objetivo | Métrica de éxito |
|---|---|
| Centralizar la operación | 100 % de pacientes, sesiones y evoluciones registrados en la plataforma; Calendar y planillas paralelas eliminados |
| Automatizar confirmaciones | Recordatorio WhatsApp enviado automáticamente 24 h antes en el 100 % de las citas; estado actualizado sin intervención manual |
| Historial clínico íntegro | 0 evoluciones editadas o borradas (append-only verificable); 100 % de mutaciones con registro de auditoría |
| Confidencialidad psicológica | 0 lecturas de contenido `PSYCHOLOGICAL` por usuarios sin especialidad Psicología (verificable en auditoría) |
| Gestionar lista de espera | Toda entrada de Google Forms con estado (`PENDIENTE → CONTACTADO → ADMITIDO/DESCARTADO`) y responsable |
| Visibilidad operacional | Reportes mensuales de pacientes, atenciones, inasistencias, cancelaciones, terapeutas y lista de espera disponibles sin trabajo manual |

## 4. Alcance y fuera de alcance

### 4.1 En alcance (módulos 1–10)

1. Autenticación, usuarios, roles y organizaciones.
2. Pacientes (CRUD, ficha única).
3. Agenda: horario fijo por paciente (día/hora/profesional), estados `PENDIENTE, CONFIRMADA, CANCELADA, NO_ASISTIO, SOBRECUPO, ATENDIDA`; solo el administrador la modifica.
4. Fichas clínicas append-only con confidencialidad por fila.
5. Documentos en Google Drive (carpeta por paciente: Informes, Evoluciones, Exámenes, Recetas, Otros).
6. WhatsApp: menú determinista + confirmación automática 24 h antes.
7. Lista de espera alimentada por Google Forms.
8. Incidencias (violencia, abuso, accidentes, situaciones graves) con prioridad alta.
9. Reportes operacionales.
10. Dashboard.

### 4.2 Fuera de alcance

- **Portal de pacientes**: el paciente/apoderado nunca ingresa a la plataforma.
- **Reservas dinámicas**: no hay auto-agendamiento; la agenda es fija y la administra el ADMIN.
- **IA conversacional**: prohibida por el cliente; solo respuestas predefinidas.
- **Almacenamiento de archivos en Azure o en la DB**: los binarios viven exclusivamente en Google Drive.
- **Reemplazo de Google Forms**: sigue siendo el canal de ingreso a la lista de espera.
- **Facturación, pagos y remuneraciones**: no solicitados.
- **Aplicaciones móviles nativas**: la web responsiva cubre la necesidad.

## 5. Requisitos no funcionales

| Categoría | Requisito |
|---|---|
| **Seguridad de datos clínicos de menores** | Es el objetivo de calidad n.º 1. JWT (15 min) + refresh opaco rotativo con detección de reuso (ADR-05); cookies httpOnly (ADR-06); RBAC deny-by-default; política de confidencialidad psicológica por especialidad (ADR-04); bcrypt factor 12; contraseñas con política mínima (8+ caracteres, mayúscula, minúscula, dígito); 401 genérico en login para no revelar existencia de cuentas; HTTPS y `helmet` en producción. |
| **Auditoría** | Completa e inmutable (append-only, ADR-10): usuario, acción, fecha, entidad, registro, valor anterior/nuevo (excluyendo `password_hash`), IP y user-agent. Incluye eventos de seguridad (`LOGIN`, `LOGIN_FAILED`, `TOKEN_REUSE_DETECTED`, etc.). |
| **Multi-tenant** | `organization_id` en toda tabla de negocio desde la primera migración; aislamiento garantizado por diseño de las interfaces de repositorio (ADR-03); RLS como evolución futura. |
| **Mantenibilidad** | Monolito modular con Clean Architecture (ADR-01); monorepo con contratos compartidos en `@centro/shared` (ADR-02/09); Repository Pattern + DI (ADR-07); integraciones detrás de puertos (ADR-11); TypeScript estricto, ESLint, Prettier, tests y Swagger. |
| **Disponibilidad y datos** | PostgreSQL gestionado (Azure Flexible Server) con backups automáticos y PITR; sin borrado físico de usuarios ni datos clínicos (soft-delete/estados). |
| **Simplicidad operacional** | Un equipo pequeño debe poder operarlo: un solo despliegue de API, sin microservicios ni infraestructura innecesaria. |

## 6. Restricciones duras del cliente

1. **Stack fijado**: Next.js + TypeScript + Tailwind + shadcn/ui; NestJS; PostgreSQL + Prisma; hosting en Azure; Git/GitHub.
2. **Sin IA en WhatsApp**: prohibido ChatGPT, Gemini o cualquier LLM; solo respuestas predefinidas.
3. **Documentos solo en Google Drive**: prohibido almacenar archivos en Azure o en la base de datos; la DB guarda únicamente identificadores de Drive.
4. **Google Forms se mantiene** como puerta de entrada a la lista de espera.
5. **Agenda fija**: sin reservas dinámicas; solo el administrador la gestiona.
6. **Ficha clínica append-only**: nunca se sobrescribe ni se elimina información clínica.
7. **Confidencialidad psicológica absoluta**: solo psicólogos leen material psicológico.
8. **Desarrollo por módulos**: no se avanza al siguiente sin cerrar el anterior (código + tests + documentación).
9. **Multi-tenant desde el diseño**: entidad `Organization` y pertenencia de todas las tablas a una organización desde el inicio.

## 7. Riesgos principales y mitigación

| # | Riesgo | Impacto | Mitigación |
|---|---|---|---|
| R1 | **Dependencia de APIs de terceros** (Google Drive, WhatsApp Business, Resend/ACS): cambios de contrato, cuotas, caídas | Alto — documentos y confirmaciones dependen de ellas | Puertos/adaptadores (ADR-11): el dominio no conoce al proveedor; colas de reintento y estados (`QUEUED/SENT/FAILED`) en mensajería; registro local de metadatos para reconciliar con Drive; dobles de prueba sin credenciales reales |
| R2 | **Filtración de datos clínicos de menores** | Crítico — legal y reputacional | Defensa en profundidad: RBAC deny-by-default, confidencialidad a nivel de fila filtrada en repositorio, auditoría inmutable, tokens de vida corta con revocación, cookies httpOnly, secretos en Key Vault |
| R3 | **Baja adopción por el equipo clínico** acostumbrado a WhatsApp/Drive manual | Alto — el sistema no reemplaza nada si no se usa | Entrega incremental por módulos con valor visible temprano; UI simple (shadcn); mantener Drive y Forms conocidos como piezas del flujo; capacitación por rol y perfil `mustChangePassword` para onboarding controlado |
| R4 | **Aislamiento multi-tenant defectuoso** (fuga de datos entre centros futuros) | Crítico | `organizationId` obligatorio en la firma de cada método de repositorio (ADR-03); tests de aislamiento; RLS como segunda barrera al escalar |
| R5 | **Flujo WhatsApp determinista mal diseñado** (estados conversacionales inconsistentes, mensajes duplicados) | Medio | Máquina de estados explícita (`whatsapp_conversations` con `current_step` y expiración); idempotencia por `provider_message_id`; plantillas versionadas |
| R6 | **Errores de sincronización con Google Forms** (entradas perdidas o duplicadas en lista de espera) | Medio | Importación idempotente con clave del formulario; estado de admisión explícito; revisión del administrador antes de crear el paciente |
| R7 | **Scope creep / módulos que no se cierran** | Medio — deuda y retraso | Regla dura del cliente: un módulo se termina (código + tests + docs) antes de iniciar el siguiente; contratos en `@centro/shared` estabilizan las fronteras |
| R8 | **Pérdida o corrupción de historial clínico** | Crítico | Append-only en DB y API (sin UPDATE/DELETE de evoluciones), correcciones vía `amends_id`, backups con PITR, auditoría de toda mutación |
