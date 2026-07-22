-- CreateEnum
CREATE TYPE "incident_type" AS ENUM ('VIOLENCIA', 'ABUSO', 'ACCIDENTE', 'SITUACION_GRAVE');

-- CreateEnum
CREATE TYPE "incident_status" AS ENUM ('ABIERTA', 'EN_REVISION', 'CERRADA');

-- CreateTable
CREATE TABLE "incidents" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "patient_id" UUID,
    "reported_by_id" UUID NOT NULL,
    "type" "incident_type" NOT NULL,
    "description" TEXT NOT NULL,
    "occurred_at" TIMESTAMPTZ(6) NOT NULL,
    "status" "incident_status" NOT NULL DEFAULT 'ABIERTA',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "incidents_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "incidents_organization_id_status_idx" ON "incidents"("organization_id", "status");

-- CreateIndex
CREATE INDEX "incidents_organization_id_patient_id_idx" ON "incidents"("organization_id", "patient_id");

-- CreateIndex
CREATE INDEX "incidents_organization_id_reported_by_id_idx" ON "incidents"("organization_id", "reported_by_id");

-- AddForeignKey
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_reported_by_id_fkey" FOREIGN KEY ("reported_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
