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
