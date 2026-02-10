-- Finalize attendance integrity constraints with rollout-safe semantics.
--
-- Why these constraints exist:
-- 1) decision/rejectReason/rangeStatus consistency on attendance_event
--    Ensures accepted events always include range status and never include reject reason,
--    while rejected events always include reject reason and never include range status.
-- 2) one OPEN session per technician on attendance_session
--    Prevents concurrent open sessions for the same technician.
--
-- Safety measures:
-- - Recreate CHECK constraint using NOT VALID then VALIDATE CONSTRAINT
--   to make introduction safer on existing datasets.
-- - Use IF NOT EXISTS for partial unique index creation.

-- Recreate consistency CHECK constraint in a safe two-step pattern.
ALTER TABLE "attendance_event"
DROP CONSTRAINT IF EXISTS "attendance_event_decision_consistency_chk";

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
) NOT VALID;

ALTER TABLE "attendance_event"
VALIDATE CONSTRAINT "attendance_event_decision_consistency_chk";

-- Ensure uniqueness for one OPEN session per technician.
CREATE UNIQUE INDEX IF NOT EXISTS "attendance_session_open_unique_technician_idx"
ON "attendance_session" ("technicianId")
WHERE "status" = 'OPEN'::"SessionStatus";
