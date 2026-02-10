import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { AttendanceService } from './attendance.service';
import { CheckInDto } from './dto/check-in.dto';
import { CheckOutDto } from './dto/check-out.dto';

@Controller('attendance')
export class AttendanceController {
  constructor(private readonly attendanceService: AttendanceService) {}

  @UseGuards(AuthGuard('jwt'))
  @Post('check-in')
  async checkIn(@Req() req: { user: { userId: string } }, @Body() body: CheckInDto) {
    return this.attendanceService.checkIn(req.user.userId, body);
  }

  @UseGuards(AuthGuard('jwt'))
  @Post('check-out')
  async checkOut(@Req() req: { user: { userId: string } }, @Body() body: CheckOutDto) {
    return this.attendanceService.checkOut(req.user.userId, body);
  }
}
