# Módulo 6 · WhatsApp

> Documento de módulo según la metodología del proyecto. Coherente con [01-arquitectura.md](../01-arquitectura.md) (ADR-03, ADR-06, ADR-10, ADR-11) y [02-modelo-datos.md](../02-modelo-datos.md) §8 (borrador de `whatsapp_messages`/`whatsapp_conversations`, revisado en §1 de este documento). Plantilla y nivel de detalle según [modulo-05-documentos.md](./modulo-05-documentos.md).
>
> **Alcance:** menú determinista por WhatsApp (sin IA, spec textual) para confirmar/cancelar una cita o pedir el formulario de paciente nuevo, y recordatorio automático el día anterior a cada cita con confirmación/cancelación por respuesta. **Fuera de alcance:** reagendar de forma dinámica (el spec no lo permite: *"No existen reservas dinámicas"*), leer la respuesta del Google Form (Módulo 7 · Lista de espera), envío de correo (Módulo futuro / `MailPort`, ADR-11).

## 1. Reglas de negocio del módulo (resumen normativo)

- **Sin IA** (spec textual, tres veces: *"NO utilizar IA. NO utilizar ChatGPT. NO utilizar Gemini."*): toda respuesta es texto fijo elegido por un árbol de decisión determinista sobre el dígito recibido (`1`/`2`/`3`/`4`) y el estado de la conversación — nunca se interpreta lenguaje libre ni se llama a un modelo de lenguaje.
- Cada organización tiene **su propio número de WhatsApp Business** (`Organization.whatsappPhoneNumberId`, nuevo campo — spec de escalabilidad multi-centro). Un solo *access token* de una cuenta de sistema de Meta puede enviar en nombre de varios números (arquitectura real de la Cloud API de WhatsApp), así que `WHATSAPP_ACCESS_TOKEN`/`WHATSAPP_APP_SECRET`/`WHATSAPP_VERIFY_TOKEN` son variables de entorno globales — no hay credencial por organización que guardar en la base de datos.
- El webhook entrante (`POST /webhooks/whatsapp`) identifica la organización por el `phone_number_id` que Meta incluye en cada payload (`entry[].changes[].value.metadata.phone_number_id`), buscándolo contra `Organization.whatsappPhoneNumberId`. Un mensaje a un número no registrado se descarta silenciosamente (no hay tenant al que asignarlo).
- **Estado conversacional determinista** (`WhatsAppConversation`, una fila por `(organizationId, phone)`): `IDLE` (sin conversación activa; cualquier mensaje entrante envía el menú principal y pasa a `AWAITING_MENU_CHOICE`), `AWAITING_MENU_CHOICE` (esperando `1`–`4` del menú) y `AWAITING_ATTENDANCE_CONFIRMATION` (esperando `1`/`2` tras un recordatorio automático). Toda conversación tiene `expiresAt`; si el paciente responde después de vencida, se trata como `IDLE` (se reenvía el menú en vez de interpretar la respuesta vieja fuera de contexto).
- **Menú principal** (spec, texto literal): `1 Confirmar cita` · `2 Cancelar cita` · `3 Reagendar` · `4 Paciente nuevo`. La acción de `1`/`2` opera sobre la **próxima cita** del paciente (`PENDIENTE`, `CONFIRMADA` o `SOBRECUPO`, la de fecha más próxima); sin citas próximas, responde un mensaje fijo indicándolo. `3 Reagendar` responde siempre un mensaje fijo derivando el reagendamiento a contacto directo con el centro (no hay reserva dinámica que ofrecer). `4 Paciente nuevo` responde con el enlace al Google Form de la organización (`Organization.googleFormsUrl`, nuevo campo) — spec textual: *"Muchas gracias. Complete el siguiente formulario. (Link Google Forms). Una vez recibido será contactado por nuestro equipo."*
- **Recordatorio automático** (spec: *"Confirmación 24 horas antes. Enviar automáticamente"*): un job diario (no una ventana de precisión al minuto — ver §1.1) envía el recordatorio a cada cita `PENDIENTE` del día siguiente que todavía no lo recibió, y deja la conversación de ese teléfono en `AWAITING_ATTENDANCE_CONFIRMATION` con el `appointmentId` en el contexto.
- Respuesta al recordatorio: `1` (Sí) ⇒ `Appointment.status=CONFIRMADA`, **`confirmedVia=WHATSAPP`** (a diferencia de una confirmación manual del Módulo 3, que siempre queda `MANUAL`). `2` (No) ⇒ `status=CANCELADA` **y notifica a los administradores de la organización** (spec textual: *"Notificar administrador"* — únicamente en esta rama, no en la cancelación por menú, ver §1.3) por el mismo canal de WhatsApp, a los `User` con `role=ADMIN`, `isActive=true` y `phone` no nulo de esa organización.
- El envío/recepción de cada mensaje se registra en `whatsapp_messages` (dirección, teléfono, `templateKey`, cuerpo, `appointmentId?`, estado). A diferencia de `Evolution`/`Document`, **no es estrictamente append-only**: el estado de un mensaje saliente puede pasar de `QUEUED`→`SENT`→`DELIVERED`/`FAILED` (actualizaciones operativas, no clínicas).
- Toda mutación de `Appointment` originada por WhatsApp se audita igual que una manual (ADR-10), con un actor de sistema (`userId=null`, `userEmail='sistema@whatsapp'`) — mismo criterio que los eventos de seguridad sin usuario resoluble del Módulo 1 (login fallido con email inexistente).

