-- CreateEnum
CREATE TYPE "evolution_confidentiality" AS ENUM ('STANDARD', 'PSYCHOLOGICAL');

-- CreateTable
CREATE TABLE "evolutions" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "patient_id" UUID NOT NULL,
    "author_id" UUID NOT NULL,
    "appointment_id" UUID,
    "amends_id" UUID,
    "date" DATE NOT NULL,
    "observation" TEXT NOT NULL,
    "work_plan" TEXT NOT NULL,
    "confidentiality" "evolution_confidentiality" NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "evolutions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "evolutions_appointment_id_key" ON "evolutions"("appointment_id");

-- CreateIndex
CREATE INDEX "evolutions_organization_id_patient_id_date_idx" ON "evolutions"("organization_id", "patient_id", "date");

-- CreateIndex
CREATE INDEX "evolutions_organization_id_author_id_idx" ON "evolutions"("organization_id", "author_id");

-- AddForeignKey
ALTER TABLE "evolutions" ADD CONSTRAINT "evolutions_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evolutions" ADD CONSTRAINT "evolutions_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evolutions" ADD CONSTRAINT "evolutions_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evolutions" ADD CONSTRAINT "evolutions_appointment_id_fkey" FOREIGN KEY ("appointment_id") REFERENCES "appointments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evolutions" ADD CONSTRAINT "evolutions_amends_id_fkey" FOREIGN KEY ("amends_id") REFERENCES "evolutions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
