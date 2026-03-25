export type PaymentStatus = 'hold_created' | 'released' | 'refunded';

export interface Payment {
  paymentId: string;
  bookingId: string;
  amount: string;
  currency: string;
  status: PaymentStatus;
  createdAt: string;
  updatedAt: string;
  idempotencyKey?: string;
  clientId?: string;
  workerId?: string;
}

export interface CreateHoldInput {
  bookingId: string;
  amount: string;
  currency?: string;
}
