-- CreateEnum
CREATE TYPE "weekday" AS ENUM ('MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY');

-- CreateEnum
CREATE TYPE "appointment_status" AS ENUM ('PENDIENTE', 'CONFIRMADA', 'CANCELADA', 'NO_ASISTIO', 'SOBRECUPO', 'ATENDIDA');

-- CreateEnum
CREATE TYPE "confirmed_via" AS ENUM ('WHATSAPP', 'MANUAL');

-- CreateTable
CREATE TABLE "therapy_slots" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "patient_id" UUID NOT NULL,
    "professional_id" UUID NOT NULL,
    "weekday" "weekday" NOT NULL,
    "start_minute" INTEGER NOT NULL,
    "duration_minutes" INTEGER NOT NULL,
    "valid_from" DATE NOT NULL,
    "valid_to" DATE,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "therapy_slots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "appointments" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "therapy_slot_id" UUID,
    "patient_id" UUID NOT NULL,
    "professional_id" UUID NOT NULL,
    "date" DATE NOT NULL,
    "start_minute" INTEGER NOT NULL,
    "duration_minutes" INTEGER NOT NULL,
    "status" "appointment_status" NOT NULL,
    "confirmed_via" "confirmed_via",
    "notes" TEXT,
    "attendance_marked_by_id" UUID,
    "attendance_marked_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "appointments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "therapy_slots_organization_id_professional_id_idx" ON "therapy_slots"("organization_id", "professional_id");

-- CreateIndex
CREATE INDEX "therapy_slots_organization_id_patient_id_idx" ON "therapy_slots"("organization_id", "patient_id");

-- CreateIndex
CREATE INDEX "appointments_organization_id_professional_id_date_idx" ON "appointments"("organization_id", "professional_id", "date");

-- CreateIndex
CREATE INDEX "appointments_organization_id_patient_id_date_idx" ON "appointments"("organization_id", "patient_id", "date");

-- CreateIndex
CREATE INDEX "appointments_organization_id_date_idx" ON "appointments"("organization_id", "date");

-- CreateIndex
CREATE UNIQUE INDEX "appointments_therapy_slot_id_date_key" ON "appointments"("therapy_slot_id", "date");

-- AddForeignKey
ALTER TABLE "therapy_slots" ADD CONSTRAINT "therapy_slots_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "therapy_slots" ADD CONSTRAINT "therapy_slots_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "therapy_slots" ADD CONSTRAINT "therapy_slots_professional_id_fkey" FOREIGN KEY ("professional_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_therapy_slot_id_fkey" FOREIGN KEY ("therapy_slot_id") REFERENCES "therapy_slots"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_professional_id_fkey" FOREIGN KEY ("professional_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_attendance_marked_by_id_fkey" FOREIGN KEY ("attendance_marked_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
