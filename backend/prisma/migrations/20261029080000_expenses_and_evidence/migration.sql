-- CreateEnum
CREATE TYPE "EstadoGasto" AS ENUM ('REGISTRADO', 'APROBADO', 'ANULADO');

-- CreateTable
CREATE TABLE "gastos" (
    "id" TEXT NOT NULL,
    "propiedadId" TEXT NOT NULL,
    "fechaGasto" DATE NOT NULL,
    "periodoMes" INTEGER NOT NULL,
    "periodoAnio" INTEGER NOT NULL,
    "titulo" TEXT NOT NULL,
    "categoria" TEXT NOT NULL,
    "notas" TEXT,
    "monto" DECIMAL(12,2) NOT NULL,
    "moneda" TEXT NOT NULL DEFAULT 'PEN',
    "pagadoPor" TEXT NOT NULL,
    "repartido" TEXT,
    "usoRucDaplace" BOOLEAN,
    "estado" "EstadoGasto" NOT NULL DEFAULT 'REGISTRADO',
    "idempotencyKey" TEXT,
    "registradoPorId" TEXT,
    "aprobadoPorId" TEXT,
    "aprobadoEn" TIMESTAMP(3),
    "anuladoPorId" TEXT,
    "anuladoEn" TIMESTAMP(3),
    "motivoAnulacion" TEXT,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizadoEn" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "gastos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sustentos_gasto" (
    "id" TEXT NOT NULL,
    "gastoId" TEXT NOT NULL,
    "tipo" TEXT NOT NULL DEFAULT 'COMPROBANTE',
    "nombreArchivo" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "origen" TEXT DEFAULT 'MANUAL',
    "registradoPorId" TEXT,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sustentos_gasto_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "gastos_idempotencyKey_key" ON "gastos"("idempotencyKey");

-- CreateIndex
CREATE INDEX "gastos_propiedadId_idx" ON "gastos"("propiedadId");

-- CreateIndex
CREATE INDEX "gastos_fechaGasto_idx" ON "gastos"("fechaGasto");

-- CreateIndex
CREATE INDEX "gastos_periodoAnio_periodoMes_idx" ON "gastos"("periodoAnio", "periodoMes");

-- CreateIndex
CREATE INDEX "gastos_categoria_idx" ON "gastos"("categoria");

-- CreateIndex
CREATE INDEX "gastos_estado_idx" ON "gastos"("estado");

-- CreateIndex
CREATE INDEX "sustentos_gasto_gastoId_idx" ON "sustentos_gasto"("gastoId");

-- AddForeignKey
ALTER TABLE "gastos" ADD CONSTRAINT "gastos_propiedadId_fkey" FOREIGN KEY ("propiedadId") REFERENCES "propiedades"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gastos" ADD CONSTRAINT "gastos_registradoPorId_fkey" FOREIGN KEY ("registradoPorId") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gastos" ADD CONSTRAINT "gastos_aprobadoPorId_fkey" FOREIGN KEY ("aprobadoPorId") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gastos" ADD CONSTRAINT "gastos_anuladoPorId_fkey" FOREIGN KEY ("anuladoPorId") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sustentos_gasto" ADD CONSTRAINT "sustentos_gasto_gastoId_fkey" FOREIGN KEY ("gastoId") REFERENCES "gastos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sustentos_gasto" ADD CONSTRAINT "sustentos_gasto_registradoPorId_fkey" FOREIGN KEY ("registradoPorId") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Domain constraints: strict positive monetary amounts and valid periods
ALTER TABLE "gastos" ADD CONSTRAINT "gastos_monto_positivo" CHECK ("monto" > 0);
ALTER TABLE "gastos" ADD CONSTRAINT "gastos_periodo_mes_valido" CHECK ("periodoMes" >= 1 AND "periodoMes" <= 12);
ALTER TABLE "gastos" ADD CONSTRAINT "gastos_periodo_anio_valido" CHECK ("periodoAnio" >= 2000 AND "periodoAnio" <= 2100);
