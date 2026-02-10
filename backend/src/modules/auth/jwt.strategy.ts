import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { Role } from '@prisma/client';

export interface JwtPrincipal {
  sub: string;
  role: Role;
  type: 'access' | 'refresh';
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(configService: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: configService.get<string>('JWT_SECRET', 'dev-secret'),
      ignoreExpiration: false,
    });
  }

  validate(payload: JwtPrincipal): { userId: string; role: Role; type: 'access' | 'refresh' } {
    return { userId: payload.sub, role: payload.role, type: payload.type };
  }
}
