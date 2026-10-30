-- CreateEnum
CREATE TYPE "TipoAvisoReserva" AS ENUM ('EXPIRACION_PROXIMA', 'SOLICITUD_EXPIRADA');

-- CreateEnum
CREATE TYPE "EstadoAvisoReserva" AS ENUM ('PROGRAMADO', 'PENDIENTE', 'EN_ENVIO', 'ENVIADO', 'FALLIDO', 'CANCELADO');

-- CreateEnum
CREATE TYPE "CanalAvisoReserva" AS ENUM ('EMAIL', 'WHATSAPP', 'SISTEMA');

-- CreateTable
CREATE TABLE "avisos_reserva" (
    "id" TEXT NOT NULL,
    "reservaId" TEXT NOT NULL,
    "tipoAviso" "TipoAvisoReserva" NOT NULL,
    "politicaVersion" TEXT NOT NULL,
    "venceEnSnapshot" TIMESTAMPTZ(3) NOT NULL,
    "programadoPara" TIMESTAMPTZ(3) NOT NULL,
    "canal" "CanalAvisoReserva" NOT NULL DEFAULT 'EMAIL',
    "plantilla" TEXT NOT NULL,
    "estado" "EstadoAvisoReserva" NOT NULL DEFAULT 'PROGRAMADO',
    "reintentos" INTEGER NOT NULL DEFAULT 0,
    "maxReintentos" INTEGER NOT NULL DEFAULT 3,
    "leaseToken" TEXT,
    "leaseVenceEn" TIMESTAMPTZ(3),
    "enviadoEn" TIMESTAMPTZ(3),
    "canceladoEn" TIMESTAMPTZ(3),
    "motivoCancelacion" TEXT,
    "proveedorId" TEXT,
    "ultimoErrorCodigo" TEXT,
    "ultimoErrorMensaje" TEXT,
    "idempotencyKey" TEXT,
    "creadoEn" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizadoEn" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "avisos_reserva_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "avisos_reserva_reservaId_tipoAviso_politicaVersion_venceEnSnapshot_key"
    ON "avisos_reserva"("reservaId", "tipoAviso", "politicaVersion", "venceEnSnapshot");

-- CreateIndex
CREATE INDEX "avisos_reserva_reservaId_idx" ON "avisos_reserva"("reservaId");

-- CreateIndex
CREATE INDEX "avisos_reserva_estado_programadoPara_idx" ON "avisos_reserva"("estado", "programadoPara");

-- CreateIndex
CREATE INDEX "avisos_reserva_leaseToken_leaseVenceEn_idx" ON "avisos_reserva"("leaseToken", "leaseVenceEn");

-- AddForeignKey
ALTER TABLE "avisos_reserva"
    ADD CONSTRAINT "avisos_reserva_reservaId_fkey"
    FOREIGN KEY ("reservaId") REFERENCES "reservas"("id") ON DELETE CASCADE ON UPDATE CASCADE;
