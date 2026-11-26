/*
  Warnings:

  - Added the required column `account_id` to the `chats` table without a default value. This is not possible if the table is not empty.
  - Added the required column `account_id` to the `jobs` table without a default value. This is not possible if the table is not empty.
  - Added the required column `account_id` to the `location_sessions` table without a default value. This is not possible if the table is not empty.
  - Added the required column `account_id` to the `users` table without a default value. This is not possible if the table is not empty.

*/
-- CreateTable
CREATE TABLE "accounts" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "slug" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "phone" TEXT,
    "telegramId" TEXT,
    "firstName" TEXT,
    "lastName" TEXT,
    "username" TEXT,
    "isPremium" BOOLEAN NOT NULL DEFAULT false,
    "isVerified" BOOLEAN NOT NULL DEFAULT false,
    "sessionFile" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_chats" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "account_id" INTEGER NOT NULL,
    "telegram_chat_id" TEXT NOT NULL,
    "title" TEXT,
    "username" TEXT,
    "type" TEXT NOT NULL,
    "isPublic" BOOLEAN NOT NULL DEFAULT false,
    "isMember" BOOLEAN NOT NULL DEFAULT true,
    "isAdmin" BOOLEAN NOT NULL DEFAULT false,
    "isOwner" BOOLEAN NOT NULL DEFAULT false,
    "isCreator" BOOLEAN NOT NULL DEFAULT false,
    "accessHash" TEXT,
    "inviteLink" TEXT,
    "publicUrl" TEXT,
    "membersCount" INTEGER,
    "messageCount" INTEGER NOT NULL DEFAULT 0,
    "photoCount" INTEGER NOT NULL DEFAULT 0,
    "videoCount" INTEGER NOT NULL DEFAULT 0,
    "documentCount" INTEGER NOT NULL DEFAULT 0,
    "audioCount" INTEGER NOT NULL DEFAULT 0,
    "voiceCount" INTEGER NOT NULL DEFAULT 0,
    "gifCount" INTEGER NOT NULL DEFAULT 0,
    "stickerCount" INTEGER NOT NULL DEFAULT 0,
    "linkCount" INTEGER NOT NULL DEFAULT 0,
    "locationCount" INTEGER NOT NULL DEFAULT 0,
    "firstMessageDate" DATETIME,
    "lastMessageDate" DATETIME,
    "lastIndexedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "chats_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_chats" ("accessHash", "audioCount", "createdAt", "documentCount", "firstMessageDate", "gifCount", "id", "inviteLink", "isAdmin", "isCreator", "isMember", "isOwner", "isPublic", "lastIndexedAt", "lastMessageDate", "linkCount", "locationCount", "membersCount", "messageCount", "photoCount", "publicUrl", "stickerCount", "telegram_chat_id", "title", "type", "updatedAt", "username", "videoCount", "voiceCount") SELECT "accessHash", "audioCount", "createdAt", "documentCount", "firstMessageDate", "gifCount", "id", "inviteLink", "isAdmin", "isCreator", "isMember", "isOwner", "isPublic", "lastIndexedAt", "lastMessageDate", "linkCount", "locationCount", "membersCount", "messageCount", "photoCount", "publicUrl", "stickerCount", "telegram_chat_id", "title", "type", "updatedAt", "username", "videoCount", "voiceCount" FROM "chats";
DROP TABLE "chats";
ALTER TABLE "new_chats" RENAME TO "chats";
CREATE INDEX "chats_account_id_idx" ON "chats"("account_id");
CREATE INDEX "chats_telegram_chat_id_idx" ON "chats"("telegram_chat_id");
CREATE INDEX "chats_username_idx" ON "chats"("username");
CREATE INDEX "chats_type_idx" ON "chats"("type");
CREATE UNIQUE INDEX "chats_account_id_telegram_chat_id_key" ON "chats"("account_id", "telegram_chat_id");
CREATE TABLE "new_jobs" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "account_id" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'QUEUED',
    "source_chat_id" INTEGER,
    "destination_chat_id" INTEGER,
    "sourceChatRaw" TEXT,
    "destinationChatRaw" TEXT,
    "contentFilter" TEXT,
    "dateFrom" DATETIME,
    "dateTo" DATETIME,
    "formatOption" TEXT,
    "deletionMode" TEXT,
    "totalItems" INTEGER NOT NULL DEFAULT 0,
    "processedItems" INTEGER NOT NULL DEFAULT 0,
    "failedItems" INTEGER NOT NULL DEFAULT 0,
    "checkpoint" TEXT,
    "outputPath" TEXT,
    "error" TEXT,
    "startedAt" DATETIME,
    "completedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "jobs_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "jobs_source_chat_id_fkey" FOREIGN KEY ("source_chat_id") REFERENCES "chats" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "jobs_destination_chat_id_fkey" FOREIGN KEY ("destination_chat_id") REFERENCES "chats" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_jobs" ("checkpoint", "completedAt", "contentFilter", "createdAt", "dateFrom", "dateTo", "deletionMode", "destinationChatRaw", "destination_chat_id", "error", "failedItems", "formatOption", "id", "outputPath", "processedItems", "sourceChatRaw", "source_chat_id", "startedAt", "status", "totalItems", "type", "updatedAt") SELECT "checkpoint", "completedAt", "contentFilter", "createdAt", "dateFrom", "dateTo", "deletionMode", "destinationChatRaw", "destination_chat_id", "error", "failedItems", "formatOption", "id", "outputPath", "processedItems", "sourceChatRaw", "source_chat_id", "startedAt", "status", "totalItems", "type", "updatedAt" FROM "jobs";
