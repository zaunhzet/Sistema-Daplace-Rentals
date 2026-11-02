-- Create sequences for sequential human-readable codes
CREATE SEQUENCE IF NOT EXISTS propiedad_codigo_seq START WITH 1 INCREMENT BY 1;
CREATE SEQUENCE IF NOT EXISTS huesped_codigo_seq START WITH 1 INCREMENT BY 1;
CREATE SEQUENCE IF NOT EXISTS reserva_codigo_seq START WITH 1 INCREMENT BY 1;

-- Add column codigo to propiedades, huespedes, reservas
ALTER TABLE "propiedades" ADD COLUMN IF NOT EXISTS "codigo" TEXT;
ALTER TABLE "huespedes" ADD COLUMN IF NOT EXISTS "codigo" TEXT;
ALTER TABLE "reservas" ADD COLUMN IF NOT EXISTS "codigo" TEXT;

-- Backfill existing propiedades with PRP-XXXXXX
WITH numbered_props AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY "creadoEn" ASC, id ASC) as rn
  FROM "propiedades"
  WHERE "codigo" IS NULL
)
UPDATE "propiedades" p
SET "codigo" = 'PRP-' || LPAD(numbered_props.rn::text, 6, '0')
FROM numbered_props
WHERE p.id = numbered_props.id AND p."codigo" IS NULL;

SELECT setval('propiedad_codigo_seq', COALESCE((
  SELECT MAX(NULLIF(regexp_replace("codigo", '^PRP-', ''), '')::bigint)
  FROM "propiedades" WHERE "codigo" ~ '^PRP-[0-9]+$'
), 0) + 1, false);

-- Backfill existing huespedes with HSP-XXXXXX
WITH numbered_guests AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY "creadoEn" ASC, id ASC) as rn
  FROM "huespedes"
  WHERE "codigo" IS NULL
)
UPDATE "huespedes" h
SET "codigo" = 'HSP-' || LPAD(numbered_guests.rn::text, 6, '0')
FROM numbered_guests
WHERE h.id = numbered_guests.id AND h."codigo" IS NULL;

SELECT setval('huesped_codigo_seq', COALESCE((
  SELECT MAX(NULLIF(regexp_replace("codigo", '^HSP-', ''), '')::bigint)
  FROM "huespedes" WHERE "codigo" ~ '^HSP-[0-9]+$'
), 0) + 1, false);

-- Backfill existing reservas with RSV-XXXXXX
WITH numbered_res AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY "creadaEn" ASC, id ASC) as rn
  FROM "reservas"
  WHERE "codigo" IS NULL
)
UPDATE "reservas" r
SET "codigo" = 'RSV-' || LPAD(numbered_res.rn::text, 6, '0')
FROM numbered_res
WHERE r.id = numbered_res.id AND r."codigo" IS NULL;

SELECT setval('reserva_codigo_seq', COALESCE((
  SELECT MAX(NULLIF(regexp_replace("codigo", '^RSV-', ''), '')::bigint)
  FROM "reservas" WHERE "codigo" ~ '^RSV-[0-9]+$'
), 0) + 1, false);

-- Set column defaults using the sequences
ALTER TABLE "propiedades" ALTER COLUMN "codigo" SET DEFAULT ('PRP-' || LPAD(nextval('propiedad_codigo_seq')::text, 6, '0'));
ALTER TABLE "huespedes" ALTER COLUMN "codigo" SET DEFAULT ('HSP-' || LPAD(nextval('huesped_codigo_seq')::text, 6, '0'));
ALTER TABLE "reservas" ALTER COLUMN "codigo" SET DEFAULT ('RSV-' || LPAD(nextval('reserva_codigo_seq')::text, 6, '0'));

-- Create unique indexes
CREATE UNIQUE INDEX IF NOT EXISTS "propiedades_codigo_key" ON "propiedades"("codigo");
CREATE UNIQUE INDEX IF NOT EXISTS "huespedes_codigo_key" ON "huespedes"("codigo");
CREATE UNIQUE INDEX IF NOT EXISTS "reservas_codigo_key" ON "reservas"("codigo");
