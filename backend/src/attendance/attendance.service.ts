import { BadRequestException, Injectable } from '@nestjs/common';
import { EventType, RangeStatus } from '@prisma/client';
import { PrismaService } from '../common/prisma.service';
import { CheckInDto } from './dto/check-in.dto';
import { CheckOutDto } from './dto/check-out.dto';

@Injectable()
export class AttendanceService {
  constructor(private readonly prisma: PrismaService) {}

  async checkIn(technicianId: string, payload: CheckInDto) {
    const site = await this.prisma.site.findUnique({ where: { id: payload.siteId } });
    if (!site) {
      throw new BadRequestException('Invalid site');
    }

    const qrToken = await this.prisma.siteQrToken.findFirst({
      where: { siteId: payload.siteId, token: payload.qrToken, expiresAt: { gt: new Date() } },
    });
    if (!qrToken) {
      throw new BadRequestException('Invalid or expired QR token');
    }

    await this.assertNoOpenCheckIn(technicianId);

    const rangeStatus = this.getRangeStatus(site.latitude, site.longitude, site.radiusMeters, payload.gps.lat, payload.gps.lng);

    return this.prisma.$transaction(async (tx) => {
      const event = await tx.attendanceEvent.create({
        data: {
          technicianId,
          siteId: payload.siteId,
          eventType: EventType.CHECK_IN,
          rangeStatus,
          selfieUrl: payload.selfieUrl,
          qrToken: payload.qrToken,
          lat: payload.gps.lat,
          lng: payload.gps.lng,
          accuracy: payload.gps.accuracy,
          deviceId: payload.device?.deviceId,
          deviceModel: payload.device?.model,
          osVersion: payload.device?.osVersion,
          appVersion: payload.device?.appVersion,
        },
      });

      await tx.auditLog.create({
        data: {
          actorId: technicianId,
          action: 'ATTENDANCE_CHECK_IN',
          entity: 'AttendanceEvent',
          entityId: event.id,
          metadata: { rangeStatus },
        },
      });

      return event;
    });
  }

  async checkOut(technicianId: string, payload: CheckOutDto) {
    const site = await this.prisma.site.findUnique({ where: { id: payload.siteId } });
    if (!site) {
      throw new BadRequestException('Invalid site');
    }

    const lastEvent = await this.prisma.attendanceEvent.findFirst({
      where: { technicianId },
      orderBy: { createdAt: 'desc' },
    });

    if (!lastEvent || lastEvent.eventType !== EventType.CHECK_IN) {
      throw new BadRequestException('No active check-in');
    }

    const rangeStatus = this.getRangeStatus(site.latitude, site.longitude, site.radiusMeters, payload.gps.lat, payload.gps.lng);

    return this.prisma.$transaction(async (tx) => {
      const event = await tx.attendanceEvent.create({
        data: {
          technicianId,
          siteId: payload.siteId,
          eventType: EventType.CHECK_OUT,
          rangeStatus,
          selfieUrl: payload.selfieUrl,
          lat: payload.gps.lat,
          lng: payload.gps.lng,
          accuracy: payload.gps.accuracy,
          deviceId: payload.device?.deviceId,
          deviceModel: payload.device?.model,
          osVersion: payload.device?.osVersion,
          appVersion: payload.device?.appVersion,
        },
      });

      await tx.auditLog.create({
        data: {
          actorId: technicianId,
          action: 'ATTENDANCE_CHECK_OUT',
          entity: 'AttendanceEvent',
          entityId: event.id,
          metadata: { rangeStatus },
        },
      });

      return event;
    });
  }

  private async assertNoOpenCheckIn(technicianId: string) {
    const lastEvent = await this.prisma.attendanceEvent.findFirst({
      where: { technicianId },
      orderBy: { createdAt: 'desc' },
    });
    if (lastEvent && lastEvent.eventType === EventType.CHECK_IN) {
      throw new BadRequestException('Active check-in already exists');
    }
  }

  private getRangeStatus(siteLat: number, siteLng: number, radiusMeters: number, lat: number, lng: number): RangeStatus {
    const distance = this.haversineDistance(siteLat, siteLng, lat, lng);
    return distance <= radiusMeters ? RangeStatus.IN_RANGE : RangeStatus.OUT_OF_RANGE;
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
