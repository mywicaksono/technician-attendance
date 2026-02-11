# Backend (NestJS)

## Environment setup
Prisma CLI reads `DATABASE_URL` from `backend/.env`.

- Linux/macOS:
  ```bash
  cd backend
  cp .env.example .env
  ```
- Windows PowerShell:
  ```powershell
  cd backend
  Copy-Item .env.example .env
  ```

Adjust `DATABASE_URL` in `.env` to match your local PostgreSQL instance.

## Run locally
```bash
cd backend
npm install
npx prisma generate
npx prisma migrate reset
npm run build
npm run start:dev
```

## Test
```bash
cd backend
npm test
```
