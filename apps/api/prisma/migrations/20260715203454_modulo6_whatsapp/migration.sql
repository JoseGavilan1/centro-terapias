-- CreateEnum
CREATE TYPE "whatsapp_message_direction" AS ENUM ('INBOUND', 'OUTBOUND');

-- CreateEnum
CREATE TYPE "whatsapp_message_status" AS ENUM ('QUEUED', 'SENT', 'DELIVERED', 'FAILED');

-- CreateEnum
CREATE TYPE "whatsapp_conversation_step" AS ENUM ('IDLE', 'AWAITING_MENU_CHOICE', 'AWAITING_ATTENDANCE_CONFIRMATION');

-- AlterTable
ALTER TABLE "organizations" ADD COLUMN     "google_forms_url" TEXT,
ADD COLUMN     "whatsapp_phone_number_id" TEXT;

-- CreateTable
CREATE TABLE "whatsapp_messages" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "direction" "whatsapp_message_direction" NOT NULL,
    "phone" TEXT NOT NULL,
    "template_key" TEXT,
    "body" TEXT NOT NULL,
    "appointment_id" UUID,
    "status" "whatsapp_message_status" NOT NULL DEFAULT 'QUEUED',
    "provider_message_id" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "whatsapp_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "whatsapp_conversations" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "phone" TEXT NOT NULL,
    "current_step" "whatsapp_conversation_step" NOT NULL DEFAULT 'IDLE',
    "context" JSONB,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "whatsapp_conversations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "whatsapp_messages_organization_id_created_at_idx" ON "whatsapp_messages"("organization_id", "created_at");

-- CreateIndex
CREATE INDEX "whatsapp_messages_appointment_id_template_key_idx" ON "whatsapp_messages"("appointment_id", "template_key");

-- CreateIndex
CREATE UNIQUE INDEX "whatsapp_conversations_organization_id_phone_key" ON "whatsapp_conversations"("organization_id", "phone");

-- CreateIndex
CREATE UNIQUE INDEX "organizations_whatsapp_phone_number_id_key" ON "organizations"("whatsapp_phone_number_id");

-- AddForeignKey
ALTER TABLE "whatsapp_messages" ADD CONSTRAINT "whatsapp_messages_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "whatsapp_messages" ADD CONSTRAINT "whatsapp_messages_appointment_id_fkey" FOREIGN KEY ("appointment_id") REFERENCES "appointments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "whatsapp_conversations" ADD CONSTRAINT "whatsapp_conversations_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

