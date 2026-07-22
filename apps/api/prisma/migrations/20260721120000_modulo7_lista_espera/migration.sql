-- CreateEnum
CREATE TYPE "waitlist_status" AS ENUM ('PENDIENTE', 'ASIGNADA', 'DESCARTADA');

-- AlterTable
ALTER TABLE "organizations" ADD COLUMN     "waitlist_intake_token" TEXT;

-- CreateTable
CREATE TABLE "waitlist_entries" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "child_first_name" TEXT NOT NULL,
    "child_last_name" TEXT NOT NULL,
    "child_rut" TEXT,
    "child_birth_date" DATE,
    "guardian_name" TEXT NOT NULL,
    "guardian_phone" TEXT NOT NULL,
    "guardian_email" TEXT,
    "requested_specialty" "specialty",
    "reason" TEXT,
    "sede" TEXT,
    "status" "waitlist_status" NOT NULL DEFAULT 'PENDIENTE',
    "assigned_patient_id" UUID,
    "assigned_therapy_slot_id" UUID,
    "discard_reason" TEXT,
    "resolved_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "waitlist_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "waitlist_entries_assigned_patient_id_key" ON "waitlist_entries"("assigned_patient_id");

-- CreateIndex
CREATE UNIQUE INDEX "waitlist_entries_assigned_therapy_slot_id_key" ON "waitlist_entries"("assigned_therapy_slot_id");

-- CreateIndex
CREATE INDEX "waitlist_entries_organization_id_status_idx" ON "waitlist_entries"("organization_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "organizations_waitlist_intake_token_key" ON "organizations"("waitlist_intake_token");

-- AddForeignKey
ALTER TABLE "waitlist_entries" ADD CONSTRAINT "waitlist_entries_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "waitlist_entries" ADD CONSTRAINT "waitlist_entries_assigned_patient_id_fkey" FOREIGN KEY ("assigned_patient_id") REFERENCES "patients"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "waitlist_entries" ADD CONSTRAINT "waitlist_entries_assigned_therapy_slot_id_fkey" FOREIGN KEY ("assigned_therapy_slot_id") REFERENCES "therapy_slots"("id") ON DELETE SET NULL ON UPDATE CASCADE;