### 1.1 Decisión de diseño: recordatorio diario (por fecha), no una ventana de 24 h exactas

**Contexto.** El spec dice *"24 horas antes"*. Una cita puede estar a cualquier hora del día; calcular "exactamente 24 h antes" exige comparar fecha+hora de la cita contra el instante exacto de ejecución del job, con el riesgo de que una ejecución horaria pierda una cita por un margen de minutos, o duplique el envío si el job corre más de una vez dentro de la ventana.

**Decisión.** Un job diario (`@Cron`, una vez al día) busca todas las citas `PENDIENTE` cuya `date` sea "mañana" (relativa a la fecha de ejecución) en **todas** las organizaciones, y les envía el recordatorio si no lo tienen ya. La idempotencia se garantiza igual que la generación de citas del Módulo 3: antes de enviar, se verifica que no exista ya un `whatsapp_messages` con `template_key='ATTENDANCE_REMINDER'` para ese `appointment_id`.

**Justificación.** "El día antes, en la mañana" es el patrón real de la mayoría de sistemas de recordatorio de citas (clínicas, dentistas, peluquerías) y es lo que un centro esperaría operativamente — no una precisión de minuto. Simplifica la implementación (una consulta por fecha, no aritmética de fecha+hora) y la hace determinista y fácil de probar. Queda documentado como una interpretación explícita del spec, no una omisión: si en el futuro se requiere precisión horaria, es un cambio aditivo (cambiar la cadencia del cron y el cálculo del rango, sin tocar el resto del diseño).

### 1.2 Decisión de diseño: el job de recordatorios es la única lectura legítimamente cross-tenant

**Contexto.** ADR-03 exige `organizationId` explícito en todo método de repositorio que sirve una request. Un cron job no es una request de un tenant: corre para todas las organizaciones a la vez.

**Decisión.** `AppointmentRepository.findDueForReminder(from, to)` es el único método del sistema sin `organizationId` como parámetro, documentado explícitamente como la excepción de un job de sistema (no de un actor autenticado). Devuelve, junto a cada cita, su `organizationId` (ya incluido en el registro), que se usa para resolver el `Organization`/`whatsappPhoneNumberId` correspondiente antes de enviar cada mensaje.

