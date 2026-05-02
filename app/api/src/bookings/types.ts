export type BookingStatus =
  | 'requested'
  | 'confirmed'
  | 'in_progress'
  | 'completed'
  | 'cancelled';

export interface Booking {
  bookingId: string;
  jobId: string;
  workerId: string;
  clientId: string;
  status: BookingStatus;
  createdAt: string;
  updatedAt: string;
  idempotencyKey?: string;
  imageKeys?: string[];
}

export interface CreateBookingInput {
  jobId: string;
}

export interface ListBookingsQuery {
  jobId?: string;
  workerId?: string;
  clientId?: string;
  status?: BookingStatus;
  limit?: number;
  cursor?: string;
}

export interface EnrichedBooking extends Booking {
  jobTitle?: string;
  clientName?: string;
  workerName?: string;
}

export interface ListBookingsResult {
  items: Booking[];
  nextCursor?: string;
}
