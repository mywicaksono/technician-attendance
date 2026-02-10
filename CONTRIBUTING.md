# Contributing Guide

This document defines coding and architecture rules for this repository.

## 1) Backend (NestJS) Clean Code Rules

### Layer Responsibilities
- **Controllers** must remain thin and only handle HTTP concerns:
  - request parsing
  - DTO validation
  - response mapping
- **Application/Use-case services** must contain orchestration and business flows.
- **Domain layer** must contain core business rules, entities, and value objects.

### Dependency Rules
- Database access (Prisma) and external integrations (S3/object storage) must be hidden behind interfaces/abstractions.
- Apply dependency inversion:
  - domain/application modules **must not** directly depend on Prisma client or S3 SDK.
  - infrastructure adapters implement interfaces and are injected.

### Error Handling
- Use consistent custom error types in domain/application layers.
- Map those errors to HTTP responses in a dedicated mapping layer (e.g., exception filters or controller mappers), not with ad hoc logic in each handler.

### Example (Backend Layer Map)
```text
src/
  modules/attendance/
    presentation/      # controllers, dto, http mappers
    application/       # use cases, command handlers
    domain/            # entities, value objects, domain services, rules
    infrastructure/    # prisma repositories, s3 adapters
```

### Example (Ports and Use Case Signature)
```ts
// application/ports/attendance-event.repository.ts
export interface AttendanceEventRepository {
  save(event: AttendanceEvent): Promise<void>;
  findByTechnicianAndClientEventId(
    technicianId: string,
    clientEventId: string,
  ): Promise<AttendanceEvent | null>;
}

// application/use-cases/check-in.use-case.ts
export interface CheckInCommand {
  technicianId: string;
  clientEventId: string;
  siteId: string;
  qrPayload: string;
  selfieObjectKey: string;
  gps: { lat: number; lng: number; accuracy: number };
}

export interface CheckInUseCase {
  execute(command: CheckInCommand): Promise<AttendanceResult>;
}
```

## 2) Idempotency and Validation

### Idempotency
- Enforce idempotency at the **service/application layer** using `client_event_id`.
- Use `(technician_id, client_event_id)` as deduplication key.
- On retries with same key:
  - return previously persisted canonical result
  - never create duplicate attendance events

### Validation Centralization
- Keep attendance validation rules centralized in domain services (geofence, session state, QR validity, selfie required, anti-replay checks).
- Do not duplicate these rules across controllers, workers, or handlers.

### Safe Retry Behavior
- Client must generate one `client_event_id` per logical event and reuse it for all retries.
- Server must treat duplicate submissions as idempotent replay, not as new commands.

## 3) Android Clean Code Rules

### Required Layer Separation
- **data layer**: Room, API clients, encryption adapters
- **domain layer**: use cases, conflict rules, queue management, retry policy decisions
- **UI layer**: Compose screens, state rendering, user interactions

### WorkManager Rule
- WorkManager tasks orchestrate domain use cases only.
- Do not embed domain business rules directly inside Worker classes.

### UI Data Access Rule
- UI layer must never execute direct DB operations.
- UI must interact through repository/use-case interfaces.

### Example (Android Package Map)
```text
android/app/src/main/java/.../
  data/
    local/      # room dao/entities
    remote/     # retrofit/api clients
    crypto/     # keystore + encryption implementation
    repository/ # repository implementations
  domain/
    model/
    rules/
    usecase/
    repository/ # repository interfaces
  ui/
    screen/
    component/
    viewmodel/
  worker/
    sync/       # invokes domain use cases
```

## 4) Forbidden Practices

- No business logic inside controllers or UI composables/components.
- No direct Prisma/S3/HTTP client calls inside domain/use-case classes.
- No duplicated validation/conflict-resolution logic across modules.
- Avoid global mutable state and static utility patterns that bypass abstractions and DI.

## 5) Documentation Style

- Include concrete examples when defining architectural rules (signatures, folder maps, interfaces).
- Use clear, consistent naming conventions:
  - `*Controller` for HTTP adapters
  - `*UseCase` or `*Service` for application orchestration
  - `*DomainService` for domain rule engines
  - `*Repository` for ports/interfaces and `*RepositoryPrisma` (or equivalent) for infrastructure adapters
- Keep terms consistent across backend and Android modules to reduce ambiguity (e.g., `AttendanceEvent`, `AttendanceSession`, `ValidationResult`).
