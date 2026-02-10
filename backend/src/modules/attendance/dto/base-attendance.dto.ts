import { Type } from 'class-transformer';
import { IsDateString, IsNumber, IsOptional, IsString, IsUUID, Min } from 'class-validator';

export class BaseAttendanceDto {
  @IsUUID()
  clientEventId!: string;

  @IsUUID()
  siteId!: string;

  @IsOptional()
  @IsUUID()
  deviceId?: string;

  @IsString()
  selfieObjectKey!: string;

  @IsDateString()
  capturedAtClient!: string;

  @Type(() => Number)
  @IsNumber()
  lat!: number;

  @Type(() => Number)
  @IsNumber()
  lng!: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  accuracyMeters!: number;
}
