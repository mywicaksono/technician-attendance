import { HttpStatus, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { Role } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { UsersRepository } from './repositories/users.repository';
import { AppException } from '../../common/app.exception';
import { ErrorCode } from '../../common/error-codes';

export interface Tokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

@Injectable()
export class AuthService {
  private readonly accessTtl: string;
  private readonly refreshTtl: string;

  constructor(
    private readonly usersRepository: UsersRepository,
    private readonly jwtService: JwtService,
    configService: ConfigService,
  ) {
    this.accessTtl = configService.get<string>('JWT_ACCESS_TTL', '15m');
    this.refreshTtl = configService.get<string>('JWT_REFRESH_TTL', '7d');
  }

  async register(email: string, password: string, role: Role = Role.TECHNICIAN): Promise<Tokens> {
    const existing = await this.usersRepository.findByEmail(email);
    if (existing) {
      throw new AppException(ErrorCode.VALIDATION_ERROR, 'Email already registered', HttpStatus.CONFLICT);
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await this.usersRepository.createLocalUser(email, passwordHash, role);
    return this.issueTokens(user.id, user.role);
  }

  async login(email: string, password: string): Promise<Tokens> {
    const user = await this.usersRepository.findByEmail(email);
    if (!user?.passwordHash) {
      throw new AppException(ErrorCode.UNAUTHORIZED, 'Invalid credentials', HttpStatus.UNAUTHORIZED);
    }

    const match = await bcrypt.compare(password, user.passwordHash);
    if (!match) {
      throw new AppException(ErrorCode.UNAUTHORIZED, 'Invalid credentials', HttpStatus.UNAUTHORIZED);
    }

    return this.issueTokens(user.id, user.role);
  }

  async refresh(refreshToken: string): Promise<Tokens> {
    const payload = this.jwtService.verify<{ sub: string; role: Role; type: 'access' | 'refresh' }>(refreshToken);
    if (payload.type !== 'refresh') {
      throw new AppException(ErrorCode.UNAUTHORIZED, 'Invalid refresh token', HttpStatus.UNAUTHORIZED);
    }

    return this.issueTokens(payload.sub, payload.role);
  }

  private issueTokens(userId: string, role: Role): Tokens {
    const accessToken = this.jwtService.sign({ sub: userId, role, type: 'access' }, { expiresIn: this.accessTtl });
    const refreshToken = this.jwtService.sign({ sub: userId, role, type: 'refresh' }, { expiresIn: this.refreshTtl });

    return { accessToken, refreshToken, expiresIn: 900 };
  }
}
