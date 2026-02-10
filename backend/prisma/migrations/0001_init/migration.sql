-- Initial schema for technician attendance domain.
-- Notes:
-- 1) attendance_event is append-only ledger.
-- 2) attendance_session is materialized mutable state for active/closed lookup.
-- 3) idempotency is enforced by (technician_id, client_event_id).
-- 4) QR anti-replay is enforced by (site_id, nonce).

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Enums
CREATE TYPE "Role" AS ENUM ('TECHNICIAN', 'SUPERVISOR', 'ADMIN');
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'DISABLED');
CREATE TYPE "EventType" AS ENUM ('CHECK_IN', 'CHECK_OUT');
CREATE TYPE "SessionStatus" AS ENUM ('OPEN', 'CLOSED', 'OVERRIDDEN');
CREATE TYPE "ValidationResult" AS ENUM (
  'IN_RANGE',
  'OUT_OF_RANGE',
  'REJECTED_INVALID_QR',
  'REJECTED_REPLAY',
  'REJECTED_INVALID_SESSION',
  'REJECTED_MISSING_SELFIE',
  'REJECTED_OUT_OF_RANGE'
);

-- users
CREATE TABLE "users" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "email" TEXT NOT NULL,
  "passwordHash" TEXT,
  "ssoSubject" TEXT,
  "role" "Role" NOT NULL,
  "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "users_email_key" ON "users"("email");
CREATE UNIQUE INDEX "users_ssoSubject_key" ON "users"("ssoSubject");

-- devices
CREATE TABLE "devices" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "technicianId" UUID NOT NULL,
  "deviceUuid" TEXT NOT NULL,
  "model" TEXT,
  "osVersion" TEXT,
  "appVersion" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "devices_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "devices_technicianId_deviceUuid_key" ON "devices"("technicianId", "deviceUuid");
CREATE INDEX "devices_technicianId_updatedAt_idx" ON "devices"("technicianId", "updatedAt");

-- sites
CREATE TABLE "sites" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "latitude" DECIMAL(10,7) NOT NULL,
  "longitude" DECIMAL(10,7) NOT NULL,
  "radiusMeters" INTEGER NOT NULL,
  "qrRotationMinutes" INTEGER NOT NULL,
  "strictOutOfRange" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "sites_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "sites_code_key" ON "sites"("code");
CREATE INDEX "sites_name_idx" ON "sites"("name");

-- attendance_event (append-only ledger)
CREATE TABLE "attendance_event" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "technicianId" UUID NOT NULL,
  "siteId" UUID NOT NULL,
  "deviceId" UUID,
  "clientEventId" TEXT NOT NULL,
  "eventType" "EventType" NOT NULL,
  "validationResult" "ValidationResult" NOT NULL,
  "selfieObjectKey" TEXT NOT NULL,
  "qrNonce" TEXT,
  "qrIssuedAt" TIMESTAMP(3),
  "qrExpiresAt" TIMESTAMP(3),
  "lat" DECIMAL(10,7) NOT NULL,
  "lng" DECIMAL(10,7) NOT NULL,
  "accuracyMeters" DECIMAL(8,2) NOT NULL,
  "eventAt" TIMESTAMP(3) NOT NULL,
  "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "attendance_event_pkey" PRIMARY KEY ("id")
);

-- Idempotency invariant: dedupe retries per technician/client event.
CREATE UNIQUE INDEX "attendance_event_technicianId_clientEventId_key"
  ON "attendance_event"("technicianId", "clientEventId");

-- Reporting indexes.
CREATE INDEX "attendance_event_technicianId_receivedAt_idx"
  ON "attendance_event"("technicianId", "receivedAt");
CREATE INDEX "attendance_event_siteId_receivedAt_idx"
  ON "attendance_event"("siteId", "receivedAt");
CREATE INDEX "attendance_event_validationResult_receivedAt_idx"
  ON "attendance_event"("validationResult", "receivedAt");
CREATE INDEX "attendance_event_eventType_receivedAt_idx"
  ON "attendance_event"("eventType", "receivedAt");

-- attendance_session (materialized state)
CREATE TABLE "attendance_session" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "technicianId" UUID NOT NULL,
  "siteId" UUID NOT NULL,
  "checkInEventId" UUID NOT NULL,
  "checkOutEventId" UUID,
  "status" "SessionStatus" NOT NULL DEFAULT 'OPEN',
  "startedAt" TIMESTAMP(3) NOT NULL,
  "endedAt" TIMESTAMP(3),
  "startedByUserId" UUID NOT NULL,
  "endedByUserId" UUID,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "attendance_session_pkey" PRIMARY KEY ("id")
);