DROP TABLE "jobs";
ALTER TABLE "new_jobs" RENAME TO "jobs";
CREATE INDEX "jobs_account_id_idx" ON "jobs"("account_id");
CREATE INDEX "jobs_status_idx" ON "jobs"("status");
CREATE INDEX "jobs_type_idx" ON "jobs"("type");
CREATE TABLE "new_location_sessions" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "account_id" INTEGER NOT NULL,
    "deviceId" TEXT NOT NULL,
    "destination_chat_id" INTEGER,
    "destinationChatRaw" TEXT,
    "durationSeconds" INTEGER,
    "updateInterval" INTEGER NOT NULL DEFAULT 10,
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" DATETIME,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    CONSTRAINT "location_sessions_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "location_sessions_destination_chat_id_fkey" FOREIGN KEY ("destination_chat_id") REFERENCES "chats" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_location_sessions" ("destinationChatRaw", "destination_chat_id", "deviceId", "durationSeconds", "endedAt", "id", "startedAt", "status", "updateInterval") SELECT "destinationChatRaw", "destination_chat_id", "deviceId", "durationSeconds", "endedAt", "id", "startedAt", "status", "updateInterval" FROM "location_sessions";
DROP TABLE "location_sessions";
ALTER TABLE "new_location_sessions" RENAME TO "location_sessions";
CREATE TABLE "new_system_logs" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "account_id" INTEGER,
    "action" TEXT NOT NULL,
    "details" TEXT,
    "sourceChat" TEXT,
    "destChat" TEXT,
    "itemCount" INTEGER,
    "successCount" INTEGER,
    "failCount" INTEGER,
    "ipAddress" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "system_logs_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_system_logs" ("action", "createdAt", "destChat", "details", "failCount", "id", "ipAddress", "itemCount", "sourceChat", "successCount") SELECT "action", "createdAt", "destChat", "details", "failCount", "id", "ipAddress", "itemCount", "sourceChat", "successCount" FROM "system_logs";
DROP TABLE "system_logs";
ALTER TABLE "new_system_logs" RENAME TO "system_logs";
CREATE INDEX "system_logs_account_id_idx" ON "system_logs"("account_id");
CREATE INDEX "system_logs_action_idx" ON "system_logs"("action");
CREATE INDEX "system_logs_createdAt_idx" ON "system_logs"("createdAt");
CREATE TABLE "new_users" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "account_id" INTEGER NOT NULL,
    "telegram_user_id" TEXT NOT NULL,
    "firstName" TEXT,
    "lastName" TEXT,
    "username" TEXT,
    "phone" TEXT,
    "isPremium" BOOLEAN NOT NULL DEFAULT false,
    "isVerified" BOOLEAN NOT NULL DEFAULT false,
    "isBot" BOOLEAN NOT NULL DEFAULT false,
    "accessHash" TEXT,
    "messageCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "users_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_users" ("accessHash", "createdAt", "firstName", "id", "isBot", "isPremium", "isVerified", "lastName", "messageCount", "phone", "telegram_user_id", "updatedAt", "username") SELECT "accessHash", "createdAt", "firstName", "id", "isBot", "isPremium", "isVerified", "lastName", "messageCount", "phone", "telegram_user_id", "updatedAt", "username" FROM "users";
DROP TABLE "users";
ALTER TABLE "new_users" RENAME TO "users";
CREATE INDEX "users_account_id_idx" ON "users"("account_id");
CREATE INDEX "users_telegram_user_id_idx" ON "users"("telegram_user_id");
CREATE INDEX "users_username_idx" ON "users"("username");
CREATE UNIQUE INDEX "users_account_id_telegram_user_id_key" ON "users"("account_id", "telegram_user_id");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "accounts_slug_key" ON "accounts"("slug");

-- CreateIndex
CREATE INDEX "accounts_slug_idx" ON "accounts"("slug");
