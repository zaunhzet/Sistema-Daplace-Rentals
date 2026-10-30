-- AlterTable
ALTER TABLE "users" ADD COLUMN "usuarioId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "users_usuarioId_key" ON "users"("usuarioId");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