**Justificación.** Es preferible declarar la excepción explícitamente (un método, un comentario, un nombre que delata su naturaleza de "batch") que forzar un bucle `for (const org of allOrganizations)` que igual acabaría leyendo todo el sistema pero escondiendo la razón detrás de N llamadas idénticas. La superficie de request (todo lo que expone la API HTTP) sigue cumpliendo ADR-03 sin excepciones.

### 1.3 Decisión de diseño: `MessagingPort` con dos adaptadores, igual que `DocumentStoragePort`

Mismo criterio y misma justificación que el Módulo 5 (ADR-11): `WhatsAppCloudApiAdapter` (real, REST de Meta Cloud API v20 vía `fetch`, sin SDK) para producción, `ConsoleMessagingAdapter` (doble de desarrollo/test, registra el envío en `whatsapp_messages` y en consola, sin red) por defecto — seleccionable por `MESSAGING_DRIVER`. Este entorno no tiene credenciales reales de Meta, igual que no las tenía de Google Drive.

## 2. Historias de usuario

### 2.1 Como paciente (vía WhatsApp, sin acceso a la plataforma)

#### HU-01 · Ver el menú y confirmar mi próxima cita
> Como apoderado quiero escribir al WhatsApp del centro y confirmar la cita de mi hijo sin llamar por teléfono.

- **Dado** que escribo cualquier mensaje a un número de WhatsApp registrado, **cuando** no tengo conversación activa, **entonces** recibo el menú principal (1–4).
- **Dado** el menú activo, **cuando** respondo `1` y tengo una cita `PENDIENTE` o `SOBRECUPO` próxima, **entonces** queda `CONFIRMADA` (`confirmedVia=WHATSAPP`) y recibo un mensaje de confirmación.
- **Dado** que no tengo ninguna cita próxima, **cuando** respondo `1` o `2`, **entonces** recibo un mensaje fijo indicándolo.

#### HU-02 · Cancelar mi próxima cita
- **Dado** el menú activo, **cuando** respondo `2` y tengo una cita cancelable, **entonces** queda `CANCELADA` y recibo confirmación. (No se notifica al administrador por esta vía — ver §1.)

#### HU-03 · Pedir hora nueva
- **Dado** el menú activo, **cuando** respondo `3`, **entonces** recibo un mensaje fijo indicando que debo contactar directamente al centro para reagendar (no hay reserva dinámica).

#### HU-04 · Consultar como paciente nuevo
- **Dado** el menú activo, **cuando** respondo `4`, **entonces** recibo el enlace al formulario de admisión de la organización.

#### HU-05 · Recibir y responder el recordatorio de 24 h
- **Dado** una cita `PENDIENTE` de mañana sin recordatorio previo, **cuando** corre el job diario, **entonces** recibo el mensaje de recordatorio y mi conversación queda `AWAITING_ATTENDANCE_CONFIRMATION`.
- **Dado** ese recordatorio, **cuando** respondo `1`, **entonces** la cita queda `CONFIRMADA` (`confirmedVia=WHATSAPP`).
- **Dado** ese recordatorio, **cuando** respondo `2`, **entonces** la cita queda `CANCELADA` y los administradores de la organización reciben una notificación por WhatsApp.

### 2.2 Como administrador

#### HU-06 · Configurar el canal de WhatsApp del centro
> Como administrador quiero registrar el número de WhatsApp Business y el formulario de admisión de mi centro.

- **Dado** mi organización, **cuando** actualizo `PATCH /organizations/current` con `whatsappPhoneNumberId`/`googleFormsUrl`, **entonces** quedan guardados y se usan en los próximos mensajes entrantes/salientes.

#### HU-07 · Auditar los mensajes enviados y recibidos
- **Dado** mi organización, **cuando** consulto `GET /whatsapp/messages`, **entonces** veo el historial paginado (dirección, teléfono, plantilla, estado, fecha).

#### HU-08 · Disparar el recordatorio manualmente
> Como administrador quiero poder enviar los recordatorios de mañana ahora mismo, por ejemplo para verificar que el canal funciona.

