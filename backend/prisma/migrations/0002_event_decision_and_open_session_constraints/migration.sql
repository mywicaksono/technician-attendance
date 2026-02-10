-- Enforce decision/rejection/range consistency on attendance_event.
-- Logical rule:
--   (decision='ACCEPTED' AND reject_reason IS NULL AND range_status IS NOT NULL)
--   OR
--   (decision='REJECTED' AND reject_reason IS NOT NULL AND range_status IS NULL)
--
-- Physical Prisma columns in current schema are camelCase (`rejectReason`, `rangeStatus`).
ALTER TABLE "attendance_event"
ADD CONSTRAINT "attendance_event_decision_consistency_chk"
CHECK (
  (
    "decision" = 'ACCEPTED'::"ValidationDecision"
    AND "rejectReason" IS NULL
    AND "rangeStatus" IS NOT NULL
  )
  OR
  (
    "decision" = 'REJECTED'::"ValidationDecision"
    AND "rejectReason" IS NOT NULL
    AND "rangeStatus" IS NULL
  )
);

-- Enforce only one OPEN session per technician.
-- Logical rule: UNIQUE (technician_id) WHERE status='OPEN'.
-- Physical Prisma column in current schema is camelCase (`technicianId`).
CREATE UNIQUE INDEX "attendance_session_open_unique_technician_idx"
ON "attendance_session" ("technicianId")
WHERE "status" = 'OPEN'::"SessionStatus";
