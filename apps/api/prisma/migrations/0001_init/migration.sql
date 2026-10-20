-- CreateTable
CREATE TABLE "Tenant" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "locale" TEXT NOT NULL DEFAULT 'pt-BR',
    "timezone" TEXT NOT NULL DEFAULT 'America/Sao_Paulo',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "settings" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Tenant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'agent',
    "locale" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "extensionId" TEXT,
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RefreshToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "RefreshToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Trunk" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "authMode" TEXT NOT NULL DEFAULT 'register',
    "host" TEXT NOT NULL,
    "port" INTEGER NOT NULL DEFAULT 5060,
    "transport" TEXT NOT NULL DEFAULT 'udp',
    "username" TEXT,
    "password" TEXT,
    "fromDomain" TEXT,
    "fromUser" TEXT,
    "outboundCallerId" TEXT,
    "codecs" TEXT[] DEFAULT ARRAY['ulaw', 'alaw']::TEXT[],
    "maxChannels" INTEGER NOT NULL DEFAULT 0,
    "stripDigits" INTEGER NOT NULL DEFAULT 0,
    "prependDigits" TEXT NOT NULL DEFAULT '',
    "dids" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "allowedIps" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "qualify" BOOLEAN NOT NULL DEFAULT true,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "lastStatus" TEXT,
    "lastStatusAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Trunk_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Extension" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'sip',
    "secret" TEXT NOT NULL,
    "codecs" TEXT[] DEFAULT ARRAY['ulaw', 'alaw', 'opus']::TEXT[],
    "callerId" TEXT,
    "record" BOOLEAN NOT NULL DEFAULT false,
    "voicemail" BOOLEAN NOT NULL DEFAULT false,
    "voicemailEmail" TEXT,
    "outboundRouteId" TEXT,
    "maxContacts" INTEGER NOT NULL DEFAULT 3,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "lastStatus" TEXT,
    "lastStatusAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Extension_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InboundRoute" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "trunkId" TEXT,
    "did" TEXT NOT NULL DEFAULT '_X.',
    "destinationType" TEXT NOT NULL DEFAULT 'ivr',
    "flowId" TEXT,
    "extensionNumber" TEXT,
    "queueName" TEXT,
    "record" BOOLEAN NOT NULL DEFAULT true,
    "priority" INTEGER NOT NULL DEFAULT 100,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InboundRoute_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OutboundRoute" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "pattern" TEXT NOT NULL,
    "trunkId" TEXT NOT NULL,
    "stripDigits" INTEGER NOT NULL DEFAULT 0,
    "prependDigits" TEXT NOT NULL DEFAULT '',
    "callerId" TEXT,
    "priority" INTEGER NOT NULL DEFAULT 100,
    "record" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OutboundRoute_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Queue" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "strategy" TEXT NOT NULL DEFAULT 'rrmemory',
    "timeoutSec" INTEGER NOT NULL DEFAULT 20,
    "retrySec" INTEGER NOT NULL DEFAULT 3,
    "wrapupSec" INTEGER NOT NULL DEFAULT 5,
    "maxLen" INTEGER NOT NULL DEFAULT 0,
    "musicClass" TEXT NOT NULL DEFAULT 'default',
    "announcePosition" BOOLEAN NOT NULL DEFAULT true,
    "announceHoldtime" BOOLEAN NOT NULL DEFAULT true,
    "announceFrequency" INTEGER NOT NULL DEFAULT 60,
    "record" BOOLEAN NOT NULL DEFAULT true,
    "slaSec" INTEGER NOT NULL DEFAULT 60,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Queue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QueueMember" (
    "id" TEXT NOT NULL,
    "queueId" TEXT NOT NULL,
    "extensionId" TEXT NOT NULL,
    "penalty" INTEGER NOT NULL DEFAULT 0,
    "paused" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "QueueMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IvrFlow" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "draft" JSONB NOT NULL,
    "published" JSONB,
    "version" INTEGER NOT NULL DEFAULT 1,
    "publishedAt" TIMESTAMP(3),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IvrFlow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ErpConnection" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "mode" TEXT NOT NULL DEFAULT 'api',
    "config" JSONB NOT NULL DEFAULT '{}',
    "secretsEnc" TEXT,
    "isDefault" BOOLEAN NOT NULL DEFAULT true,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "lastTestAt" TIMESTAMP(3),
    "lastTestOk" BOOLEAN,
    "lastTestMsg" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ErpConnection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WhatsappConnection" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "config" JSONB NOT NULL DEFAULT '{}',
    "secretsEnc" TEXT,
    "isDefault" BOOLEAN NOT NULL DEFAULT true,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "lastTestAt" TIMESTAMP(3),
    "lastTestOk" BOOLEAN,
    "lastTestMsg" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WhatsappConnection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WhatsappMessage" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "connectionId" TEXT,
    "callId" TEXT,
    "to" TEXT NOT NULL,
    "body" TEXT,
    "documentName" TEXT,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "providerMessageId" TEXT,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WhatsappMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SpeechConfig" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "asrProvider" TEXT NOT NULL DEFAULT 'openai',
    "ttsProvider" TEXT NOT NULL DEFAULT 'openai',
    "nluProvider" TEXT NOT NULL DEFAULT 'openai',
    "ttsVoice" TEXT NOT NULL DEFAULT 'nova',
    "language" TEXT NOT NULL DEFAULT 'pt-BR',
    "config" JSONB NOT NULL DEFAULT '{}',
    "secretsEnc" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SpeechConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Call" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "linkedId" TEXT,
    "direction" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ringing',
    "callerId" TEXT NOT NULL,
    "callerName" TEXT,
    "did" TEXT,
    "destination" TEXT,
    "trunkName" TEXT,
    "queueName" TEXT,
    "agentExtension" TEXT,
    "flowId" TEXT,
    "customerId" TEXT,
    "customerName" TEXT,
    "customerDocument" TEXT,
    "intents" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "answeredAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "durationSec" INTEGER,
    "billSec" INTEGER,
    "waitSec" INTEGER,
    "hangupCause" TEXT,
    "hangupBy" TEXT,
    "recordingId" TEXT,
    "variables" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Call_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CallEvent" (
    "id" TEXT NOT NULL,
    "callId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "nodeId" TEXT,
    "data" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CallEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Recording" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "format" TEXT NOT NULL DEFAULT 'wav',
    "durationSec" INTEGER,
    "sizeBytes" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),

    CONSTRAINT "Recording_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QueueLog" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "queueName" TEXT NOT NULL,
    "callId" TEXT,
    "event" TEXT NOT NULL,
    "agent" TEXT,
    "waitSec" INTEGER,
    "talkSec" INTEGER,
    "position" INTEGER,
    "data" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QueueLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
    "userId" TEXT,
    "action" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entityId" TEXT,
    "before" JSONB,
    "after" JSONB,
    "ip" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Tenant_slug_key" ON "Tenant"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_extensionId_key" ON "User"("extensionId");

