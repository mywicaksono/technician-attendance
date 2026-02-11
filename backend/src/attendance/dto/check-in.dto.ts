import { Type } from 'class-transformer';
import { IsDateString, IsNotEmpty, IsOptional, IsString, IsUUID, ValidateNested } from 'class-validator';
import { DeviceDto } from './device.dto';
import { GpsDto } from './gps.dto';

export class CheckInDto {
  @IsUUID()
  siteId!: string;

  @IsUUID()
  clientEventId!: string;

  @IsString()
  @IsNotEmpty()
  qrToken!: string;

  @IsString()
  @IsNotEmpty()
  selfieObjectKey!: string;

  @IsOptional()
  @IsString()
  selfieUrl?: string;

  @IsDateString()
  capturedAtClient!: string;

  @ValidateNested()
  @Type(() => GpsDto)
  gps!: GpsDto;

  @ValidateNested()
  @Type(() => DeviceDto)
  device?: DeviceDto;
}
