import { Controller, Get, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { PrismaService } from '../common/prisma.service';

@Controller('sites')
export class SitesController {
  constructor(private readonly prisma: PrismaService) {}

  @UseGuards(AuthGuard('jwt'))
  @Get()
  async listSites() {
    return this.prisma.site.findMany({ orderBy: { name: 'asc' } });
  }
}
