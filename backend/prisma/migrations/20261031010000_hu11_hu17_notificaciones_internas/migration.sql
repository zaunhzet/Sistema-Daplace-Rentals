-- CreateEnum
CREATE TYPE "TipoNotificacionInterna" AS ENUM ('NUEVA_RESERVA', 'ORDEN_TRABAJO_ASIGNADA');

-- CreateEnum
CREATE TYPE "EstadoNotificacionInterna" AS ENUM ('PENDIENTE', 'LEIDA', 'ATENDIDA');

-- CreateTable
CREATE TABLE "notificaciones_internas" (
    "id" TEXT NOT NULL,
    "tipo" "TipoNotificacionInterna" NOT NULL,
    "estado" "EstadoNotificacionInterna" NOT NULL DEFAULT 'PENDIENTE',
    "titulo" TEXT NOT NULL,
    "mensaje" TEXT NOT NULL,
    "usuarioId" TEXT,
    "reservaId" TEXT,
    "ordenTrabajoId" TEXT,
    "propiedadId" TEXT,
    "idempotencyKey" TEXT,
    "metadata" JSONB,
    "leidaEn" TIMESTAMPTZ(3),
    "atendidaEn" TIMESTAMPTZ(3),
    "creadoEn" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizadoEn" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "notificaciones_internas_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "notificaciones_internas_idempotencyKey_key" ON "notificaciones_internas"("idempotencyKey");

-- CreateIndex
CREATE INDEX "notificaciones_internas_usuarioId_idx" ON "notificaciones_internas"("usuarioId");

-- CreateIndex
CREATE INDEX "notificaciones_internas_tipo_estado_idx" ON "notificaciones_internas"("tipo", "estado");

-- CreateIndex
CREATE INDEX "notificaciones_internas_creadoEn_idx" ON "notificaciones_internas"("creadoEn");

-- CreateIndex
CREATE INDEX "notificaciones_internas_reservaId_idx" ON "notificaciones_internas"("reservaId");

-- CreateIndex
CREATE INDEX "notificaciones_internas_ordenTrabajoId_idx" ON "notificaciones_internas"("ordenTrabajoId");

-- AddForeignKey
ALTER TABLE "notificaciones_internas" ADD CONSTRAINT "notificaciones_internas_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notificaciones_internas" ADD CONSTRAINT "notificaciones_internas_reservaId_fkey" FOREIGN KEY ("reservaId") REFERENCES "reservas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notificaciones_internas" ADD CONSTRAINT "notificaciones_internas_ordenTrabajoId_fkey" FOREIGN KEY ("ordenTrabajoId") REFERENCES "ordenes_trabajo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notificaciones_internas" ADD CONSTRAINT "notificaciones_internas_propiedadId_fkey" FOREIGN KEY ("propiedadId") REFERENCES "propiedades"("id") ON DELETE CASCADE ON UPDATE CASCADE;
