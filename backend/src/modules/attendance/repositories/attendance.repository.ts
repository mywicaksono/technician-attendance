import { Injectable } from '@nestjs/common';
import { AttendanceEvent, Prisma, SessionStatus } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { AttendanceCreateInput } from '../interfaces/attendance-flow.types';

@Injectable()
export class AttendanceRepository {
  constructor(private readonly prisma: PrismaService) {}

  findByTechnicianAndClientEventId(technicianId: string, clientEventId: string): Promise<AttendanceEvent | null> {
    return this.prisma.attendanceEvent.findUnique({
      where: { technicianId_clientEventId: { technicianId, clientEventId } },
    });
  }

  findOpenSession(technicianId: string, tx?: Prisma.TransactionClient) {
    const db = tx ?? this.prisma;
    return db.attendanceSession.findFirst({
      where: { technicianId, status: SessionStatus.OPEN },
      orderBy: { startedAt: 'desc' },
    });
  }

  createEvent(input: AttendanceCreateInput, tx: Prisma.TransactionClient): Promise<AttendanceEvent> {
    return tx.attendanceEvent.create({
      data: {
        technicianId: input.technicianId,
        siteId: input.siteId,
        deviceId: input.deviceId,
        clientEventId: input.clientEventId,
        eventType: input.eventType,
        decision: input.decision,
        rangeStatus: input.rangeStatus,
        rejectReason: input.rejectReason,
        selfieObjectKey: input.selfieObjectKey,
        qrPayloadHash: input.qrPayloadHash,
        qrNonce: input.qrNonce,
        qrIssuedAt: input.qrIssuedAt,
        qrExpiresAt: input.qrExpiresAt,
        lat: input.lat,
        lng: input.lng,
        accuracyMeters: input.accuracyMeters,
        capturedAtClient: input.capturedAtClient,
        occurredAtServer: input.occurredAtServer,
      },
    });
  }

  createOpenSession(technicianId: string, siteId: string, checkInEventId: string, startedAt: Date, tx: Prisma.TransactionClient) {
    return tx.attendanceSession.create({
      data: {
        technicianId,
        siteId,
        checkInEventId,
        startedAt,
      },
    });
  }

  closeOpenSession(sessionId: string, checkOutEventId: string, endedAt: Date, tx: Prisma.TransactionClient) {
    return tx.attendanceSession.update({
      where: { id: sessionId },
      data: { checkOutEventId, endedAt, status: SessionStatus.CLOSED },
    });
  }

  runInTransaction<T>(fn: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    return this.prisma.$transaction((tx) => fn(tx));
  }
}
