-- CreateEnum
CREATE TYPE "TipoTrabajoMantenimiento" AS ENUM ('LIMPIEZA', 'REPARACION', 'INSPECCION', 'PINTURA', 'OTRO');

-- CreateEnum
CREATE TYPE "PrioridadTrabajo" AS ENUM ('BAJA', 'MEDIA', 'ALTA', 'URGENTE');

-- CreateEnum
CREATE TYPE "EstadoOrdenTrabajo" AS ENUM ('PENDIENTE', 'EN_PROGRESO', 'COMPLETADA', 'CANCELADA');

-- CreateTable
CREATE TABLE "ordenes_trabajo" (
    "id" TEXT NOT NULL,
    "propiedadId" TEXT NOT NULL,
    "reservaId" TEXT,
    "titulo" TEXT NOT NULL,
    "descripcion" TEXT NOT NULL,
    "tipo" "TipoTrabajoMantenimiento" NOT NULL DEFAULT 'INSPECCION',
    "prioridad" "PrioridadTrabajo" NOT NULL DEFAULT 'MEDIA',
    "estado" "EstadoOrdenTrabajo" NOT NULL DEFAULT 'PENDIENTE',
    "asignadoAId" TEXT,
    "costoEstimado" DECIMAL(10,2),
    "costoReal" DECIMAL(10,2),
    "notasResolucion" TEXT,
    "creadoPorId" TEXT NOT NULL,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizadoEn" TIMESTAMP(3) NOT NULL,
    "completadoEn" TIMESTAMP(3),

    CONSTRAINT "ordenes_trabajo_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ordenes_trabajo_propiedadId_idx" ON "ordenes_trabajo"("propiedadId");

-- CreateIndex
CREATE INDEX "ordenes_trabajo_reservaId_idx" ON "ordenes_trabajo"("reservaId");

-- CreateIndex
CREATE INDEX "ordenes_trabajo_asignadoAId_idx" ON "ordenes_trabajo"("asignadoAId");

-- CreateIndex
CREATE INDEX "ordenes_trabajo_estado_idx" ON "ordenes_trabajo"("estado");

-- AddForeignKey
ALTER TABLE "ordenes_trabajo" ADD CONSTRAINT "ordenes_trabajo_propiedadId_fkey" FOREIGN KEY ("propiedadId") REFERENCES "propiedades"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ordenes_trabajo" ADD CONSTRAINT "ordenes_trabajo_reservaId_fkey" FOREIGN KEY ("reservaId") REFERENCES "reservas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ordenes_trabajo" ADD CONSTRAINT "ordenes_trabajo_asignadoAId_fkey" FOREIGN KEY ("asignadoAId") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ordenes_trabajo" ADD CONSTRAINT "ordenes_trabajo_creadoPorId_fkey" FOREIGN KEY ("creadoPorId") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
