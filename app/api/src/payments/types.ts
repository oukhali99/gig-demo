export type PaymentStatus = 'hold_created' | 'released' | 'transferred' | 'transfer_failed' | 'refunded';

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
  transferId?: string;
}

export interface CreateHoldInput {
  bookingId: string;
  amount: number;
  currency?: string;
}
