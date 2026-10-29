-- CreateEnum
CREATE TYPE "BeneficiarioPago" AS ENUM ('DAPLACE', 'PROPIETARIO', 'OTRO');

-- CreateEnum
CREATE TYPE "EstadoEvidenciaPago" AS ENUM ('REFERENCIADA', 'VALIDADA', 'RECHAZADA');

-- AlterTable
ALTER TABLE "pagos" ADD COLUMN "beneficiarioTipo" "BeneficiarioPago",
ADD COLUMN "beneficiarioNombre" TEXT,
ADD COLUMN "bancoReceptor" TEXT,
ADD COLUMN "cuentaReferencia" TEXT;

-- CreateTable
CREATE TABLE "evidencias_pago" (
    "id" TEXT NOT NULL,
    "pagoId" TEXT NOT NULL,
    "tipo" TEXT NOT NULL DEFAULT 'VOUCHER',
    "nombreArchivo" TEXT NOT NULL,
    "referenciaDocumental" TEXT,
    "url" TEXT,
    "estado" "EstadoEvidenciaPago" NOT NULL DEFAULT 'REFERENCIADA',
    "notas" TEXT,
    "registradoPorId" TEXT,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "evidencias_pago_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "evidencias_pago_pagoId_idx" ON "evidencias_pago"("pagoId");

-- CreateIndex
CREATE INDEX "evidencias_pago_estado_idx" ON "evidencias_pago"("estado");

-- AddForeignKey
ALTER TABLE "evidencias_pago" ADD CONSTRAINT "evidencias_pago_pagoId_fkey" FOREIGN KEY ("pagoId") REFERENCES "pagos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evidencias_pago" ADD CONSTRAINT "evidencias_pago_registradoPorId_fkey" FOREIGN KEY ("registradoPorId") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;
