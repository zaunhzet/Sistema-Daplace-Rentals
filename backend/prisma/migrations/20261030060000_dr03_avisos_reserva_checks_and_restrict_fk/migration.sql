-- AlterTable: add proximoIntentoEn
ALTER TABLE "avisos_reserva"
  ADD COLUMN "proximoIntentoEn" TIMESTAMPTZ(3);

-- CreateIndex
CREATE INDEX "avisos_reserva_estado_proximoIntentoEn_idx"
  ON "avisos_reserva"("estado", "proximoIntentoEn");

-- UpdateForeignKey to ON DELETE RESTRICT
ALTER TABLE "avisos_reserva"
  DROP CONSTRAINT "avisos_reserva_reservaId_fkey";

ALTER TABLE "avisos_reserva"
  ADD CONSTRAINT "avisos_reserva_reservaId_fkey"
  FOREIGN KEY ("reservaId") REFERENCES "reservas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Check Constraints for avisos_reserva integrity
-- 1. reintentos >= 0
ALTER TABLE "avisos_reserva"
  ADD CONSTRAINT "avisos_reserva_reintentos_no_negativo"
  CHECK ("reintentos" >= 0);

-- 2. maxReintentos > 0
ALTER TABLE "avisos_reserva"
  ADD CONSTRAINT "avisos_reserva_max_reintentos_positivo"
  CHECK ("maxReintentos" > 0);

-- 3. EN_ENVIO exige leaseToken y leaseVenceEn
ALTER TABLE "avisos_reserva"
  ADD CONSTRAINT "avisos_reserva_en_envio_exige_lease"
  CHECK ("estado" != 'EN_ENVIO' OR ("leaseToken" IS NOT NULL AND "leaseVenceEn" IS NOT NULL));

-- 4. Estados diferentes de EN_ENVIO no conservan lease activo
ALTER TABLE "avisos_reserva"
  ADD CONSTRAINT "avisos_reserva_no_en_envio_sin_lease"
  CHECK ("estado" = 'EN_ENVIO' OR ("leaseToken" IS NULL AND "leaseVenceEn" IS NULL));

-- 5. ENVIADO exige enviadoEn
ALTER TABLE "avisos_reserva"
  ADD CONSTRAINT "avisos_reserva_enviado_exige_enviado_en"
  CHECK ("estado" != 'ENVIADO' OR "enviadoEn" IS NOT NULL);

-- 6. CANCELADO exige canceladoEn
ALTER TABLE "avisos_reserva"
  ADD CONSTRAINT "avisos_reserva_cancelado_exige_cancelado_en"
  CHECK ("estado" != 'CANCELADO' OR "canceladoEn" IS NOT NULL);

-- 7. Preaviso debe programarse antes del vencimiento registrado
ALTER TABLE "avisos_reserva"
  ADD CONSTRAINT "avisos_reserva_preaviso_antes_vence"
  CHECK ("tipoAviso" != 'EXPIRACION_PROXIMA' OR "programadoPara" < "venceEnSnapshot");
