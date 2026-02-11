import { BadRequestException } from '@nestjs/common';
import { AttendanceService } from './attendance.service';
import { PrismaService } from '../common/prisma.service';
import { EventType } from '@prisma/client';

const prismaMock = {
  site: {
    findUnique: jest.fn(),
  },
  siteQrToken: {
    findFirst: jest.fn(),
  },
  attendanceEvent: {
    findFirst: jest.fn(),
    create: jest.fn(),
  },
  auditLog: {
    create: jest.fn(),
  },
  $transaction: jest.fn(async (callback: any) => callback(prismaMock)),
} as unknown as PrismaService;

describe('AttendanceService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('rejects check-in when an active check-in exists', async () => {
    const service = new AttendanceService(prismaMock);
    prismaMock.site.findUnique.mockResolvedValue({
      id: 'site-1',
      latitude: 0,
      longitude: 0,
      radiusMeters: 100,
    });
    prismaMock.siteQrToken.findFirst.mockResolvedValue({ id: 'token-1' });
    prismaMock.attendanceEvent.findFirst.mockResolvedValue({ eventType: EventType.CHECK_IN });

    await expect(
      service.checkIn('tech-1', {
        siteId: 'site-1',
        qrToken: 'qr',
        selfieUrl: 's3://selfie',
        gps: { lat: 0, lng: 0, accuracy: 5 },
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects check-in when QR token is invalid', async () => {
    const service = new AttendanceService(prismaMock);
    prismaMock.site.findUnique.mockResolvedValue({
      id: 'site-1',
      latitude: 0,
      longitude: 0,
      radiusMeters: 100,
    });
    prismaMock.siteQrToken.findFirst.mockResolvedValue(null);

    await expect(
      service.checkIn('tech-1', {
        siteId: 'site-1',
        qrToken: 'qr',
        selfieUrl: 's3://selfie',
        gps: { lat: 0, lng: 0, accuracy: 5 },
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
