-- AlterTable
ALTER TABLE "jobs" ADD COLUMN "options" TEXT;
ALTER TABLE "jobs" ADD COLUMN "note" TEXT;

-- AlterTable
ALTER TABLE "location_sessions" ADD COLUMN "device_token" TEXT;
ALTER TABLE "location_sessions" ADD COLUMN "telegram_message_id" INTEGER;

-- CreateIndex
CREATE UNIQUE INDEX "location_sessions_device_token_key" ON "location_sessions"("device_token");
