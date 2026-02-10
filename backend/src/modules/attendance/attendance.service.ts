import { HttpStatus, Injectable } from '@nestjs/common';
import { EventType, RejectReason, ValidationDecision, RangeStatus } from '@prisma/client';
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library';
import { AppException } from '../../common/app.exception';
import { ErrorCode } from '../../common/error-codes';
import { CheckInDto } from './dto/check-in.dto';
import { CheckOutDto } from './dto/check-out.dto';
import { AttendanceRepository } from './repositories/attendance.repository';
import { QrReplayRepository } from './repositories/qr-replay.repository';
import { SitesRepository } from './repositories/sites.repository';

@Injectable()
export class AttendanceService {
  private readonly qrSkewMs = 2 * 60 * 1000;

  constructor(
    private readonly attendanceRepository: AttendanceRepository,
    private readonly sitesRepository: SitesRepository,
    private readonly qrReplayRepository: QrReplayRepository,
  ) {}

  async checkIn(technicianId: string, payload: CheckInDto) {
    return this.withIdempotency(technicianId, payload.clientEventId, async () => {
      const site = await this.sitesRepository.findById(payload.siteId);
      if (!site) {
        throw new AppException(ErrorCode.NOT_FOUND, 'Site not found', HttpStatus.NOT_FOUND);
      }

      if (!payload.selfieObjectKey) {
        return this.createRejectedEvent(technicianId, payload, EventType.CHECK_IN, RejectReason.MISSING_SELFIE);
      }

      const now = new Date();
      const qrExpiresAt = new Date(payload.qrExpiresAt);
      if (now.getTime() > qrExpiresAt.getTime() + this.qrSkewMs) {
        return this.createRejectedEvent(technicianId, payload, EventType.CHECK_IN, RejectReason.INVALID_QR);
      }

      const openSession = await this.attendanceRepository.findOpenSession(technicianId);
      if (openSession) {
        return this.createRejectedEvent(technicianId, payload, EventType.CHECK_IN, RejectReason.INVALID_SESSION);
      }

      const geo = this.computeGeoDecision(
        Number(site.latitude),
        Number(site.longitude),
        site.radiusMeters,
        payload.lat,
        payload.lng,
        site.strictOutOfRange,
      );

      return this.attendanceRepository.runInTransaction(async (tx) => {
        let replayId: string | null = null;
        try {
          const replay = await this.qrReplayRepository.createReplayAttempt(
            tx,
            payload.siteId,
            payload.qrNonce,
            new Date(payload.qrIssuedAt),
            qrExpiresAt,
            technicianId,
          );
          replayId = replay.id;
        } catch (error) {
          if (this.isUniqueViolation(error)) {
            return this.createRejectedEvent(technicianId, payload, EventType.CHECK_IN, RejectReason.REPLAY, tx);
          }
          throw error;
        }

        const event = await this.attendanceRepository.createEvent(
          {
            technicianId,
            siteId: payload.siteId,
            deviceId: payload.deviceId,
            clientEventId: payload.clientEventId,
            eventType: EventType.CHECK_IN,
            selfieObjectKey: payload.selfieObjectKey,
            qrPayloadHash: payload.qrPayloadHash,
            qrNonce: payload.qrNonce,
            qrIssuedAt: new Date(payload.qrIssuedAt),
            qrExpiresAt,
            lat: payload.lat,
            lng: payload.lng,
            accuracyMeters: payload.accuracyMeters,
            capturedAtClient: new Date(payload.capturedAtClient),
            occurredAtServer: now,
            decision: geo.decision,
            rangeStatus: geo.rangeStatus,
            rejectReason: geo.rejectReason,
          },
          tx,
        );

        if (event.decision === ValidationDecision.ACCEPTED) {
          await this.attendanceRepository.createOpenSession(technicianId, payload.siteId, event.id, now, tx);
          if (replayId) {
            await this.qrReplayRepository.linkAcceptedEvent(tx, replayId, event.id);
          }
        }

        return event;
      });
    });
  }

