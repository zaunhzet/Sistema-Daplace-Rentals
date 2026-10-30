-- AlterTable
ALTER TABLE "reservas"
  ADD COLUMN "plazoIniciadoEn" TIMESTAMPTZ(3),
  ADD COLUMN "venceEn" TIMESTAMPTZ(3),
  ADD COLUMN "politicaPlazoVersion" TEXT,
  ADD COLUMN "politicaPlazoSnapshot" JSONB,
  ADD COLUMN "avisoProgramadoEn" TIMESTAMPTZ(3),
  ADD COLUMN "expiradaEn" TIMESTAMPTZ(3);

-- CreateIndex
CREATE INDEX "reservas_venceEn_idx" ON "reservas"("venceEn");
CREATE INDEX "reservas_estado_venceEn_idx" ON "reservas"("estado", "venceEn");
CREATE INDEX "reservas_avisoProgramadoEn_idx" ON "reservas"("avisoProgramadoEn");

-- Check constraints for expiration integrity
-- 1. Plazo totalmente nulo o completo
ALTER TABLE "reservas"
  ADD CONSTRAINT "reservas_plazo_completo_o_nulo"
  CHECK (
    ("plazoIniciadoEn" IS NULL AND "venceEn" IS NULL AND "politicaPlazoVersion" IS NULL AND "politicaPlazoSnapshot" IS NULL) OR
    ("plazoIniciadoEn" IS NOT NULL AND "venceEn" IS NOT NULL AND "politicaPlazoVersion" IS NOT NULL AND "politicaPlazoSnapshot" IS NOT NULL)
  );

-- 2. venceEn > plazoIniciadoEn
ALTER TABLE "reservas"
  ADD CONSTRAINT "reservas_vence_after_iniciado"
  CHECK ("plazoIniciadoEn" IS NULL OR "venceEn" > "plazoIniciadoEn");

-- 3. Aviso programado dentro del intervalo permitido: [plazoIniciadoEn, venceEn)
ALTER TABLE "reservas"
  ADD CONSTRAINT "reservas_aviso_en_intervalo"
  CHECK ("avisoProgramadoEn" IS NULL OR ("plazoIniciadoEn" IS NOT NULL AND "avisoProgramadoEn" >= "plazoIniciadoEn" AND "avisoProgramadoEn" < "venceEn"));

-- 4. EXPIRADA exige expiradaEn >= venceEn
ALTER TABLE "reservas"
  ADD CONSTRAINT "reservas_expirada_requiere_expirada_en"
  CHECK ("estado" != 'EXPIRADA' OR ("expiradaEn" IS NOT NULL AND "venceEn" IS NOT NULL AND "expiradaEn" >= "venceEn"));

-- 5. Estados diferentes de EXPIRADA no tienen expiradaEn
ALTER TABLE "reservas"
  ADD CONSTRAINT "reservas_no_expirada_sin_expirada_en"
  CHECK ("estado" = 'EXPIRADA' OR "expiradaEn" IS NULL);

-- 6. Unicidad lógica de auditoría para EXPIRAR_SOLICITUD_RESERVA
CREATE UNIQUE INDEX "auditoria_eventos_unica_expiracion_reserva"
  ON "auditoria_eventos"("entidadId", "accion")
  WHERE "accion" = 'EXPIRAR_SOLICITUD_RESERVA';
