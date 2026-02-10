-- CreateEnum
CREATE TYPE "Role" AS ENUM ('TECHNICIAN', 'SUPERVISOR', 'ADMIN');
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'DISABLED');
CREATE TYPE "AttendanceType" AS ENUM ('CHECK_IN', 'CHECK_OUT');
CREATE TYPE "RangeStatus" AS ENUM ('IN_RANGE', 'OUT_OF_RANGE');

-- CreateTable
CREATE TABLE "User" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "email" TEXT NOT NULL,
  "passwordHash" TEXT,
  "ssoSubject" TEXT,
  "role" "Role" NOT NULL,
  "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

CREATE TABLE "Site" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "name" TEXT NOT NULL,
  "latitude" DOUBLE PRECISION NOT NULL,
  "longitude" DOUBLE PRECISION NOT NULL,
  "radiusMeters" INTEGER NOT NULL,
  "qrRotationMinutes" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "Site_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SiteQrToken" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "siteId" UUID NOT NULL,
  "token" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "SiteQrToken_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SiteQrToken_siteId_token_key" ON "SiteQrToken"("siteId", "token");
CREATE INDEX "SiteQrToken_siteId_idx" ON "SiteQrToken"("siteId");

CREATE TABLE "AttendanceEvent" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "technicianId" UUID NOT NULL,
  "siteId" UUID NOT NULL,
  "type" "AttendanceType" NOT NULL,
  "rangeStatus" "RangeStatus" NOT NULL,
  "selfieUrl" TEXT NOT NULL,
  "qrToken" TEXT,
  "lat" DOUBLE PRECISION NOT NULL,
  "lng" DOUBLE PRECISION NOT NULL,
  "accuracy" DOUBLE PRECISION NOT NULL,
  "deviceId" TEXT,
  "deviceModel" TEXT,
  "osVersion" TEXT,
  "appVersion" TEXT,
  "overrideNote" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "AttendanceEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AttendanceEvent_technicianId_createdAt_idx" ON "AttendanceEvent"("technicianId", "createdAt");
CREATE INDEX "AttendanceEvent_siteId_createdAt_idx" ON "AttendanceEvent"("siteId", "createdAt");

CREATE TABLE "AuditLog" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "actorId" UUID NOT NULL,
  "action" TEXT NOT NULL,
  "entity" TEXT NOT NULL,
  "entityId" TEXT NOT NULL,
  "reason" TEXT,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AuditLog_entity_entityId_idx" ON "AuditLog"("entity", "entityId");
CREATE INDEX "AuditLog_actorId_createdAt_idx" ON "AuditLog"("actorId", "createdAt");

-- Foreign keys
ALTER TABLE "SiteQrToken" ADD CONSTRAINT "SiteQrToken_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AttendanceEvent" ADD CONSTRAINT "AttendanceEvent_technicianId_fkey" FOREIGN KEY ("technicianId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AttendanceEvent" ADD CONSTRAINT "AttendanceEvent_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
