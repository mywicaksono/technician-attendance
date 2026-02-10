import { Module } from '@nestjs/common';
import { AttendanceController } from './attendance.controller';
import { AttendanceService } from './attendance.service';
import { AttendanceRepository } from './repositories/attendance.repository';
import { SitesRepository } from './repositories/sites.repository';
import { QrReplayRepository } from './repositories/qr-replay.repository';

@Module({
  controllers: [AttendanceController],
  providers: [AttendanceService, AttendanceRepository, SitesRepository, QrReplayRepository],
})
export class AttendanceModule {}