- **Dado** que soy `ADMIN`, **cuando** llamo `POST /whatsapp/reminders/run`, **entonces** se ejecuta el mismo barrido que el cron y responde cuántos recordatorios se enviaron.

## 3. Casos de uso

### CU-01 · Webhook entrante

| | |
|---|---|
| **Actor** | Meta (WhatsApp Cloud API) |
| **Endpoint** | `GET /api/v1/webhooks/whatsapp` (verificación) · `POST /api/v1/webhooks/whatsapp` (mensajes) — ambos `@Public()` |

**Flujo (GET, handshake de Meta).** Si `hub.verify_token` coincide con `WHATSAPP_VERIFY_TOKEN`, responde `200` con `hub.challenge` en texto plano; si no, `403`.

**Flujo (POST).**
1. Si `WHATSAPP_APP_SECRET` está configurado, verifica `X-Hub-Signature-256` (HMAC-SHA256 sobre el cuerpo crudo) — `401` si no coincide.
2. Extrae `phone_number_id` de `entry[].changes[].value.metadata`; busca la `Organization` correspondiente — si no existe, responde `200` (Meta reintenta si no hay `200`) sin procesar nada.
3. Por cada mensaje entrante: resuelve/crea la `WhatsAppConversation` de `(organizationId, phone)`; según su `currentStep` (o `IDLE` si venció `expiresAt`), interpreta el texto (§4.1) y ejecuta la acción determinista correspondiente.
4. Responde `200` siempre (contrato de Meta: un código distinto de 2xx hace que reintente el mismo mensaje).

### CU-02 · Recordatorio automático de 24 h

| | |
|---|---|
| **Actor** | Sistema (`@Cron` diario) / ADMIN (`POST /whatsapp/reminders/run`, mismo método) |

**Flujo principal**
1. `AppointmentRepository.findDueForReminder(mañana, mañana)` (rango de un día) — cruza organizaciones (§1.2).
2. Descarta las que ya tengan un `whatsapp_messages` con `templateKey='ATTENDANCE_REMINDER'` para ese `appointmentId`.
3. Por cada cita restante: resuelve `Patient.phone` y `Organization.whatsappPhoneNumberId`; si falta alguno, se omite (no hay a quién o desde dónde enviar) y se continúa con las demás.
4. Envía el mensaje vía `MessagingPort`, registra `WhatsAppMessage` (`OUTBOUND`, `SENT`/`FAILED`), y upsert de `WhatsAppConversation` a `AWAITING_ATTENDANCE_CONFIRMATION` con `context={appointmentId}`.
5. Responde/retorna `{ sent: number, skipped: number }`.

### CU-03 · Responder al recordatorio

| | |
|---|---|
| **Actor** | Paciente (vía webhook) |

**Flujo principal**
1. Conversación en `AWAITING_ATTENDANCE_CONFIRMATION` con `context.appointmentId`.
2. `1` ⇒ transición `CONFIRMADA`/`confirmedVia=WHATSAPP` (mismas reglas de la máquina de estados del Módulo 3 §1.1: solo si el estado actual lo permite; si no, mensaje fijo de error y se ignora la transición). `2` ⇒ transición `CANCELADA` + notificación a administradores.
3. Cualquier otra respuesta ⇒ mensaje fijo repitiendo la pregunta; la conversación sigue en el mismo paso.
4. Conversación vuelve a `IDLE`.

### CU-04 · Acciones del menú principal (CU implícito en HU-01 a HU-04)

Ídem estructura de CU-03 pero disparado desde `AWAITING_MENU_CHOICE`, con las cuatro ramas de §1 (confirmar / cancelar / reagendar-mensaje-fijo / paciente-nuevo-enlace).

### CU-05 · Consultar historial de mensajes

| | |
|---|---|
| **Actor** | ADMIN |
| **Endpoint** | `GET /api/v1/whatsapp/messages` |

Filtra siempre por `organizationId` del token; pagina por fecha descendente. Sin efectos secundarios.

