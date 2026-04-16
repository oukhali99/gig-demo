export type PaymentStatus = 'hold_created' | 'released' | 'refunded';

export interface Payment {
  paymentId: string;
  bookingId: string;
  amount: number;
  currency: string;
  status: PaymentStatus;
  createdAt: string;
  updatedAt: string;
  idempotencyKey?: string;
  clientId?: string;
  workerId?: string;
  stripePaymentIntentId?: string;
}

export interface CreateHoldInput {
  bookingId: string;
  amount: number;
  currency?: string;
}
