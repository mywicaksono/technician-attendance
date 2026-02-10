import { AttendanceEvent, EventType, RejectReason, ValidationDecision, RangeStatus } from '@prisma/client';

export interface AttendanceDecisionInput {
  decision: ValidationDecision;
  rangeStatus: RangeStatus | null;
  rejectReason: RejectReason | null;
}

export interface AttendanceCreateInput {
  technicianId: string;
  siteId: string;
  deviceId?: string;
  clientEventId: string;
  eventType: EventType;
  selfieObjectKey: string;
  qrPayloadHash?: string;
  qrNonce?: string;
  qrIssuedAt?: Date;
  qrExpiresAt?: Date;
  lat: number;
  lng: number;
  accuracyMeters: number;
  capturedAtClient: Date;
  occurredAtServer: Date;
  decision: ValidationDecision;
  rangeStatus: RangeStatus | null;
  rejectReason: RejectReason | null;
}

export type AttendanceCanonicalResponse = AttendanceEvent;