-- A ledger event can open/close at most one materialized session.
CREATE UNIQUE INDEX "attendance_session_checkInEventId_key" ON "attendance_session"("checkInEventId");
CREATE UNIQUE INDEX "attendance_session_checkOutEventId_key" ON "attendance_session"("checkOutEventId");

-- Active session lookup + reporting.
CREATE INDEX "attendance_session_technicianId_status_startedAt_idx"
  ON "attendance_session"("technicianId", "status", "startedAt");
CREATE INDEX "attendance_session_siteId_status_startedAt_idx"
  ON "attendance_session"("siteId", "status", "startedAt");
CREATE INDEX "attendance_session_status_updatedAt_idx"
  ON "attendance_session"("status", "updatedAt");

-- qr_payload_replay (nonce anti-replay tracking)
CREATE TABLE "qr_payload_replay" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "siteId" UUID NOT NULL,
  "nonce" TEXT NOT NULL,
  "issuedAt" TIMESTAMP(3) NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "acceptedEventId" UUID,
  "seenByUserId" UUID,
  CONSTRAINT "qr_payload_replay_pkey" PRIMARY KEY ("id")
);

-- Replay protection invariant.
CREATE UNIQUE INDEX "qr_payload_replay_siteId_nonce_key" ON "qr_payload_replay"("siteId", "nonce");
CREATE INDEX "qr_payload_replay_expiresAt_idx" ON "qr_payload_replay"("expiresAt");

-- audit_log
CREATE TABLE "audit_log" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "actorId" UUID,
  "action" TEXT NOT NULL,
  "entityName" TEXT NOT NULL,
  "entityId" TEXT NOT NULL,
  "reason" TEXT,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "audit_log_entityName_entityId_createdAt_idx"
  ON "audit_log"("entityName", "entityId", "createdAt");
CREATE INDEX "audit_log_actorId_createdAt_idx"
  ON "audit_log"("actorId", "createdAt");

-- Foreign keys (explicit)
ALTER TABLE "devices"
  ADD CONSTRAINT "devices_technicianId_fkey"
  FOREIGN KEY ("technicianId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "attendance_event"
  ADD CONSTRAINT "attendance_event_technicianId_fkey"
  FOREIGN KEY ("technicianId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "attendance_event"
  ADD CONSTRAINT "attendance_event_siteId_fkey"
  FOREIGN KEY ("siteId") REFERENCES "sites"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "attendance_event"
  ADD CONSTRAINT "attendance_event_deviceId_fkey"
  FOREIGN KEY ("deviceId") REFERENCES "devices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "attendance_session"
  ADD CONSTRAINT "attendance_session_technicianId_fkey"
  FOREIGN KEY ("technicianId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "attendance_session"
  ADD CONSTRAINT "attendance_session_siteId_fkey"
  FOREIGN KEY ("siteId") REFERENCES "sites"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "attendance_session"
  ADD CONSTRAINT "attendance_session_checkInEventId_fkey"
  FOREIGN KEY ("checkInEventId") REFERENCES "attendance_event"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "attendance_session"
  ADD CONSTRAINT "attendance_session_checkOutEventId_fkey"
  FOREIGN KEY ("checkOutEventId") REFERENCES "attendance_event"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "attendance_session"
  ADD CONSTRAINT "attendance_session_startedByUserId_fkey"
  FOREIGN KEY ("startedByUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "attendance_session"
  ADD CONSTRAINT "attendance_session_endedByUserId_fkey"
  FOREIGN KEY ("endedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "qr_payload_replay"
  ADD CONSTRAINT "qr_payload_replay_siteId_fkey"
  FOREIGN KEY ("siteId") REFERENCES "sites"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "qr_payload_replay"
  ADD CONSTRAINT "qr_payload_replay_acceptedEventId_fkey"
  FOREIGN KEY ("acceptedEventId") REFERENCES "attendance_event"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "qr_payload_replay"
  ADD CONSTRAINT "qr_payload_replay_seenByUserId_fkey"
  FOREIGN KEY ("seenByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "audit_log"
  ADD CONSTRAINT "audit_log_actorId_fkey"
  FOREIGN KEY ("actorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
