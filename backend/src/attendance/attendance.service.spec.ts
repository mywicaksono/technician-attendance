import { AttendanceService } from './attendance.service';
import { EventType, RejectReason, RangeStatus, SessionStatus, ValidationDecision } from '@prisma/client';

const prismaMock: any = {
  site: {
    findUnique: jest.fn(),
  },
  attendanceEvent: {
    findUnique: jest.fn(),
    create: jest.fn(),
  },
  attendanceSession: {
    findFirst: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
  qrPayloadReplay: {
    create: jest.fn(),
  },
  $transaction: jest.fn(async (callback: any) => callback(prismaMock)),
};

const baseCheckIn = {
  siteId: '550e8400-e29b-41d4-a716-446655440000',
  clientEventId: '2f1d6f3f-0ab1-4b5f-a78c-cd6a6804f2f1',
  qrToken: JSON.stringify({ nonce: 'nonce-1', issuedAt: '2025-01-01T10:00:00.000Z', expiresAt: '2099-01-01T10:00:00.000Z' }),
  selfieObjectKey: 'selfie/key.jpg',
  capturedAtClient: '2025-01-01T10:00:00.000Z',
  gps: { lat: -6.2, lng: 106.8, accuracy: 5 },
};

const baseCheckOut = {
  siteId: '550e8400-e29b-41d4-a716-446655440000',
  clientEventId: '93dd726e-b199-4bcf-8668-a6b0089f399f',
  selfieObjectKey: 'selfie/out.jpg',
  capturedAtClient: '2025-01-01T18:00:00.000Z',
  gps: { lat: -6.2, lng: 106.8, accuracy: 5 },
};

describe('AttendanceService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    prismaMock.site.findUnique.mockResolvedValue({
      id: baseCheckIn.siteId,
      latitude: -6.2,
      longitude: 106.8,
      radiusMeters: 200,
      strictOutOfRange: false,
    });
    prismaMock.attendanceEvent.findUnique.mockResolvedValue(null);
    prismaMock.attendanceSession.findFirst.mockResolvedValue(null);
    prismaMock.qrPayloadReplay.create.mockResolvedValue({ id: 'replay-1' });
    prismaMock.attendanceEvent.create.mockImplementation(async ({ data }: any) => ({
      id: 'event-1',
      technicianId: data.technicianId,
      siteId: data.siteId,
      clientEventId: data.clientEventId,
      eventType: data.eventType,
      decision: data.decision,
      rangeStatus: data.rangeStatus,
      rejectReason: data.rejectReason,
      occurredAtServer: new Date('2025-01-01T10:00:05.000Z'),
    }));
  });

  it('check-in success creates OPEN session', async () => {
    const service = new AttendanceService(prismaMock);

    const event = await service.checkIn('tech-1', baseCheckIn as any);

    expect(event.eventType).toBe(EventType.CHECK_IN);
    expect(event.decision).toBe(ValidationDecision.ACCEPTED);
    expect(prismaMock.attendanceSession.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: SessionStatus.OPEN, checkInEventId: 'event-1' }),
      }),
    );
  });

  it('duplicate check-in with same clientEventId returns canonical event', async () => {
    const service = new AttendanceService(prismaMock);
    prismaMock.attendanceEvent.findUnique.mockResolvedValueOnce({ id: 'existing', clientEventId: baseCheckIn.clientEventId });

    const event = await service.checkIn('tech-1', baseCheckIn as any);

    expect(event).toEqual({ id: 'existing', clientEventId: baseCheckIn.clientEventId });
    expect(prismaMock.attendanceEvent.create).not.toHaveBeenCalled();
  });

  it('check-in while OPEN session exists => REJECTED INVALID_SESSION', async () => {
    const service = new AttendanceService(prismaMock);
    prismaMock.attendanceSession.findFirst.mockResolvedValueOnce({ id: 'session-1', status: SessionStatus.OPEN });

    const event = await service.checkIn('tech-1', baseCheckIn as any);

    expect(event.decision).toBe(ValidationDecision.REJECTED);
    expect(event.rejectReason).toBe(RejectReason.INVALID_SESSION);
  });

  it('check-out without OPEN session => REJECTED INVALID_SESSION', async () => {
    const service = new AttendanceService(prismaMock);
    prismaMock.attendanceSession.findFirst.mockResolvedValueOnce(null);

    const event = await service.checkOut('tech-1', baseCheckOut as any);

    expect(event.decision).toBe(ValidationDecision.REJECTED);
    expect(event.rejectReason).toBe(RejectReason.INVALID_SESSION);
  });

  it('check-out success closes session', async () => {
    const service = new AttendanceService(prismaMock);
    prismaMock.attendanceSession.findFirst.mockResolvedValueOnce({ id: 'session-2', status: SessionStatus.OPEN });

    const event = await service.checkOut('tech-1', baseCheckOut as any);

    expect(event.eventType).toBe(EventType.CHECK_OUT);
    expect(prismaMock.attendanceSession.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'session-2' },
        data: expect.objectContaining({ status: SessionStatus.CLOSED, checkOutEventId: 'event-1' }),
      }),
    );
  });

  it('out-of-range strict => REJECTED OUT_OF_RANGE', async () => {
    const service = new AttendanceService(prismaMock);
    prismaMock.site.findUnique.mockResolvedValueOnce({
      id: baseCheckIn.siteId,
      latitude: -6.2,
      longitude: 106.8,
      radiusMeters: 10,
      strictOutOfRange: true,
    });

    const event = await service.checkIn('tech-1', { ...baseCheckIn, gps: { lat: -7.2, lng: 107.8, accuracy: 10 } } as any);

    expect(event.decision).toBe(ValidationDecision.REJECTED);
    expect(event.rejectReason).toBe(RejectReason.OUT_OF_RANGE);
    expect(event.rangeStatus).toBeNull();
  });

  it('out-of-range non-strict => ACCEPTED + OUT_OF_RANGE', async () => {
    const service = new AttendanceService(prismaMock);
    prismaMock.site.findUnique.mockResolvedValueOnce({
      id: baseCheckIn.siteId,
      latitude: -6.2,
      longitude: 106.8,
      radiusMeters: 10,
      strictOutOfRange: false,
    });

    const event = await service.checkIn('tech-1', { ...baseCheckIn, gps: { lat: -7.2, lng: 107.8, accuracy: 10 } } as any);

    expect(event.decision).toBe(ValidationDecision.ACCEPTED);
    expect(event.rangeStatus).toBe(RangeStatus.OUT_OF_RANGE);
    expect(event.rejectReason).toBeNull();
  });
});
