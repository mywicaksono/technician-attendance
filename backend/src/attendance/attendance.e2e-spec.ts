import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AuthGuard } from '@nestjs/passport';
import { AttendanceController } from './attendance.controller';
import { AttendanceService } from './attendance.service';

const attendanceServiceMock = {
  checkIn: jest.fn(),
};

class TestAuthGuard {
  canActivate(context: any) {
    const req = context.switchToHttp().getRequest();
    req.user = { userId: 'tech-1' };
    return true;
  }
}

describe('AttendanceController (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [AttendanceController],
      providers: [{ provide: AttendanceService, useValue: attendanceServiceMock }],
    })
      .overrideGuard(AuthGuard('jwt'))
      .useClass(TestAuthGuard)
      .compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('creates a check-in event', async () => {
    attendanceServiceMock.checkIn.mockResolvedValue({ id: 'event-1' });

    await request(app.getHttpServer())
      .post('/attendance/check-in')
      .send({
        siteId: 'site-1',
        qrToken: 'qr',
        selfieUrl: 's3://selfie',
        gps: { lat: 0, lng: 0, accuracy: 5 },
      })
      .expect(201);
  });
});
