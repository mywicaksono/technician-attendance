import { BadRequestException, Injectable } from '@nestjs/common';
import {
  AttendanceEvent,
  EventType,
  Prisma,
  PrismaClient,
  RejectReason,
  RangeStatus,
  SessionStatus,
  ValidationDecision,
} from '@prisma/client';
import { createHash } from 'crypto';
import { PrismaService } from '../common/prisma.service';
import { CheckInDto } from './dto/check-in.dto';
import { CheckOutDto } from './dto/check-out.dto';

interface ParsedQr {
  nonce?: string;
  issuedAt?: Date;
  expiresAt?: Date;
}

@Injectable()
export class AttendanceService {
  constructor(private readonly prisma: PrismaService) {}

  async checkIn(technicianId: string, payload: CheckInDto): Promise<AttendanceEvent> {
    const existing = await this.findByIdempotency(technicianId, payload.clientEventId);
    if (existing) {
      return existing;
    }

    const site = await this.prisma.site.findUnique({ where: { id: payload.siteId } });
    if (!site) {
      throw new BadRequestException('Invalid site');
    }

    const selfieObjectKey = payload.selfieObjectKey || payload.selfieUrl;
    if (!selfieObjectKey) {
      return this.createRejectedEvent(technicianId, payload, EventType.CHECK_IN, RejectReason.MISSING_SELFIE);
    }

    if (!payload.qrToken.trim()) {
      return this.createRejectedEvent(technicianId, payload, EventType.CHECK_IN, RejectReason.INVALID_QR);
    }

    const qrPayloadHash = this.hashQr(payload.qrToken);
    const qr = this.parseQrToken(payload.qrToken);
    if (qr.expiresAt && qr.expiresAt.getTime() < Date.now()) {
      return this.createRejectedEvent(technicianId, payload, EventType.CHECK_IN, RejectReason.INVALID_QR, {
        qrPayloadHash,
        qrNonce: qr.nonce,
        qrIssuedAt: qr.issuedAt,
        qrExpiresAt: qr.expiresAt,
      });
    }

    const openSession = await this.findOpenSession(technicianId);
    if (openSession) {
      return this.createRejectedEvent(technicianId, payload, EventType.CHECK_IN, RejectReason.INVALID_SESSION, {
        qrPayloadHash,
        qrNonce: qr.nonce,
        qrIssuedAt: qr.issuedAt,
        qrExpiresAt: qr.expiresAt,
      });
    }

    const decision = this.evaluateGeofence(
      Number(site.latitude),
      Number(site.longitude),
      site.radiusMeters,
      payload.gps.lat,
      payload.gps.lng,
      site.strictOutOfRange,
    );

    return this.prisma.$transaction(async (tx) => {
      if (qr.nonce) {
        try {
          await tx.qrPayloadReplay.create({
            data: {
              siteId: payload.siteId,
              nonce: qr.nonce,
              issuedAt: qr.issuedAt ?? new Date(payload.capturedAtClient),
              expiresAt: qr.expiresAt ?? new Date(Date.now() + 10 * 60_000),
              seenByUserId: technicianId,
            },
          });
        } catch (error) {
          if (this.isUniqueViolation(error)) {
            return this.createRejectedEventTx(tx, technicianId, payload, EventType.CHECK_IN, RejectReason.REPLAY, {
              qrPayloadHash,
              qrNonce: qr.nonce,
              qrIssuedAt: qr.issuedAt,
              qrExpiresAt: qr.expiresAt,
            });
          }
          throw error;
        }
      } else {
        // TODO: When qrToken parser is standardized, enforce nonce replay tracking for all tokens.
      }

      const event = await tx.attendanceEvent.create({
        data: {
          technicianId,
          siteId: payload.siteId,
          deviceId: payload.device?.deviceId,
          clientEventId: payload.clientEventId,
          eventType: EventType.CHECK_IN,
          decision: decision.decision,
          rangeStatus: decision.rangeStatus,
          rejectReason: decision.rejectReason,
          selfieObjectKey,
          qrPayloadHash,
          qrNonce: qr.nonce,
          qrIssuedAt: qr.issuedAt,
          qrExpiresAt: qr.expiresAt,
          lat: payload.gps.lat,
          lng: payload.gps.lng,
          accuracyMeters: payload.gps.accuracy,
          capturedAtClient: new Date(payload.capturedAtClient),
        },
      });

      if (event.decision === ValidationDecision.ACCEPTED) {
        await tx.attendanceSession.create({
          data: {
            technicianId,
            siteId: payload.siteId,
            checkInEventId: event.id,
            startedAt: event.occurredAtServer,
            status: SessionStatus.OPEN,
          },
        });
      }

      return event;
    }).catch(async (error) => {
      if (this.isUniqueViolation(error)) {
        const canonical = await this.findByIdempotency(technicianId, payload.clientEventId);
        if (canonical) {
          return canonical;
        }
      }
      throw error;
    });
  }

