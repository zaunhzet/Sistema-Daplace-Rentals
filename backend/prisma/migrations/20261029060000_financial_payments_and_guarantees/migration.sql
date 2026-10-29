-- CreateEnum
CREATE TYPE "EstadoPago" AS ENUM ('PENDIENTE_CONCILIACION', 'CONCILIADO', 'RECHAZADO');

-- CreateEnum
CREATE TYPE "ConceptoPago" AS ENUM ('ADELANTO', 'SALDO', 'PAGO_TOTAL', 'PENALIDAD', 'OTRO');

-- CreateEnum
CREATE TYPE "MetodoPago" AS ENUM ('TRANSFERENCIA', 'TARJETA', 'EFECTIVO', 'BILLETERA_DIGITAL', 'DEPOSITO', 'OTRO');

-- CreateEnum
CREATE TYPE "EstadoGarantia" AS ENUM ('EN_CUSTODIA', 'PARCIALMENTE_RETENIDA', 'DEVUELTA_TOTAL', 'RETENIDA_TOTAL', 'LIQUIDADA_MIXTA');

-- CreateEnum
CREATE TYPE "TipoMovimientoGarantia" AS ENUM ('RECEPCION', 'RETENCION', 'DEVOLUCION_PARCIAL', 'DEVOLUCION_TOTAL');

-- CreateTable
CREATE TABLE "pagos" (
    "id" TEXT NOT NULL,
    "reservaId" TEXT NOT NULL,
    "monto" DECIMAL(12,2) NOT NULL,
    "moneda" TEXT NOT NULL DEFAULT 'PEN',
    "concepto" "ConceptoPago" NOT NULL DEFAULT 'ADELANTO',
    "metodoPago" "MetodoPago" NOT NULL DEFAULT 'TRANSFERENCIA',
    "referenciaOperacion" TEXT NOT NULL,
    "fechaPago" DATE NOT NULL,
    "estado" "EstadoPago" NOT NULL DEFAULT 'PENDIENTE_CONCILIACION',
    "idempotencyKey" TEXT,
    "payloadHash" TEXT,
    "registradoPorId" TEXT,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "conciliadoPorId" TEXT,
    "conciliadoEn" TIMESTAMP(3),
    "motivoRechazo" TEXT,
    "rechazadoEn" TIMESTAMP(3),
    "notas" TEXT,

    CONSTRAINT "pagos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "garantias" (
    "id" TEXT NOT NULL,
    "reservaId" TEXT NOT NULL,
    "moneda" TEXT NOT NULL DEFAULT 'PEN',
    "montoTotal" DECIMAL(12,2) NOT NULL,
    "estado" "EstadoGarantia" NOT NULL DEFAULT 'EN_CUSTODIA',
    "creadaEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizadaEn" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "garantias_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "movimientos_garantia" (
    "id" TEXT NOT NULL,
    "garantiaId" TEXT NOT NULL,
    "tipo" "TipoMovimientoGarantia" NOT NULL,
    "monto" DECIMAL(12,2) NOT NULL,
    "motivo" TEXT NOT NULL,
    "documentoSoporte" TEXT,
    "actorId" TEXT,
    "idempotencyKey" TEXT,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "movimientos_garantia_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "pagos_idempotencyKey_key" ON "pagos"("idempotencyKey");

-- CreateIndex
CREATE INDEX "pagos_reservaId_idx" ON "pagos"("reservaId");

-- CreateIndex
CREATE INDEX "pagos_estado_idx" ON "pagos"("estado");

-- CreateIndex
CREATE INDEX "pagos_fechaPago_idx" ON "pagos"("fechaPago");

-- CreateIndex
CREATE INDEX "pagos_referenciaOperacion_idx" ON "pagos"("referenciaOperacion");

-- CreateIndex
CREATE UNIQUE INDEX "garantias_reservaId_key" ON "garantias"("reservaId");

-- CreateIndex
CREATE INDEX "garantias_estado_idx" ON "garantias"("estado");

-- CreateIndex
CREATE UNIQUE INDEX "movimientos_garantia_idempotencyKey_key" ON "movimientos_garantia"("idempotencyKey");

-- CreateIndex
CREATE INDEX "movimientos_garantia_garantiaId_idx" ON "movimientos_garantia"("garantiaId");

-- CreateIndex
CREATE INDEX "movimientos_garantia_tipo_idx" ON "movimientos_garantia"("tipo");

-- CreateIndex
CREATE INDEX "movimientos_garantia_creadoEn_idx" ON "movimientos_garantia"("creadoEn");

-- AddForeignKey
ALTER TABLE "pagos" ADD CONSTRAINT "pagos_reservaId_fkey" FOREIGN KEY ("reservaId") REFERENCES "reservas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pagos" ADD CONSTRAINT "pagos_registradoPorId_fkey" FOREIGN KEY ("registradoPorId") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pagos" ADD CONSTRAINT "pagos_conciliadoPorId_fkey" FOREIGN KEY ("conciliadoPorId") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "garantias" ADD CONSTRAINT "garantias_reservaId_fkey" FOREIGN KEY ("reservaId") REFERENCES "reservas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movimientos_garantia" ADD CONSTRAINT "movimientos_garantia_garantiaId_fkey" FOREIGN KEY ("garantiaId") REFERENCES "garantias"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movimientos_garantia" ADD CONSTRAINT "movimientos_garantia_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Domain constraints: strict positive monetary amounts
ALTER TABLE "pagos" ADD CONSTRAINT "pagos_monto_positivo" CHECK ("monto" > 0);
ALTER TABLE "garantias" ADD CONSTRAINT "garantias_monto_total_positivo" CHECK ("montoTotal" > 0);
ALTER TABLE "movimientos_garantia" ADD CONSTRAINT "movimientos_garantia_monto_positivo" CHECK ("monto" > 0);