-- CreateIndex
CREATE INDEX "User_tenantId_idx" ON "User"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "RefreshToken_tokenHash_key" ON "RefreshToken"("tokenHash");

-- CreateIndex
CREATE INDEX "RefreshToken_userId_idx" ON "RefreshToken"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Trunk_tenantId_name_key" ON "Trunk"("tenantId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Extension_tenantId_number_key" ON "Extension"("tenantId", "number");

-- CreateIndex
CREATE INDEX "InboundRoute_tenantId_idx" ON "InboundRoute"("tenantId");

-- CreateIndex
CREATE INDEX "OutboundRoute_tenantId_idx" ON "OutboundRoute"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "Queue_tenantId_name_key" ON "Queue"("tenantId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "QueueMember_queueId_extensionId_key" ON "QueueMember"("queueId", "extensionId");

-- CreateIndex
CREATE INDEX "IvrFlow_tenantId_idx" ON "IvrFlow"("tenantId");

-- CreateIndex
CREATE INDEX "ErpConnection_tenantId_idx" ON "ErpConnection"("tenantId");

-- CreateIndex
CREATE INDEX "WhatsappConnection_tenantId_idx" ON "WhatsappConnection"("tenantId");

-- CreateIndex
CREATE INDEX "WhatsappMessage_tenantId_createdAt_idx" ON "WhatsappMessage"("tenantId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "SpeechConfig_tenantId_key" ON "SpeechConfig"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "Call_channelId_key" ON "Call"("channelId");

-- CreateIndex
CREATE UNIQUE INDEX "Call_recordingId_key" ON "Call"("recordingId");

-- CreateIndex
CREATE INDEX "Call_tenantId_startedAt_idx" ON "Call"("tenantId", "startedAt");

-- CreateIndex
CREATE INDEX "Call_tenantId_status_idx" ON "Call"("tenantId", "status");

-- CreateIndex
CREATE INDEX "CallEvent_callId_createdAt_idx" ON "CallEvent"("callId", "createdAt");

-- CreateIndex
CREATE INDEX "Recording_tenantId_createdAt_idx" ON "Recording"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "QueueLog_tenantId_queueName_createdAt_idx" ON "QueueLog"("tenantId", "queueName", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_tenantId_createdAt_idx" ON "AuditLog"("tenantId", "createdAt");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_extensionId_fkey" FOREIGN KEY ("extensionId") REFERENCES "Extension"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RefreshToken" ADD CONSTRAINT "RefreshToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Trunk" ADD CONSTRAINT "Trunk_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Extension" ADD CONSTRAINT "Extension_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InboundRoute" ADD CONSTRAINT "InboundRoute_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InboundRoute" ADD CONSTRAINT "InboundRoute_trunkId_fkey" FOREIGN KEY ("trunkId") REFERENCES "Trunk"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InboundRoute" ADD CONSTRAINT "InboundRoute_flowId_fkey" FOREIGN KEY ("flowId") REFERENCES "IvrFlow"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OutboundRoute" ADD CONSTRAINT "OutboundRoute_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OutboundRoute" ADD CONSTRAINT "OutboundRoute_trunkId_fkey" FOREIGN KEY ("trunkId") REFERENCES "Trunk"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Queue" ADD CONSTRAINT "Queue_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QueueMember" ADD CONSTRAINT "QueueMember_queueId_fkey" FOREIGN KEY ("queueId") REFERENCES "Queue"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QueueMember" ADD CONSTRAINT "QueueMember_extensionId_fkey" FOREIGN KEY ("extensionId") REFERENCES "Extension"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IvrFlow" ADD CONSTRAINT "IvrFlow_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ErpConnection" ADD CONSTRAINT "ErpConnection_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WhatsappConnection" ADD CONSTRAINT "WhatsappConnection_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WhatsappMessage" ADD CONSTRAINT "WhatsappMessage_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WhatsappMessage" ADD CONSTRAINT "WhatsappMessage_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "WhatsappConnection"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SpeechConfig" ADD CONSTRAINT "SpeechConfig_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Call" ADD CONSTRAINT "Call_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Call" ADD CONSTRAINT "Call_recordingId_fkey" FOREIGN KEY ("recordingId") REFERENCES "Recording"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CallEvent" ADD CONSTRAINT "CallEvent_callId_fkey" FOREIGN KEY ("callId") REFERENCES "Call"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Recording" ADD CONSTRAINT "Recording_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QueueLog" ADD CONSTRAINT "QueueLog_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

