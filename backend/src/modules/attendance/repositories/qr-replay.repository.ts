import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

@Injectable()
export class QrReplayRepository {
  async createReplayAttempt(
    tx: Prisma.TransactionClient,
    siteId: string,
    nonce: string,
    issuedAt: Date,
    expiresAt: Date,
    seenByUserId: string,
  ) {
    return tx.qrPayloadReplay.create({
      data: {
        siteId,
        nonce,
        issuedAt,
        expiresAt,
        seenByUserId,
      },
    });
  }

  async linkAcceptedEvent(tx: Prisma.TransactionClient, replayId: string, eventId: string) {
    return tx.qrPayloadReplay.update({
      where: { id: replayId },
      data: { acceptedEventId: eventId },
    });
  }
}
