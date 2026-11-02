-- Create sequence for sequential human-readable owner codes
CREATE SEQUENCE IF NOT EXISTS propietario_codigo_seq START WITH 1 INCREMENT BY 1;

-- Add column codigo to usuarios
ALTER TABLE "usuarios" ADD COLUMN IF NOT EXISTS "codigo" TEXT;

-- Backfill existing PROPIETARIO usuarios with PRO-XXXXXX
WITH numbered_owners AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY "creadoEn" ASC, id ASC) as rn
  FROM "usuarios"
  WHERE "rol" = 'PROPIETARIO' AND "codigo" IS NULL
)
UPDATE "usuarios" u
SET "codigo" = 'PRO-' || LPAD(numbered_owners.rn::text, 6, '0')
FROM numbered_owners
WHERE u.id = numbered_owners.id AND u."codigo" IS NULL;

SELECT setval('propietario_codigo_seq', COALESCE((
  SELECT MAX(NULLIF(regexp_replace("codigo", '^PRO-', ''), '')::bigint)
  FROM "usuarios" WHERE "codigo" ~ '^PRO-[0-9]+$'
), 0) + 1, false);

-- Trigger to auto-generate PRO-XXXXXX on INSERT or UPDATE if rol is PROPIETARIO and codigo is NULL
CREATE OR REPLACE FUNCTION set_propietario_codigo()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW."rol" = 'PROPIETARIO' AND NEW."codigo" IS NULL THEN
    NEW."codigo" := 'PRO-' || LPAD(nextval('propietario_codigo_seq')::text, 6, '0');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_set_propietario_codigo ON "usuarios";
CREATE TRIGGER trigger_set_propietario_codigo
BEFORE INSERT OR UPDATE ON "usuarios"
FOR EACH ROW
EXECUTE FUNCTION set_propietario_codigo();

-- Create unique index
CREATE UNIQUE INDEX IF NOT EXISTS "usuarios_codigo_key" ON "usuarios"("codigo");
