import { Injectable } from '@nestjs/common';
import { Site } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';

@Injectable()
export class SitesRepository {
  constructor(private readonly prisma: PrismaService) {}

  findById(id: string): Promise<Site | null> {
    return this.prisma.site.findUnique({ where: { id } });
  }
}
