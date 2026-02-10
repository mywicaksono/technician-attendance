# Architecture

## Overview
The Technician Attendance system is a monorepo with three deployable artifacts:

1. **Backend API** (NestJS + PostgreSQL + Prisma)
2. **Web Admin** (React + Vite + MUI)
3. **Android App** (Kotlin + Jetpack Compose)

The system is designed for strong auditability, offline-first operation on Android, and strict attendance validation.

## Key Principles
- **Append-only audit trail**: Attendance events and audit logs are immutable.
- **Offline-first**: Android uses Room for local persistence and WorkManager for reliable background sync.
- **Defense-in-depth**: Input validation, rate limiting, and server-side enforcement of attendance rules.
- **Time consistency**: Server timestamps are source of truth (Asia/Jakarta).

## Data Flow
### Check-in (Android)
1. Technician scans QR and captures GPS and selfie.
2. Data is stored in Room with status `PENDING`.
3. WorkManager syncs in FIFO order:
   - Upload selfie to S3-compatible storage.
   - Submit attendance payload with selfie URL.
4. Backend validates:
   - No active check-in without check-out.
   - GPS within site radius (or apply configured out-of-range policy).
   - QR payload signature + expiration + anti-replay constraints.
   - Selfie metadata present.
   - Idempotency key uniqueness for retries.
5. Backend stores attendance event and emits audit log.

### Check-out (Android)
Same as check-in, but without QR.

## Domain Model (Explicit)
### attendance_event
- Immutable, append-only ledger record for each check-in or check-out.
- References: `attendance_session`, `site`, `device`, and `audit_log` (via audited actions).
- Required fields include:
  - `client_event_id` (UUID from Android client, generated once per event)
  - `validation_result` (`IN_RANGE`, `OUT_OF_RANGE`, `REJECTED_*`)
- Invariants:
  - `selfie` is mandatory for every event.
  - `CHECK_IN` must include a valid QR payload.
  - `CHECK_OUT` must reference an open `attendance_session`.
  - Server deduplicates retries by unique key: `(technician_id, client_event_id)`.

### attendance_session
- Represents technician attendance state between check-in and check-out.
- References: `technician`, `site`, and the `attendance_event` pair (start/end).
- **State model decision**: `attendance_session` is a mutable/materialized state view derived from immutable `attendance_event` records. It may update fields such as `ended_at` and `status` (`OPEN`, `CLOSED`, `OVERRIDDEN`) for efficient querying, while the event ledger remains the source of truth.
- Invariants:
  - At most one open session per technician at any time.
  - Session start must be a valid `CHECK_IN` event.
  - Session end must be a valid `CHECK_OUT` event.

### audit_log
- Append-only ledger for all privileged actions and mutations.
- References: `actor` (user), `entity`, and `entity_id`.
- Invariants:
  - Every manual override requires a non-empty reason.
  - No hard delete; records are immutable.

### site
- Physical location with geofence radius and optional policy controls.
- References: QR signing configuration and associated `attendance_event` records.
- Invariants:
  - `radius_meters` must be positive.
  - Latitude/longitude must be valid coordinates.
  - Optional policy `out_of_range_policy` controls whether `OUT_OF_RANGE` is accepted-with-flag (default) or rejected.

### qr_token (signed QR payload)
- Site-scoped signed payload used for check-in verification.
- Logical payload fields: `site_id`, `issued_at`, `expires_at`, `nonce`, `signature`.
- References: `site` and server-side replay tracking.
- Invariants:
  - Signature must verify against server-managed key.
  - `issued_at <= now <= expires_at` (within allowed skew window).
  - `nonce` must pass replay protection checks.

### device
- Captures client device metadata for each attendance event.
- References: attached to `attendance_event`.
- Invariants:
  - `device_id` + `app_version` should be captured when available.

## Idempotency and Retry Safety
- Every attendance submission from Android includes `client_event_id` (UUID).
- Android must reuse the same `client_event_id` when retrying the same queued event.
- Backend enforces uniqueness on `(technician_id, client_event_id)` and returns the existing canonical result for duplicates.
- This prevents duplicate check-in/check-out events during offline retries, network timeouts, and app restarts.

## QR Token Lifecycle
- **Approach decision**: Prefer signed QR payloads over plain rotating tokens to support offline scan capture and deferred server verification.
- **Rotation strategy**: Each site has a configurable rotation interval (minutes). A new signed QR payload is generated at rotation boundaries.
- **Expiration rules**: Signed payloads expire at `expires_at` with small clock-skew tolerance (e.g., 1–2 minutes).
- **Offline scan handling**: Android can scan and store payload offline; acceptance is deferred until server sync verifies signature, validity window, and replay status.
- **Server verification**:
  - Verify cryptographic signature.
  - Validate `site_id`, `issued_at`, `expires_at` window.
  - Enforce anti-replay.
- **Anti-replay options**:
  - Nonce tracking store (`site_id + nonce` uniqueness during validity window), or
  - Windowed replay protection that marks nonce as consumed once accepted and blocks reuse within/after the window.

## Offline Conflict Resolution Rules
- **Server vs client responsibility**:
  - Server is the source of truth for timestamps, session state, idempotency dedupe, QR validity, replay checks, and final validation outcome.
  - Client is responsible for accurate capture of GPS/selfie/device metadata and reliable queueing.
- **Out-of-range policy**:
  - Default: attendance is accepted but flagged with `validation_result = OUT_OF_RANGE`.
  - Optional per-site strict mode may reject out-of-range attendance (`validation_result = REJECTED_OUT_OF_RANGE`).
- **Rejection scenarios** (non-exhaustive):
  - Check-in with expired/invalid signature QR payload.
  - Check-in replay attempt with used nonce.
  - Check-in when an open `attendance_session` already exists.
  - Check-out without a matching open session.
  - Missing selfie or corrupted selfie upload.
  - Payload violates schema or required constraints.

## Android Offline Security
- **Local encryption strategy**:
  - Encrypt selfies at rest using per-device keys stored in Android Keystore.
  - Use AES-GCM for file encryption; store only encrypted blobs in app-private storage.
  - Keep queued metadata in Room; avoid storing plaintext selfie bytes in database rows.
- **Selfie retention & cleanup policy**:
  - Retain selfies locally only until upload succeeds and server acknowledges the attendance event.
  - On successful sync, securely delete local encrypted files and clear related metadata pointers.
  - On rejection, retain for a limited time (e.g., 7 days) for re-sync/support review, then purge automatically.

## Security
- **Auth**: Email/password + OIDC SSO, JWT access/refresh.
- **RBAC**: `TECHNICIAN`, `SUPERVISOR`, `ADMIN`.
- **Uploads**: Size, mime, and resolution constraints enforced server-side.
- **Audit**: All state changes are recorded with actor, timestamp, and reason.

## Storage
- **PostgreSQL**: Attendance records, users, sites, QR payload replay state, audit logs.
- **S3-compatible**: Selfie images; stored encrypted at rest.

## Timezone
- All server timestamps are stored in UTC with application-layer conversion to `Asia/Jakarta`.
