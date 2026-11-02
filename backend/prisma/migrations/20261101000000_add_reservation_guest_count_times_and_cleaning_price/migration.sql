-- AlterTable propiedades
ALTER TABLE "propiedades" ADD COLUMN "precioLimpieza" DECIMAL(10,2) NOT NULL DEFAULT 0.00;

-- AlterTable reservas
ALTER TABLE "reservas" ADD COLUMN "cantidadHuespedes" INTEGER;
ALTER TABLE "reservas" ADD COLUMN "horaCheckIn" TEXT;
ALTER TABLE "reservas" ADD COLUMN "horaCheckOut" TEXT;
ALTER TABLE "reservas" ADD COLUMN "precioBaseNocheSnapshot" DECIMAL(10,2);
ALTER TABLE "reservas" ADD COLUMN "precioLimpiezaSnapshot" DECIMAL(10,2);
ALTER TABLE "reservas" ADD COLUMN "subtotalSnapshot" DECIMAL(10,2);

-- Check constraints
ALTER TABLE "propiedades" ADD CONSTRAINT "propiedades_precio_limpieza_no_negativo" CHECK ("precioLimpieza" >= 0);
ALTER TABLE "reservas" ADD CONSTRAINT "reservas_cantidad_huespedes_positivo" CHECK ("cantidadHuespedes" IS NULL OR "cantidadHuespedes" > 0);
