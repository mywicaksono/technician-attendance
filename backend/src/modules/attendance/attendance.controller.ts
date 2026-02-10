import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { AttendanceService } from './attendance.service';
import { CheckInDto } from './dto/check-in.dto';
import { CheckOutDto } from './dto/check-out.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';

interface AuthRequest {
  user: {
    userId: string;
    role: Role;
  };
}

@Controller('attendance')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AttendanceController {
  constructor(private readonly attendanceService: AttendanceService) {}

  @Post('check-in')
  @Roles(Role.TECHNICIAN)
  checkIn(@Req() req: AuthRequest, @Body() body: CheckInDto) {
    return this.attendanceService.checkIn(req.user.userId, body);
  }

  @Post('check-out')
  @Roles(Role.TECHNICIAN)
  checkOut(@Req() req: AuthRequest, @Body() body: CheckOutDto) {
    return this.attendanceService.checkOut(req.user.userId, body);
  }

  @Get()
  @Roles(Role.ADMIN, Role.SUPERVISOR)
  listEvents() {
    return this.attendanceService.listEvents();
  }
}
