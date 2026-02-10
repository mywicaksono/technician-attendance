import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../common/prisma.service';
import * as bcrypt from 'bcrypt';

interface TokenPayload {
  sub: string;
  role: string;
  type: 'access' | 'refresh';
}

@Injectable()
export class AuthService {
  constructor(private readonly prisma: PrismaService, private readonly jwtService: JwtService) {}

  async login(email: string, password: string) {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user || !user.passwordHash) {
      throw new UnauthorizedException('Invalid credentials');
    }
    const matches = await bcrypt.compare(password, user.passwordHash);
    if (!matches) {
      throw new UnauthorizedException('Invalid credentials');
    }
    return this.issueTokens(user.id, user.role);
  }

  async refresh(refreshToken: string) {
    const payload = this.jwtService.verify<TokenPayload>(refreshToken);
    if (payload.type !== 'refresh') {
      throw new UnauthorizedException('Invalid refresh token');
    }
    return this.issueTokens(payload.sub, payload.role);
  }

  private issueTokens(userId: string, role: string) {
    const accessToken = this.jwtService.sign({ sub: userId, role, type: 'access' }, { expiresIn: '15m' });
    const refreshToken = this.jwtService.sign({ sub: userId, role, type: 'refresh' }, { expiresIn: '7d' });
    return { accessToken, refreshToken, expiresIn: 900 };
  }
}
