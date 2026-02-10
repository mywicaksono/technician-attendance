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
   - GPS within site radius.
   - QR token valid and unexpired.
   - Selfie metadata present.
5. Backend stores attendance event and emits audit log.

### Check-out (Android)
Same as check-in, but without QR.

## Domain Model (Explicit)
### attendance_event
- Immutable, append-only record for each check-in or check-out.
- References: `attendance_session`, `site`, `device`, and `audit_log` (via audited actions).
- Invariants:
  - `selfie` is mandatory for every event.
  - `CHECK_IN` must include a valid `qr_token`.
  - `CHECK_OUT` must reference an open `attendance_session`.

### attendance_session
- Represents the active work session between a check-in and its corresponding check-out.
- References: `technician`, `site`, and the `attendance_event` pair (start/end).
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
- Physical location with geofence radius.
- References: `qr_token` rotation configuration and associated `attendance_event` records.
- Invariants:
  - `radius_meters` must be positive.
  - Latitude/longitude must be valid coordinates.

### qr_token
- Site-scoped rotating token used for check-in verification.
- References: `site`.
- Invariants:
  - Only one active token per site at a time.
  - Tokens are short-lived and expire automatically.

### device
- Captures client device metadata for each attendance event.
- References: attached to `attendance_event`.
- Invariants:
  - `device_id` + `app_version` must be captured when available.

## QR Token Lifecycle
- **Rotation strategy**: Each site has a configurable rotation interval (minutes). A new token is generated at rotation boundaries and immediately replaces the prior active token.
- **Expiration rules**: Tokens expire after the rotation interval plus a small grace period (e.g., 1–2 minutes) to account for clock skew. Expired tokens are rejected server-side.
- **Offline scan handling**: Android may cache the latest token for a site to allow scanning without network. Cached tokens must still be validated by the server at sync time; if expired, the check-in is rejected with a reason indicating QR expiration.

## Offline Conflict Resolution Rules
- **Server vs client responsibility**:
  - Server is the source of truth for timestamps, session state, and QR validity.
  - Client is responsible for accurate capture of GPS/selfie/device metadata and for reliable queueing.
- **Rejection scenarios** (non-exhaustive):
  - Check-in with expired/invalid QR token.
  - Check-in when an open `attendance_session` already exists.
  - Check-out without a matching open session.
  - Missing selfie or corrupted selfie upload.
  - GPS outside site radius (accepted but marked `OUT_OF_RANGE`).

## Android Offline Security
- **Local encryption strategy**:
  - Encrypt selfies at rest using per-device keys stored in Android Keystore.
  - Use AES-GCM for file encryption; store only encrypted blobs in app storage.
- **Selfie retention & cleanup policy**:
  - Retain selfies locally only until upload succeeds and server acknowledges the attendance event.
  - On successful sync, securely delete local encrypted files and clear cached metadata.
  - On rejection, retain for a limited time (e.g., 7 days) to allow re-sync or support review, then purge.

## Security
- **Auth**: Email/password + OIDC SSO, JWT access/refresh.
- **RBAC**: `TECHNICIAN`, `SUPERVISOR`, `ADMIN`.
- **Uploads**: Size, mime, and resolution constraints enforced server-side.
- **Audit**: All state changes are recorded with actor, timestamp, and reason.

## Storage
- **PostgreSQL**: Attendance records, users, sites, QR tokens, audit logs.
- **S3-compatible**: Selfie images; stored encrypted at rest.

## Timezone
- All server timestamps are stored in UTC with application-layer conversion to `Asia/Jakarta`.
