import { Type } from 'class-transformer';
import { IsNotEmpty, IsString, ValidateNested } from 'class-validator';
import { DeviceDto } from './device.dto';
import { GpsDto } from './gps.dto';

export class CheckOutDto {
  @IsString()
  @IsNotEmpty()
  siteId!: string;

  @IsString()
  @IsNotEmpty()
  selfieUrl!: string;

  @ValidateNested()
  @Type(() => GpsDto)
  gps!: GpsDto;

  @ValidateNested()
  @Type(() => DeviceDto)
  device?: DeviceDto;
}
