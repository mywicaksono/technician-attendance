import { IsNumber } from 'class-validator';

export class GpsDto {
  @IsNumber()
  lat!: number;

  @IsNumber()
  lng!: number;

  @IsNumber()
  accuracy!: number;
}
