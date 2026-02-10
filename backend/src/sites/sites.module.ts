import { Module } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { SitesController } from './sites.controller';

@Module({
  controllers: [SitesController],
  providers: [PrismaService],
})
export class SitesModule {}
