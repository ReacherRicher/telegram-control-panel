-- CreateTable
CREATE TABLE "users" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
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
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "chats" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
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
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "messages" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "telegram_message_id" INTEGER NOT NULL,
    "chat_id" INTEGER NOT NULL,
    "sender_user_id" INTEGER,
    "date" DATETIME NOT NULL,
    "text" TEXT,
    "messageType" TEXT NOT NULL DEFAULT 'TEXT',
    "mediaType" TEXT,
    "fileName" TEXT,
    "mimeType" TEXT,
    "fileSize" INTEGER,
    "hasMedia" BOOLEAN NOT NULL DEFAULT false,
    "hasLinks" BOOLEAN NOT NULL DEFAULT false,
    "replyToMessageId" INTEGER,
    "forwardFromChatId" TEXT,
    "forwardFromMsgId" INTEGER,
    "forwardFromName" TEXT,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "raw" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "messages_chat_id_fkey" FOREIGN KEY ("chat_id") REFERENCES "chats" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "messages_sender_user_id_fkey" FOREIGN KEY ("sender_user_id") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "messages_sender_user_id_fkey" FOREIGN KEY ("sender_user_id") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "media" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "message_id" INTEGER NOT NULL,
    "chat_id" INTEGER NOT NULL,
    "telegram_message_id" INTEGER NOT NULL,
    "mediaType" TEXT NOT NULL,
    "fileName" TEXT,
    "mimeType" TEXT,
    "fileSize" INTEGER,
    "downloaded" BOOLEAN NOT NULL DEFAULT false,
    "localPath" TEXT,
    "telegramFileId" TEXT,
    "telegramMetadata" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "media_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "messages" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "media_chat_id_fkey" FOREIGN KEY ("chat_id") REFERENCES "chats" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "message_links" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "message_id" INTEGER NOT NULL,
    "url" TEXT NOT NULL,
    "domain" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "message_links_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "messages" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "chat_statistics" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "chat_id" INTEGER NOT NULL,
    "totalMessages" INTEGER NOT NULL DEFAULT 0,
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
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "chat_statistics_chat_id_fkey" FOREIGN KEY ("chat_id") REFERENCES "chats" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "jobs" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
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
    CONSTRAINT "jobs_source_chat_id_fkey" FOREIGN KEY ("source_chat_id") REFERENCES "chats" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "jobs_destination_chat_id_fkey" FOREIGN KEY ("destination_chat_id") REFERENCES "chats" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "job_items" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "job_id" INTEGER NOT NULL,
    "message_id" INTEGER,
    "telegram_message_id" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "error" TEXT,
    "processedAt" DATETIME,
    CONSTRAINT "job_items_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "jobs" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "job_items_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "messages" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "location_sessions" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "deviceId" TEXT NOT NULL,
    "destination_chat_id" INTEGER,
    "destinationChatRaw" TEXT,
    "durationSeconds" INTEGER,
    "updateInterval" INTEGER NOT NULL DEFAULT 10,
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" DATETIME,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    CONSTRAINT "location_sessions_destination_chat_id_fkey" FOREIGN KEY ("destination_chat_id") REFERENCES "chats" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "location_points" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "session_id" INTEGER NOT NULL,
    "latitude" REAL NOT NULL,
    "longitude" REAL NOT NULL,
    "accuracy" REAL,
    "altitude" REAL,
    "speed" REAL,
    "heading" REAL,
    "recordedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "location_points_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "location_sessions" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "system_logs" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "action" TEXT NOT NULL,
    "details" TEXT,
    "sourceChat" TEXT,
    "destChat" TEXT,
    "itemCount" INTEGER,
    "successCount" INTEGER,
    "failCount" INTEGER,
    "ipAddress" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "settings" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "key" TEXT NOT NULL,
    "value" TEXT,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "users_telegram_user_id_key" ON "users"("telegram_user_id");

-- CreateIndex
CREATE INDEX "users_telegram_user_id_idx" ON "users"("telegram_user_id");

-- CreateIndex
CREATE INDEX "users_username_idx" ON "users"("username");

-- CreateIndex
CREATE UNIQUE INDEX "chats_telegram_chat_id_key" ON "chats"("telegram_chat_id");

-- CreateIndex
CREATE INDEX "chats_telegram_chat_id_idx" ON "chats"("telegram_chat_id");

-- CreateIndex
CREATE INDEX "chats_username_idx" ON "chats"("username");

-- CreateIndex
CREATE INDEX "chats_type_idx" ON "chats"("type");

-- CreateIndex
CREATE INDEX "messages_chat_id_idx" ON "messages"("chat_id");

-- CreateIndex
CREATE INDEX "messages_sender_user_id_idx" ON "messages"("sender_user_id");

-- CreateIndex
CREATE INDEX "messages_date_idx" ON "messages"("date");

-- CreateIndex
CREATE INDEX "messages_messageType_idx" ON "messages"("messageType");

-- CreateIndex
CREATE INDEX "messages_telegram_message_id_idx" ON "messages"("telegram_message_id");

-- CreateIndex
CREATE UNIQUE INDEX "messages_telegram_message_id_chat_id_key" ON "messages"("telegram_message_id", "chat_id");

-- CreateIndex
CREATE UNIQUE INDEX "media_message_id_key" ON "media"("message_id");

-- CreateIndex
CREATE INDEX "media_chat_id_idx" ON "media"("chat_id");

-- CreateIndex
CREATE INDEX "media_mediaType_idx" ON "media"("mediaType");

-- CreateIndex
CREATE INDEX "media_telegram_message_id_idx" ON "media"("telegram_message_id");

-- CreateIndex
CREATE INDEX "message_links_message_id_idx" ON "message_links"("message_id");

-- CreateIndex
CREATE INDEX "message_links_domain_idx" ON "message_links"("domain");

-- CreateIndex
CREATE UNIQUE INDEX "chat_statistics_chat_id_key" ON "chat_statistics"("chat_id");

-- CreateIndex
CREATE INDEX "jobs_status_idx" ON "jobs"("status");

-- CreateIndex
CREATE INDEX "jobs_type_idx" ON "jobs"("type");

-- CreateIndex
CREATE INDEX "job_items_job_id_idx" ON "job_items"("job_id");

-- CreateIndex
CREATE INDEX "job_items_status_idx" ON "job_items"("status");

-- CreateIndex
CREATE INDEX "location_points_session_id_idx" ON "location_points"("session_id");

-- CreateIndex
CREATE INDEX "location_points_recordedAt_idx" ON "location_points"("recordedAt");

-- CreateIndex
CREATE INDEX "system_logs_action_idx" ON "system_logs"("action");

-- CreateIndex
CREATE INDEX "system_logs_createdAt_idx" ON "system_logs"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "settings_key_key" ON "settings"("key");