  async checkOut(technicianId: string, payload: CheckOutDto) {
    return this.withIdempotency(technicianId, payload.clientEventId, async () => {
      const site = await this.sitesRepository.findById(payload.siteId);
      if (!site) {
        throw new AppException(ErrorCode.NOT_FOUND, 'Site not found', HttpStatus.NOT_FOUND);
      }

      if (!payload.selfieObjectKey) {
        return this.createRejectedEvent(technicianId, payload, EventType.CHECK_OUT, RejectReason.MISSING_SELFIE);
      }

      const openSession = await this.attendanceRepository.findOpenSession(technicianId);
      if (!openSession) {
        return this.createRejectedEvent(technicianId, payload, EventType.CHECK_OUT, RejectReason.INVALID_SESSION);
      }

      const geo = this.computeGeoDecision(
        Number(site.latitude),
        Number(site.longitude),
        site.radiusMeters,
        payload.lat,
        payload.lng,
        site.strictOutOfRange,
      );

      const now = new Date();
      return this.attendanceRepository.runInTransaction(async (tx) => {
        const event = await this.attendanceRepository.createEvent(
          {
            technicianId,
            siteId: payload.siteId,
            deviceId: payload.deviceId,
            clientEventId: payload.clientEventId,
            eventType: EventType.CHECK_OUT,
            selfieObjectKey: payload.selfieObjectKey,
            lat: payload.lat,
            lng: payload.lng,
            accuracyMeters: payload.accuracyMeters,
            capturedAtClient: new Date(payload.capturedAtClient),
            occurredAtServer: now,
            decision: geo.decision,
            rangeStatus: geo.rangeStatus,
            rejectReason: geo.rejectReason,
          },
          tx,
        );

        if (event.decision === ValidationDecision.ACCEPTED) {
          await this.attendanceRepository.closeOpenSession(openSession.id, event.id, now, tx);
        }
        return event;
      });
    });
  }

  async listEvents() {
    return this.attendanceRepository.runInTransaction((tx) =>
      tx.attendanceEvent.findMany({ orderBy: { occurredAtServer: 'desc' }, take: 100 }),
    );
  }

  private async withIdempotency<T>(technicianId: string, clientEventId: string, action: () => Promise<T>): Promise<T> {
    const existing = await this.attendanceRepository.findByTechnicianAndClientEventId(technicianId, clientEventId);
    if (existing) {
      return existing as T;
    }

    try {
      return await action();
    } catch (error) {
      if (this.isUniqueViolation(error)) {
        const canonical = await this.attendanceRepository.findByTechnicianAndClientEventId(technicianId, clientEventId);
        if (canonical) {
          return canonical as T;
        }
      }
      throw error;
    }
  }

  private createRejectedEvent(
    technicianId: string,
    payload: CheckInDto | CheckOutDto,
    eventType: EventType,
    reason: RejectReason,
    tx?: Parameters<AttendanceRepository['createEvent']>[1],
  ) {
    const create = (trx: Parameters<AttendanceRepository['createEvent']>[1]) =>
      this.attendanceRepository.createEvent(
        {
          technicianId,
          siteId: payload.siteId,
          deviceId: payload.deviceId,
          clientEventId: payload.clientEventId,
          eventType,
          selfieObjectKey: payload.selfieObjectKey,
          qrPayloadHash: 'qrPayloadHash' in payload ? payload.qrPayloadHash : undefined,
          qrNonce: 'qrNonce' in payload ? payload.qrNonce : undefined,
          qrIssuedAt: 'qrIssuedAt' in payload ? new Date(payload.qrIssuedAt) : undefined,
          qrExpiresAt: 'qrExpiresAt' in payload ? new Date(payload.qrExpiresAt) : undefined,
          lat: payload.lat,
          lng: payload.lng,
          accuracyMeters: payload.accuracyMeters,
          capturedAtClient: new Date(payload.capturedAtClient),
          occurredAtServer: new Date(),
          decision: ValidationDecision.REJECTED,
          rangeStatus: null,
          rejectReason: reason,
        },
        trx,
      );

    if (tx) {
      return create(tx);
    }

    return this.attendanceRepository.runInTransaction((trx) => create(trx));
  }

  private computeGeoDecision(
    siteLat: number,
    siteLng: number,
    radiusMeters: number,
    lat: number,
    lng: number,
    strictOutOfRange: boolean,
  ): { decision: ValidationDecision; rangeStatus: RangeStatus | null; rejectReason: RejectReason | null } {
    const distance = this.haversine(siteLat, siteLng, lat, lng);
    if (distance <= radiusMeters) {
      return { decision: ValidationDecision.ACCEPTED, rangeStatus: RangeStatus.IN_RANGE, rejectReason: null };
    }
    if (strictOutOfRange) {
      return { decision: ValidationDecision.REJECTED, rangeStatus: null, rejectReason: RejectReason.OUT_OF_RANGE };
    }
    return { decision: ValidationDecision.ACCEPTED, rangeStatus: RangeStatus.OUT_OF_RANGE, rejectReason: null };
  }

  private haversine(lat1: number, lng1: number, lat2: number, lng2: number): number {
    const r = 6371000;
    const toRad = (n: number) => (n * Math.PI) / 180;
    const dLat = toRad(lat2 - lat1);
    const dLng = toRad(lng2 - lng1);
    const a =
      Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
    return 2 * r * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  private isUniqueViolation(error: unknown): boolean {
    if (error instanceof PrismaClientKnownRequestError) {
      return error.code === 'P2002';
    }
    return !!error && typeof error === 'object' && 'code' in error && (error as { code?: string }).code === 'P2002';
  }
}
