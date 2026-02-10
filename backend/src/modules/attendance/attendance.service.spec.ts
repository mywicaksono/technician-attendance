import { RejectReason, ValidationDecision } from '@prisma/client';
import { AttendanceService } from './attendance.service';

const attendanceRepository = {
  findByTechnicianAndClientEventId: jest.fn(),
  findOpenSession: jest.fn(),
  createEvent: jest.fn(),
  createOpenSession: jest.fn(),
  closeOpenSession: jest.fn(),
  runInTransaction: jest.fn(async (fn: any) => fn({})),
};

const sitesRepository = {
  findById: jest.fn(),
};

const qrReplayRepository = {
  createReplayAttempt: jest.fn(),
  linkAcceptedEvent: jest.fn(),
};

describe('AttendanceService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    sitesRepository.findById.mockResolvedValue({
      id: 'site-1',
      latitude: 0,
      longitude: 0,
      radiusMeters: 100,
      strictOutOfRange: false,
    });
    attendanceRepository.createEvent.mockImplementation(async (_input: any) => ({
      id: 'event-1',
      decision: _input.decision,
      rejectReason: _input.rejectReason,
      rangeStatus: _input.rangeStatus,
      occurredAtServer: new Date(),
      clientEventId: _input.clientEventId,
    }));
  });

  it('returns canonical event for idempotency', async () => {
    const service = new AttendanceService(attendanceRepository as any, sitesRepository as any, qrReplayRepository as any);
    attendanceRepository.findByTechnicianAndClientEventId.mockResolvedValueOnce({ id: 'existing' });

    const result = await service.checkOut('tech-1', {
      clientEventId: '2f1d6f3f-0ab1-4b5f-a78c-cd6a6804f2f1',
      siteId: '550e8400-e29b-41d4-a716-446655440000',
      selfieObjectKey: 'selfie',
      capturedAtClient: new Date().toISOString(),
      lat: 0,
      lng: 0,
      accuracyMeters: 1,
    });

    expect(result).toEqual({ id: 'existing' });
  });

  it('rejects check-in when open session exists', async () => {
    const service = new AttendanceService(attendanceRepository as any, sitesRepository as any, qrReplayRepository as any);
    attendanceRepository.findByTechnicianAndClientEventId.mockResolvedValue(null);
    attendanceRepository.findOpenSession.mockResolvedValue({ id: 'open-1' });

    const result = await service.checkIn('tech-1', {
      clientEventId: '2f1d6f3f-0ab1-4b5f-a78c-cd6a6804f2f1',
      siteId: '550e8400-e29b-41d4-a716-446655440000',
      selfieObjectKey: 'selfie',
      capturedAtClient: new Date().toISOString(),
      lat: 0,
      lng: 0,
      accuracyMeters: 1,
      qrPayloadHash: 'hash',
      qrNonce: 'nonce',
      qrIssuedAt: new Date().toISOString(),
      qrExpiresAt: new Date(Date.now() + 60_000).toISOString(),
    });

    expect(result.decision).toBe(ValidationDecision.REJECTED);
    expect(result.rejectReason).toBe(RejectReason.INVALID_SESSION);
  });

  it('rejects check-out when no open session', async () => {
    const service = new AttendanceService(attendanceRepository as any, sitesRepository as any, qrReplayRepository as any);
    attendanceRepository.findByTechnicianAndClientEventId.mockResolvedValue(null);
    attendanceRepository.findOpenSession.mockResolvedValue(null);

    const result = await service.checkOut('tech-1', {
      clientEventId: '2f1d6f3f-0ab1-4b5f-a78c-cd6a6804f2f1',
      siteId: '550e8400-e29b-41d4-a716-446655440000',
      selfieObjectKey: 'selfie',
      capturedAtClient: new Date().toISOString(),
      lat: 0,
      lng: 0,
      accuracyMeters: 1,
    });

    expect(result.decision).toBe(ValidationDecision.REJECTED);
    expect(result.rejectReason).toBe(RejectReason.INVALID_SESSION);
  });

  it('uses strict and non-strict out-of-range policies', async () => {
    const service = new AttendanceService(attendanceRepository as any, sitesRepository as any, qrReplayRepository as any);
    attendanceRepository.findByTechnicianAndClientEventId.mockResolvedValue(null);
    attendanceRepository.findOpenSession.mockResolvedValue(null);
    qrReplayRepository.createReplayAttempt.mockResolvedValue({ id: 'r-1' });

    sitesRepository.findById.mockResolvedValueOnce({
      id: 'site-1',
      latitude: 0,
      longitude: 0,
      radiusMeters: 10,
      strictOutOfRange: false,
    });
    const nonStrict = await service.checkIn('tech-1', {
      clientEventId: '2f1d6f3f-0ab1-4b5f-a78c-cd6a6804f2f1',
      siteId: '550e8400-e29b-41d4-a716-446655440000',
      selfieObjectKey: 'selfie',
      capturedAtClient: new Date().toISOString(),
      lat: 1,
      lng: 1,
      accuracyMeters: 1,
      qrPayloadHash: 'hash',
      qrNonce: 'nonce-a',
      qrIssuedAt: new Date().toISOString(),
      qrExpiresAt: new Date(Date.now() + 60_000).toISOString(),
    });

    sitesRepository.findById.mockResolvedValueOnce({
      id: 'site-1',
      latitude: 0,
      longitude: 0,
      radiusMeters: 10,
      strictOutOfRange: true,
    });
    const strict = await service.checkIn('tech-1', {
      clientEventId: '0c556be5-53a4-45f0-b1e9-7c9eb732f3ba',
      siteId: '550e8400-e29b-41d4-a716-446655440000',
      selfieObjectKey: 'selfie',
      capturedAtClient: new Date().toISOString(),
      lat: 1,
      lng: 1,
      accuracyMeters: 1,
      qrPayloadHash: 'hash',
      qrNonce: 'nonce-b',
      qrIssuedAt: new Date().toISOString(),
      qrExpiresAt: new Date(Date.now() + 60_000).toISOString(),
    });

    expect(nonStrict.decision).toBe(ValidationDecision.ACCEPTED);
    expect(strict.decision).toBe(ValidationDecision.REJECTED);
    expect(strict.rejectReason).toBe(RejectReason.OUT_OF_RANGE);
  });

  it('rejects replay on check-in', async () => {
    const service = new AttendanceService(attendanceRepository as any, sitesRepository as any, qrReplayRepository as any);
    attendanceRepository.findByTechnicianAndClientEventId.mockResolvedValue(null);
    attendanceRepository.findOpenSession.mockResolvedValue(null);
    qrReplayRepository.createReplayAttempt.mockRejectedValue({ code: 'P2002' });

    const result = await service.checkIn('tech-1', {
      clientEventId: '2f1d6f3f-0ab1-4b5f-a78c-cd6a6804f2f1',
      siteId: '550e8400-e29b-41d4-a716-446655440000',
      selfieObjectKey: 'selfie',
      capturedAtClient: new Date().toISOString(),
      lat: 0,
      lng: 0,
      accuracyMeters: 1,
      qrPayloadHash: 'hash',
      qrNonce: 'nonce',
      qrIssuedAt: new Date().toISOString(),
      qrExpiresAt: new Date(Date.now() + 60_000).toISOString(),
    });

    expect(result.decision).toBe(ValidationDecision.REJECTED);
    expect(result.rejectReason).toBe(RejectReason.REPLAY);
  });
});
