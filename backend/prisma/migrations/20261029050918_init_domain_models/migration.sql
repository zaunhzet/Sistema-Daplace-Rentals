-- CreateEnum
CREATE TYPE "RolUsuario" AS ENUM ('ADMIN', 'OPERADOR', 'PROPIETARIO');

-- CreateEnum
CREATE TYPE "EstadoOperativo" AS ENUM ('OPERATIVA', 'EN_MANTENIMIENTO', 'INACTIVA');

-- CreateEnum
CREATE TYPE "EstadoPublicacion" AS ENUM ('PUBLICADA', 'BORRADOR', 'PAUSADA');

-- CreateEnum
CREATE TYPE "TipoDocumento" AS ENUM ('DNI', 'PASAPORTE', 'CARNET_EXTRANJERIA', 'OTRO');

-- CreateEnum
CREATE TYPE "EstadoReserva" AS ENUM ('SOLICITADA', 'CONFIRMADA', 'COMPLETADA', 'CANCELADA');

-- CreateEnum
CREATE TYPE "OrigenReserva" AS ENUM ('WEB', 'DIRECTO', 'AIRBNB');

-- CreateTable
CREATE TABLE "usuarios" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "telefono" TEXT,
    "rol" "RolUsuario" NOT NULL DEFAULT 'PROPIETARIO',
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizadoEn" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "usuarios_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "propiedades" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "propietarioId" TEXT NOT NULL,
    "direccion" TEXT NOT NULL,
    "estadoOperativo" "EstadoOperativo" NOT NULL DEFAULT 'OPERATIVA',
    "estadoPublicacion" "EstadoPublicacion" NOT NULL DEFAULT 'BORRADOR',
    "activa" BOOLEAN NOT NULL DEFAULT true,
    "capacidadHuespedes" INTEGER NOT NULL DEFAULT 2,
    "precioBaseNoche" DECIMAL(10,2) NOT NULL DEFAULT 200.00,
    "moneda" TEXT NOT NULL DEFAULT 'PEN',
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizadoEn" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "propiedades_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "huespedes" (
    "id" TEXT NOT NULL,
    "nombreCompleto" TEXT NOT NULL,
    "telefono" TEXT,
    "email" TEXT,
    "tipoDocumento" "TipoDocumento",
    "numeroDocumento" TEXT,
    "nacionalidad" TEXT,
    "notas" TEXT,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizadoEn" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "huespedes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reservas" (
    "id" TEXT NOT NULL,
    "propiedadId" TEXT NOT NULL,
    "huespedId" TEXT NOT NULL,
    "ingreso" DATE NOT NULL,
    "salida" DATE NOT NULL,
    "noches" INTEGER NOT NULL,
    "estado" "EstadoReserva" NOT NULL DEFAULT 'SOLICITADA',
    "montoAcordado" DECIMAL(10,2) NOT NULL,
    "moneda" TEXT NOT NULL DEFAULT 'PEN',
    "origen" "OrigenReserva" NOT NULL DEFAULT 'WEB',
    "referenciaCanal" TEXT,
    "notas" TEXT,
    "motivoCancelacion" TEXT,
    "creadaEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizadaEn" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reservas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auditoria_eventos" (
    "id" TEXT NOT NULL,
    "entidad" TEXT NOT NULL,
    "entidadId" TEXT NOT NULL,
    "accion" TEXT NOT NULL,
    "actor" TEXT NOT NULL DEFAULT 'SYSTEM_DEV',
    "motivo" TEXT,
    "detalles" JSONB,
    "requestId" TEXT,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "auditoria_eventos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "usuarios_email_key" ON "usuarios"("email");

-- CreateIndex
CREATE INDEX "propiedades_propietarioId_idx" ON "propiedades"("propietarioId");

-- CreateIndex
CREATE INDEX "propiedades_estadoOperativo_activa_idx" ON "propiedades"("estadoOperativo", "activa");

-- CreateIndex
CREATE INDEX "huespedes_email_idx" ON "huespedes"("email");

-- CreateIndex
CREATE INDEX "huespedes_telefono_idx" ON "huespedes"("telefono");

-- CreateIndex
CREATE INDEX "huespedes_numeroDocumento_idx" ON "huespedes"("numeroDocumento");

-- CreateIndex
CREATE INDEX "reservas_propiedadId_ingreso_salida_idx" ON "reservas"("propiedadId", "ingreso", "salida");

-- CreateIndex
CREATE INDEX "reservas_huespedId_idx" ON "reservas"("huespedId");

-- CreateIndex
CREATE INDEX "reservas_estado_idx" ON "reservas"("estado");

-- CreateIndex
CREATE INDEX "auditoria_eventos_entidad_entidadId_idx" ON "auditoria_eventos"("entidad", "entidadId");

-- CreateIndex
CREATE INDEX "auditoria_eventos_creadoEn_idx" ON "auditoria_eventos"("creadoEn");

-- AddForeignKey
ALTER TABLE "propiedades" ADD CONSTRAINT "propiedades_propietarioId_fkey" FOREIGN KEY ("propietarioId") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservas" ADD CONSTRAINT "reservas_propiedadId_fkey" FOREIGN KEY ("propiedadId") REFERENCES "propiedades"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservas" ADD CONSTRAINT "reservas_huespedId_fkey" FOREIGN KEY ("huespedId") REFERENCES "huespedes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Enable btree_gist for exclusion constraint over scalar + range
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- Critical Business Invariant: PostgreSQL Exclusion Constraint for semi-open date ranges [ingreso, salida)
-- Prevents overlapping reservations on the same property for active states (SOLICITADA, CONFIRMADA, COMPLETADA).
-- When a reservation is CANCELLED, it does not index and frees availability automatically.
ALTER TABLE "reservas"
ADD CONSTRAINT "reservas_no_overlapping_excl"
EXCLUDE USING gist (
    "propiedadId" WITH =,
    daterange("ingreso", "salida", '[)') WITH &&
)
WHERE ("estado" IN ('CONFIRMADA', 'SOLICITADA', 'COMPLETADA'));

-- Check constraints for domain validation
ALTER TABLE "reservas"
ADD CONSTRAINT "reservas_salida_after_ingreso"
CHECK ("salida" > "ingreso");

ALTER TABLE "reservas"
ADD CONSTRAINT "reservas_noches_positivas"
CHECK ("noches" > 0);

ALTER TABLE "reservas"
ADD CONSTRAINT "reservas_monto_positivo"
CHECK ("montoAcordado" > 0);

ALTER TABLE "propiedades"
ADD CONSTRAINT "propiedades_precio_positivo"
CHECK ("precioBaseNoche" > 0);

ALTER TABLE "propiedades"
ADD CONSTRAINT "propiedades_capacidad_positiva"
CHECK ("capacidadHuespedes" > 0);

ALTER TABLE "huespedes"
ADD CONSTRAINT "huespedes_contacto_requerido"
CHECK ("telefono" IS NOT NULL OR "email" IS NOT NULL);