## 4. Reglas de validación (formularios / DTOs)

### 4.1 Interpretación del texto entrante (no es un DTO REST, pero sigue la misma disciplina de validación)

| Contexto | Entrada aceptada | Acción |
|---|---|---|
| `IDLE` | cualquier texto | Envía menú, pasa a `AWAITING_MENU_CHOICE` |
| `AWAITING_MENU_CHOICE` | `1`\|`2`\|`3`\|`4` (trim, primer carácter numérico) | Rama correspondiente (§1); cualquier otro valor ⇒ reenvía menú con aviso de opción inválida |
| `AWAITING_ATTENDANCE_CONFIRMATION` | `1`\|`2` | Rama correspondiente (§1); cualquier otro valor ⇒ repite la pregunta |

### 4.2 `UpdateOrganizationRequest` (extensión de este módulo)

| Campo nuevo | Regla |
|---|---|
| `whatsappPhoneNumberId` | string opcional, nullable |
| `googleFormsUrl` | URL opcional, nullable |

### 4.3 `WhatsAppMessagesQuery`

`page`, `pageSize` (`PageQuery`, igual que el resto de listados).

## 5. Componentes UI (apps/web)

### 5.1 Página "Organización" (Módulo 1) — dos campos nuevos

- `whatsappPhoneNumberId` y `googleFormsUrl` en el formulario de edición existente (ADMIN).

### 5.2 Página nueva "Mensajes WhatsApp" (`/dashboard/whatsapp`, ADMIN)

- Tabla paginada: fecha, dirección (↑ enviado / ↓ recibido), teléfono, plantilla o extracto del texto, estado.
- Botón "Enviar recordatorios ahora" (`POST /whatsapp/reminders/run`) con confirmación del resultado (`Se enviaron N recordatorios`).
- Entrada en el sidebar (ADMIN, junto a Auditoría).

## 6. Plan de pruebas

### 6.1 Unitarias (apps/api, sin DB — dobles en memoria)

**WhatsAppConversationService (motor determinista)**
- `IDLE` + cualquier texto ⇒ envía menú, pasa a `AWAITING_MENU_CHOICE`.
- `AWAITING_MENU_CHOICE` + `1` con próxima cita `PENDIENTE` ⇒ confirma, `confirmedVia=WHATSAPP`.
- `AWAITING_MENU_CHOICE` + `1`/`2` sin citas próximas ⇒ mensaje fijo, sin mutar nada.
- `AWAITING_MENU_CHOICE` + `3` ⇒ mensaje fijo de reagendamiento, sin mutar nada.
- `AWAITING_MENU_CHOICE` + `4` ⇒ mensaje con `googleFormsUrl` de la organización.
- `AWAITING_MENU_CHOICE` + texto inválido ⇒ reenvía menú, conversación sigue en el mismo paso.
- `AWAITING_ATTENDANCE_CONFIRMATION` + `1` ⇒ confirma; + `2` ⇒ cancela y notifica a los `ADMIN` con teléfono; conversación vuelve a `IDLE` en ambos casos.
- Conversación vencida (`expiresAt` pasado) ⇒ se trata como `IDLE`, ignora el `currentStep` persistido.
- Transición no permitida por la máquina de estados del Módulo 3 (p. ej. confirmar una cita ya `CANCELADA`) ⇒ mensaje fijo de error, sin lanzar excepción no controlada hacia el webhook.

**WhatsAppReminderService**
- Cita `PENDIENTE` de mañana sin recordatorio previo ⇒ se envía y se registra `WhatsAppMessage`.
- Repetir el barrido sobre el mismo rango ⇒ no duplica el envío (idempotente).
- Cita sin `Organization.whatsappPhoneNumberId` configurado ⇒ se omite sin lanzar error, continúa con las demás.
- Organizaciones distintas en el mismo barrido reciben cada una su propio recordatorio, sin cruzarse.

### 6.2 E2E (apps/api + PostgreSQL de prueba; `MESSAGING_DRIVER=console`)

