# Technician Attendance System

Production-ready monorepo for an offline-first Technician Attendance system with Web Admin, Android, and Backend.

## Monorepo Structure
- `backend/` NestJS API + Prisma + PostgreSQL
- `web-admin/` React + Vite + MUI
- `android/` Kotlin + Jetpack Compose + Room + WorkManager

## Quick Start

### Backend
```bash
cd backend
npm install
npm run prisma:generate
npm run prisma:migrate
npm run start:dev
```

### Web Admin
```bash
cd web-admin
npm install
npm run dev
```

### Android
Open `android/` with Android Studio and run the app on a device/emulator.

## Documentation
- `ARCHITECTURE.md`
- `docs/openapi.yaml`
