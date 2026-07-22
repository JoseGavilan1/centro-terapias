/*
  Warnings:

  - Changed the type of `confidentiality` on the `evolutions` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.

*/
-- CreateEnum
CREATE TYPE "clinical_confidentiality" AS ENUM ('STANDARD', 'PSYCHOLOGICAL');

-- CreateEnum
CREATE TYPE "document_category" AS ENUM ('INFORME', 'EVOLUCION', 'EXAMEN', 'RECETA', 'OTRO');

-- AlterTable
ALTER TABLE "evolutions" DROP COLUMN "confidentiality",
ADD COLUMN     "confidentiality" "clinical_confidentiality" NOT NULL;

-- DropEnum
DROP TYPE "evolution_confidentiality";

-- CreateTable
CREATE TABLE "documents" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "patient_id" UUID NOT NULL,
    "evolution_id" UUID,
    "uploaded_by_id" UUID NOT NULL,
    "category" "document_category" NOT NULL,
    "name" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "drive_file_id" TEXT NOT NULL,
    "confidentiality" "clinical_confidentiality" NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "documents_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "documents_organization_id_patient_id_category_idx" ON "documents"("organization_id", "patient_id", "category");

-- CreateIndex
CREATE INDEX "documents_organization_id_evolution_id_idx" ON "documents"("organization_id", "evolution_id");

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_evolution_id_fkey" FOREIGN KEY ("evolution_id") REFERENCES "evolutions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_uploaded_by_id_fkey" FOREIGN KEY ("uploaded_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
