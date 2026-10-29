-- CreateEnum
CREATE TYPE "EstadoFirmaContrato" AS ENUM ('REFERENCIADA', 'VALIDADA', 'RECHAZADA');

-- CreateTable
CREATE TABLE "contratos_reserva" (
    "id" TEXT NOT NULL,
    "reservaId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "nombreOriginal" TEXT NOT NULL,
    "urlReferencia" TEXT,
    "estadoFirma" "EstadoFirmaContrato" NOT NULL DEFAULT 'REFERENCIADA',
    "registradoPorId" TEXT NOT NULL,
    "registradoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "validadoPorId" TEXT,
    "validadoEn" TIMESTAMP(3),
    "motivoValidacion" TEXT,
    "reemplazaContratoId" TEXT,
    "idempotencyKey" TEXT,
    "payloadHash" TEXT,

    CONSTRAINT "contratos_reserva_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "contratos_reserva_reservaId_version_key" ON "contratos_reserva"("reservaId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "contratos_reserva_reservaId_idempotencyKey_key" ON "contratos_reserva"("reservaId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "contratos_reserva_reservaId_idx" ON "contratos_reserva"("reservaId");

-- CreateIndex
CREATE INDEX "contratos_reserva_estadoFirma_idx" ON "contratos_reserva"("estadoFirma");

-- AddForeignKey
ALTER TABLE "contratos_reserva" ADD CONSTRAINT "contratos_reserva_reservaId_fkey" FOREIGN KEY ("reservaId") REFERENCES "reservas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contratos_reserva" ADD CONSTRAINT "contratos_reserva_registradoPorId_fkey" FOREIGN KEY ("registradoPorId") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contratos_reserva" ADD CONSTRAINT "contratos_reserva_validadoPorId_fkey" FOREIGN KEY ("validadoPorId") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contratos_reserva" ADD CONSTRAINT "contratos_reserva_reemplazaContratoId_fkey" FOREIGN KEY ("reemplazaContratoId") REFERENCES "contratos_reserva"("id") ON DELETE SET NULL ON UPDATE CASCADE;