  async checkOut(technicianId: string, payload: CheckOutDto): Promise<AttendanceEvent> {
    const existing = await this.findByIdempotency(technicianId, payload.clientEventId);
    if (existing) {
      return existing;
    }

    const site = await this.prisma.site.findUnique({ where: { id: payload.siteId } });
    if (!site) {
      throw new BadRequestException('Invalid site');
    }

    const selfieObjectKey = payload.selfieObjectKey || payload.selfieUrl;
    if (!selfieObjectKey) {
      return this.createRejectedEvent(technicianId, payload, EventType.CHECK_OUT, RejectReason.MISSING_SELFIE);
    }

    const openSession = await this.findOpenSession(technicianId);
    if (!openSession) {
      return this.createRejectedEvent(technicianId, payload, EventType.CHECK_OUT, RejectReason.INVALID_SESSION);
    }

    const decision = this.evaluateGeofence(
      Number(site.latitude),
      Number(site.longitude),
      site.radiusMeters,
      payload.gps.lat,
      payload.gps.lng,
      site.strictOutOfRange,
    );

    return this.prisma
      .$transaction(async (tx) => {
        const event = await tx.attendanceEvent.create({
          data: {
            technicianId,
            siteId: payload.siteId,
            deviceId: payload.device?.deviceId,
            clientEventId: payload.clientEventId,
            eventType: EventType.CHECK_OUT,
            decision: decision.decision,
            rangeStatus: decision.rangeStatus,
            rejectReason: decision.rejectReason,
            selfieObjectKey,
            lat: payload.gps.lat,
            lng: payload.gps.lng,
            accuracyMeters: payload.gps.accuracy,
            capturedAtClient: new Date(payload.capturedAtClient),
          },
        });

        if (event.decision === ValidationDecision.ACCEPTED) {
          await tx.attendanceSession.update({
            where: { id: openSession.id },
            data: {
              checkOutEventId: event.id,
              endedAt: event.occurredAtServer,
              status: SessionStatus.CLOSED,
            },
          });
        }

        return event;
      })
      .catch(async (error) => {
        if (this.isUniqueViolation(error)) {
          const canonical = await this.findByIdempotency(technicianId, payload.clientEventId);
          if (canonical) {
            return canonical;
          }
        }
        throw error;
      });
  }

  private findByIdempotency(technicianId: string, clientEventId: string) {
    return this.prisma.attendanceEvent.findUnique({
      where: { technicianId_clientEventId: { technicianId, clientEventId } },
    });
  }

  private findOpenSession(technicianId: string) {
    return this.prisma.attendanceSession.findFirst({
      where: { technicianId, status: SessionStatus.OPEN },
      orderBy: { startedAt: 'desc' },
    });
  }

  private createRejectedEvent(
    technicianId: string,
    payload: CheckInDto | CheckOutDto,
    eventType: EventType,
    rejectReason: RejectReason,
    qr?: { qrPayloadHash?: string; qrNonce?: string; qrIssuedAt?: Date; qrExpiresAt?: Date },
  ) {
    return this.prisma.attendanceEvent
      .create({
        data: {
          technicianId,
          siteId: payload.siteId,
          deviceId: payload.device?.deviceId,
          clientEventId: payload.clientEventId,
          eventType,
          decision: ValidationDecision.REJECTED,
          rangeStatus: null,
          rejectReason,
          selfieObjectKey: payload.selfieObjectKey || payload.selfieUrl || '',
          qrPayloadHash: qr?.qrPayloadHash,
          qrNonce: qr?.qrNonce,
          qrIssuedAt: qr?.qrIssuedAt,
          qrExpiresAt: qr?.qrExpiresAt,
          lat: payload.gps.lat,
          lng: payload.gps.lng,
          accuracyMeters: payload.gps.accuracy,
          capturedAtClient: new Date(payload.capturedAtClient),
        },
      })
      .catch(async (error) => {
        if (this.isUniqueViolation(error)) {
          const canonical = await this.findByIdempotency(technicianId, payload.clientEventId);
          if (canonical) {
            return canonical;
          }
        }
        throw error;
      });
  }

