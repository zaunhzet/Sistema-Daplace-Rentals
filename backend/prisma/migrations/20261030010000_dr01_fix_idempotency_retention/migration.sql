-- AlterTable
ALTER TABLE "evidencias_pago" ADD COLUMN "idempotencyKey" TEXT,
ADD COLUMN "payloadHash" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "evidencias_pago_pagoId_idempotencyKey_key" ON "evidencias_pago"("pagoId", "idempotencyKey");

-- DropForeignKey
ALTER TABLE "evidencias_pago" DROP CONSTRAINT IF EXISTS "evidencias_pago_pagoId_fkey";

-- AddForeignKey
ALTER TABLE "evidencias_pago" ADD CONSTRAINT "evidencias_pago_pagoId_fkey" FOREIGN KEY ("pagoId") REFERENCES "pagos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
