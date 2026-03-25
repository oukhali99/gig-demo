import { randomUUID } from 'crypto';

export interface EventEnvelope {
  eventId: string;
  eventType: string;
  eventVersion: string;
  correlationId: string;
  timestamp: string;
  producer: string;
  payload: Record<string, unknown>;
}

export function createEventEnvelope(
  producer: string,
  eventVersion: string,
  eventType: string,
  payload: Record<string, unknown>,
  correlationId: string
): EventEnvelope {
  return {
    eventId: randomUUID(),
    eventType,
    eventVersion,
    correlationId,
    timestamp: new Date().toISOString(),
    producer,
    payload,
  };
}