  private createRejectedEventTx(
    tx: Prisma.TransactionClient,
    technicianId: string,
    payload: CheckInDto,
    eventType: EventType,
    rejectReason: RejectReason,
    qr?: { qrPayloadHash?: string; qrNonce?: string; qrIssuedAt?: Date; qrExpiresAt?: Date },
  ) {
    return tx.attendanceEvent.create({
      data: {
        technicianId,
        siteId: payload.siteId,
        deviceId: payload.device?.deviceId,
        clientEventId: payload.clientEventId,
        eventType,
        decision: ValidationDecision.REJECTED,
        rangeStatus: null,
        rejectReason,
        selfieObjectKey: payload.selfieObjectKey || payload.selfieUrl || '',
        qrPayloadHash: qr?.qrPayloadHash,
        qrNonce: qr?.qrNonce,
        qrIssuedAt: qr?.qrIssuedAt,
        qrExpiresAt: qr?.qrExpiresAt,
        lat: payload.gps.lat,
        lng: payload.gps.lng,
        accuracyMeters: payload.gps.accuracy,
        capturedAtClient: new Date(payload.capturedAtClient),
      },
    });
  }

  private evaluateGeofence(
    siteLat: number,
    siteLng: number,
    radiusMeters: number,
    lat: number,
    lng: number,
    strictOutOfRange: boolean,
  ): { decision: ValidationDecision; rangeStatus: RangeStatus | null; rejectReason: RejectReason | null } {
    const distance = this.haversineDistance(siteLat, siteLng, lat, lng);
    if (distance <= radiusMeters) {
      return { decision: ValidationDecision.ACCEPTED, rangeStatus: RangeStatus.IN_RANGE, rejectReason: null };
    }

    if (strictOutOfRange) {
      return { decision: ValidationDecision.REJECTED, rangeStatus: null, rejectReason: RejectReason.OUT_OF_RANGE };
    }

    return { decision: ValidationDecision.ACCEPTED, rangeStatus: RangeStatus.OUT_OF_RANGE, rejectReason: null };
  }

  private parseQrToken(qrToken: string): ParsedQr {
    const parseObject = (obj: Record<string, unknown>): ParsedQr => ({
      nonce: typeof obj.nonce === 'string' ? obj.nonce : undefined,
      issuedAt: this.parseDateValue(obj.issuedAt ?? obj.iat),
      expiresAt: this.parseDateValue(obj.expiresAt ?? obj.exp),
    });

    try {
      const direct = JSON.parse(qrToken) as Record<string, unknown>;
      return parseObject(direct);
    } catch {
      // ignore
    }

    const parts = qrToken.split('.');
    if (parts.length === 3) {
      try {
        const payloadRaw = Buffer.from(parts[1], 'base64url').toString('utf8');
        const parsed = JSON.parse(payloadRaw) as Record<string, unknown>;
        return parseObject(parsed);
      } catch {
        return {};
      }
    }

    return {};
  }

  private parseDateValue(value: unknown): Date | undefined {
    if (typeof value === 'number') {
      return new Date(value * 1000);
    }
    if (typeof value === 'string') {
      const d = new Date(value);
      return Number.isNaN(d.getTime()) ? undefined : d;
    }
    return undefined;
  }

  private hashQr(value: string): string {
    return createHash('sha256').update(value).digest('hex');
  }

  private isUniqueViolation(error: unknown): boolean {
    return (
      error instanceof Prisma.PrismaClientKnownRequestError
        ? error.code === 'P2002'
        : !!error && typeof error === 'object' && 'code' in error && (error as { code?: string }).code === 'P2002'
    );
  }

  private haversineDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
    const toRadians = (value: number) => (value * Math.PI) / 180;
    const earthRadius = 6371000;
    const dLat = toRadians(lat2 - lat1);
    const dLng = toRadians(lng2 - lng1);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return earthRadius * c;
  }
}
