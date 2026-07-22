-- CreateTable
CREATE TABLE "patients" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "first_name" TEXT NOT NULL,
    "last_name" TEXT NOT NULL,
    "rut" TEXT NOT NULL,
    "birth_date" DATE NOT NULL,
    "diagnosis" TEXT,
    "phone" TEXT NOT NULL,
    "email" TEXT,
    "address" TEXT,
    "observations" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "drive_folder_id" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "patients_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "patients_organization_id_idx" ON "patients"("organization_id");

-- CreateIndex
CREATE INDEX "patients_organization_id_phone_idx" ON "patients"("organization_id", "phone");

-- CreateIndex
CREATE UNIQUE INDEX "patients_organization_id_rut_key" ON "patients"("organization_id", "rut");

-- AddForeignKey
ALTER TABLE "patients" ADD CONSTRAINT "patients_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
