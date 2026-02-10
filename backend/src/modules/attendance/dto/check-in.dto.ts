import { IsDateString, IsString } from 'class-validator';
import { BaseAttendanceDto } from './base-attendance.dto';

export class CheckInDto extends BaseAttendanceDto {
  @IsString()
  qrPayloadHash!: string;

  @IsString()
  qrNonce!: string;

  @IsDateString()
  qrIssuedAt!: string;

  @IsDateString()
  qrExpiresAt!: string;
}