1. **Menú y confirmación:** `POST /webhooks/whatsapp` con un mensaje cualquiera ⇒ conversación pasa a `AWAITING_MENU_CHOICE`; segundo mensaje `1` con una cita `PENDIENTE` asignada a ese teléfono ⇒ la cita queda `CONFIRMADA`/`confirmedVia=WHATSAPP` en la base.
2. **Cancelación sin notificar:** `2` sobre una cita cancelable ⇒ `CANCELADA`; no se crea ningún `WhatsAppMessage` adicional hacia un `ADMIN`.
3. **Recordatorio y respuesta:** `POST /whatsapp/reminders/run` (ADMIN) sobre una cita de mañana ⇒ `sent=1`; simular la respuesta `2` vía webhook ⇒ `CANCELADA` y se registra un `WhatsAppMessage` `OUTBOUND` hacia el teléfono del `ADMIN`.
4. **Idempotencia del recordatorio:** ejecutar `POST /whatsapp/reminders/run` dos veces sobre el mismo rango ⇒ la segunda vez `sent=0`.
5. **Multi-tenant:** dos organizaciones con números distintos; un mensaje al número de la organización A nunca muta una cita de la organización B, aunque compartan el mismo teléfono de paciente (caso límite, pero `phone_number_id` decide la organización, no el teléfono del paciente).
6. **Firma del webhook:** con `WHATSAPP_APP_SECRET` configurado, una firma inválida ⇒ `401`; sin la variable configurada (default de este entorno), cualquier payload se procesa (doble de desarrollo).
7. **`GET /whatsapp/messages`:** solo `ADMIN`; aislado por organización.

### 6.3 Frontend (mínimo del módulo)

- La página "Mensajes WhatsApp" muestra el estado vacío correctamente si no hay mensajes.

## 7. Definición de Hecho (DoD)

El módulo 6 se considera **terminado** cuando:

- [x] Migración Prisma aplicada para `whatsapp_messages`, `whatsapp_conversations`, y los campos nuevos de `Organization` (`whatsapp_phone_number_id`, `google_forms_url`).
- [x] `MessagingPort` implementado con `WhatsAppCloudApiAdapter` (real) y `ConsoleMessagingAdapter` (doble de desarrollo/test), seleccionables por `MESSAGING_DRIVER`.
- [x] Webhook (`GET`/`POST /webhooks/whatsapp`) público, con verificación de firma condicional y manejo de organización no registrada.
- [x] Motor conversacional determinista cubriendo el menú completo (§1, §4.1) y el flujo de recordatorio, sin ninguna llamada a un modelo de lenguaje.
- [x] Job diario de recordatorios + endpoint manual (`POST /whatsapp/reminders/run`, ADMIN) idempotentes, cruzando organizaciones de forma explícita y documentada (§1.2).
- [x] `confirmedVia=WHATSAPP` y notificación a administradores implementados y probados en e2e.
- [x] `GET /whatsapp/messages` (ADMIN, paginado, aislado por organización).
- [x] Extensión de `Organization`/`PATCH /organizations/current` con `whatsappPhoneNumberId`/`googleFormsUrl`, sin romper los tests existentes del Módulo 1.
- [x] Todas las reglas de negocio de §1 cubiertas por tests unitarios o e2e; suites en verde.
- [x] Frontend operativo: campos nuevos en Organización, página "Mensajes WhatsApp" con envío manual de recordatorios.
- [x] `tsc --noEmit`, ESLint y Prettier sin errores en `apps/api`, `apps/web` y `packages/shared`.
- [x] Documentación actualizada: este archivo, `02-modelo-datos.md` (`whatsapp_messages`/`whatsapp_conversations` implementadas, `Organization` con los campos nuevos), `04-api-rest.md` (sección WhatsApp reemplaza el borrador) y `01-arquitectura.md` (tabla de estado del módulo).

Cumplido el DoD, se habilita el inicio del **Módulo 7 · Lista de espera**.
