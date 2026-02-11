import { Type } from 'class-transformer';
import { IsNumber, Min } from 'class-validator';

export class GpsDto {
  @Type(() => Number)
  @IsNumber()
  lat!: number;

  @Type(() => Number)
  @IsNumber()
  lng!: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  accuracy!: number;
}
