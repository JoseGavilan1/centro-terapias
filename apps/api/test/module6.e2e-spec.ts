import { INestApplication } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import request from 'supertest';
import { PrismaService } from '../src/infrastructure/prisma/prisma.service';
import { cleanDatabase, createTestApp } from './test-app';

const ADMIN_PASSWORD = 'AdminPass1';

const ORG_A_PHONE_NUMBER_ID = 'wa-org-a';
const ORG_B_PHONE_NUMBER_ID = 'wa-org-b';
const PATIENT_A_PHONE = '+56911111111';
const ADMIN_A_PHONE = '+56900000001';

function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function addDays(date: Date, days: number): Date {
  const copy = new Date(date);
  copy.setUTCDate(copy.getUTCDate() + days);
  return copy;
}

describe('Módulo 6 · WhatsApp (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let orgAId: string;
  let orgBId: string;
  let patientAId: string;
  let profAId: string;

  const today = new Date(toIsoDate(new Date()));
  const tomorrow = addDays(today, 1);

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await cleanDatabase(app);

    const orgA = await prisma.organization.create({
      data: {
        name: 'Centro E2E A',
        timezone: 'America/Santiago',
        whatsappPhoneNumberId: ORG_A_PHONE_NUMBER_ID,
        googleFormsUrl: 'https://forms.example/centro-a',
      },
    });
    orgAId = orgA.id;
    const orgB = await prisma.organization.create({
      data: {
        name: 'Centro E2E B',
        timezone: 'America/Santiago',
        whatsappPhoneNumberId: ORG_B_PHONE_NUMBER_ID,
      },
    });
    orgBId = orgB.id;

    await prisma.user.create({
      data: {
        organizationId: orgAId,
        email: 'admin@m6.cl',
        passwordHash: await bcrypt.hash(ADMIN_PASSWORD, 4),
        firstName: 'Admin',
        lastName: 'A',
        role: 'ADMIN',
        phone: ADMIN_A_PHONE,
      },
    });
    const profA = await prisma.user.create({
      data: {
        organizationId: orgAId,
        email: 'prof@m6.cl',
        passwordHash: await bcrypt.hash(ADMIN_PASSWORD, 4),
        firstName: 'Profesional',
        lastName: 'A',
        role: 'PROFESSIONAL',
        specialty: 'KINESIOLOGIA',
      },
    });
    profAId = profA.id;

    const patientA = await prisma.patient.create({
      data: {
        organizationId: orgAId,
        firstName: 'Sofía',
        lastName: 'Gómez',
        rut: '12345678-5',
        birthDate: new Date('2018-03-20'),
        phone: PATIENT_A_PHONE,
      },
    });
    patientAId = patientA.id;
  });

  function agent() {
    return request(app.getHttpServer());
  }

  async function loginAs(email: string, password: string) {
    const res = await agent().post('/api/v1/auth/login').send({ email, password }).expect(200);
    return res.headers['set-cookie'] as unknown as string[];
  }

  function sendWebhookMessage(phoneNumberId: string, from: string, text: string) {
    return agent()
      .post('/api/v1/webhooks/whatsapp')
      .send({
        entry: [
          {
            changes: [
              {
                value: {
                  metadata: { phone_number_id: phoneNumberId },
                  messages: [{ from, text: { body: text } }],
                },
              },
            ],
          },
        ],
      })
      .expect(200);
  }

  async function createAppointment(
    overrides: { organizationId?: string; patientId?: string; date?: Date } = {},
  ) {
    const appointment = await prisma.appointment.create({
      data: {
        organizationId: overrides.organizationId ?? orgAId,
        patientId: overrides.patientId ?? patientAId,
        professionalId: profAId,
        date: overrides.date ?? today,
        startMinute: 9 * 60,
        durationMinutes: 45,
        status: 'PENDIENTE',
      },
    });
    return appointment;
  }

  describe('Menú y confirmación', () => {
    it('el mensaje inicial envía el menú y "1" confirma la próxima cita con confirmedVia=WHATSAPP', async () => {
      const appointment = await createAppointment();

      await sendWebhookMessage(ORG_A_PHONE_NUMBER_ID, PATIENT_A_PHONE, 'hola');
      const conversation = await prisma.whatsAppConversation.findUnique({
        where: { organizationId_phone: { organizationId: orgAId, phone: PATIENT_A_PHONE } },
      });
      expect(conversation?.currentStep).toBe('AWAITING_MENU_CHOICE');

      await sendWebhookMessage(ORG_A_PHONE_NUMBER_ID, PATIENT_A_PHONE, '1');
      const updated = await prisma.appointment.findUnique({ where: { id: appointment.id } });
      expect(updated?.status).toBe('CONFIRMADA');
      expect(updated?.confirmedVia).toBe('WHATSAPP');
    });
  });

  describe('Cancelación sin notificar', () => {
    it('"2" cancela la cita y no genera un aviso a los administradores', async () => {
      const appointment = await createAppointment();

      await sendWebhookMessage(ORG_A_PHONE_NUMBER_ID, PATIENT_A_PHONE, 'hola');
      await sendWebhookMessage(ORG_A_PHONE_NUMBER_ID, PATIENT_A_PHONE, '2');

      const updated = await prisma.appointment.findUnique({ where: { id: appointment.id } });
      expect(updated?.status).toBe('CANCELADA');

      const adminNotices = await prisma.whatsAppMessage.findMany({
        where: { organizationId: orgAId, templateKey: 'ADMIN_CANCELLATION_NOTICE' },
      });
      expect(adminNotices).toHaveLength(0);
    });
  });

  describe('Recordatorio automático y respuesta', () => {
    it('genera el recordatorio de una cita de mañana y notifica a los administradores si el paciente cancela', async () => {
      const appointment = await createAppointment({ date: tomorrow });
      const adminCookies = await loginAs('admin@m6.cl', ADMIN_PASSWORD);

      const run = await agent()
        .post('/api/v1/whatsapp/reminders/run')
        .set('Cookie', adminCookies)
        .expect(200);
      expect(run.body.sent).toBeGreaterThanOrEqual(1);

      const reminder = await prisma.whatsAppMessage.findFirst({
        where: { appointmentId: appointment.id, templateKey: 'ATTENDANCE_REMINDER' },
      });
      expect(reminder).not.toBeNull();

      const conversation = await prisma.whatsAppConversation.findUnique({
        where: { organizationId_phone: { organizationId: orgAId, phone: PATIENT_A_PHONE } },
      });
      expect(conversation?.currentStep).toBe('AWAITING_ATTENDANCE_CONFIRMATION');

      await sendWebhookMessage(ORG_A_PHONE_NUMBER_ID, PATIENT_A_PHONE, '2');

      const updated = await prisma.appointment.findUnique({ where: { id: appointment.id } });
      expect(updated?.status).toBe('CANCELADA');

      const adminNotice = await prisma.whatsAppMessage.findFirst({
        where: {
          organizationId: orgAId,
          templateKey: 'ADMIN_CANCELLATION_NOTICE',
          phone: ADMIN_A_PHONE,
        },
      });
      expect(adminNotice).not.toBeNull();
    });

    it('es idempotente: repetir el barrido sobre el mismo día no duplica el envío', async () => {
      await createAppointment({ date: tomorrow });
      const adminCookies = await loginAs('admin@m6.cl', ADMIN_PASSWORD);

      const first = await agent()
        .post('/api/v1/whatsapp/reminders/run')
        .set('Cookie', adminCookies)
        .expect(200);
      expect(first.body.sent).toBe(1);

      const second = await agent()
        .post('/api/v1/whatsapp/reminders/run')
        .set('Cookie', adminCookies)
        .expect(200);
      expect(second.body.sent).toBe(0);
      expect(second.body.skipped).toBe(1);
    });
  });

  describe('Multi-tenant', () => {
    it('un mensaje al número de otra organización nunca muta una cita de la organización A, aunque el teléfono del paciente se repita', async () => {
      const appointment = await createAppointment();
      await prisma.patient.create({
        data: {
          organizationId: orgBId,
          firstName: 'Otro',
          lastName: 'Paciente',
          rut: '87654321-6',
          birthDate: new Date('2019-01-01'),
          phone: PATIENT_A_PHONE,
        },
      });

      await sendWebhookMessage(ORG_B_PHONE_NUMBER_ID, PATIENT_A_PHONE, 'hola');
      await sendWebhookMessage(ORG_B_PHONE_NUMBER_ID, PATIENT_A_PHONE, '1');

      const untouched = await prisma.appointment.findUnique({ where: { id: appointment.id } });
      expect(untouched?.status).toBe('PENDIENTE');
    });

    it('descarta silenciosamente un mensaje a un phone_number_id no registrado', async () => {
      await sendWebhookMessage('numero-desconocido', PATIENT_A_PHONE, 'hola');
      const conversation = await prisma.whatsAppConversation.findUnique({
        where: { organizationId_phone: { organizationId: orgAId, phone: PATIENT_A_PHONE } },
      });
      expect(conversation).toBeNull();
    });
  });

  describe('Handshake del webhook', () => {
    it('GET responde el challenge cuando el verify_token coincide (o 403 si no hay uno configurado)', async () => {
      // Este entorno no configura WHATSAPP_VERIFY_TOKEN (driver console); se espera 403.
      await agent()
        .get('/api/v1/webhooks/whatsapp')
        .query({
          'hub.mode': 'subscribe',
          'hub.verify_token': 'cualquiera',
          'hub.challenge': 'echo-123',
        })
        .expect(403);
    });
  });

  describe('GET /whatsapp/messages', () => {
    it('solo ADMIN, aislado por organización', async () => {
      await createAppointment();
      await sendWebhookMessage(ORG_A_PHONE_NUMBER_ID, PATIENT_A_PHONE, 'hola');

      const adminCookies = await loginAs('admin@m6.cl', ADMIN_PASSWORD);
      const list = await agent()
        .get('/api/v1/whatsapp/messages')
        .set('Cookie', adminCookies)
        .expect(200);
      const messages = list.body.data as Array<{ id: string }>;
      expect(messages.length).toBeGreaterThanOrEqual(1);
      expect(messages.every((m) => typeof m.id === 'string')).toBe(true);
    });

    it('rechaza a un PROFESSIONAL con 403', async () => {
      const profCookies = await loginAs('prof@m6.cl', ADMIN_PASSWORD);
      await agent().get('/api/v1/whatsapp/messages').set('Cookie', profCookies).expect(403);
    });
  });
});
