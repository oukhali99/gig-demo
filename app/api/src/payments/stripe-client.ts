import Stripe from 'stripe';

let stripeInstance: Stripe | null = null;

function getStripe(): Stripe {
  if (stripeInstance) return stripeInstance;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key?.startsWith('sk_')) {
    throw new Error('STRIPE_SECRET_KEY not configured');
  }
  stripeInstance = new Stripe(key, { apiVersion: Stripe.API_VERSION });
  return stripeInstance;
}

export function isStripeConfigured(): boolean {
  return !!process.env.STRIPE_SECRET_KEY?.startsWith('sk_');
}

export async function createPaymentIntent(params: {
  amountCents: number;
  currency: string;
  bookingId: string;
  paymentMethodId: string;
}): Promise<Stripe.PaymentIntent> {
  const stripe = getStripe();
  return stripe.paymentIntents.create({
    amount: params.amountCents,
    currency: params.currency.toLowerCase(),
    payment_method: params.paymentMethodId,
    capture_method: 'manual',
    confirm: true,
    return_url: 'https://gigboard.example.com/bookings',
    metadata: { bookingId: params.bookingId },
  });
}

export async function capturePaymentIntent(paymentIntentId: string): Promise<Stripe.PaymentIntent> {
  const stripe = getStripe();
  return stripe.paymentIntents.capture(paymentIntentId);
}

export async function cancelPaymentIntent(paymentIntentId: string): Promise<Stripe.PaymentIntent> {
  const stripe = getStripe();
  return stripe.paymentIntents.cancel(paymentIntentId);
}

export async function refundPayment(paymentIntentId: string): Promise<Stripe.Refund> {
  const stripe = getStripe();
  return stripe.refunds.create({ payment_intent: paymentIntentId });
}

export async function createTransfer(params: {
  amountCents: number;
  currency: string;
  destination: string;
  bookingId: string;
}): Promise<Stripe.Transfer> {
  const stripe = getStripe();
  return stripe.transfers.create({
    amount: params.amountCents,
    currency: params.currency.toLowerCase(),
    destination: params.destination,
    metadata: { bookingId: params.bookingId },
  });
}

export async function createConnectAccount(): Promise<Stripe.Account> {
  const stripe = getStripe();
  return stripe.accounts.create({ type: 'express' });
}

export async function createAccountLink(params: {
  accountId: string;
  returnUrl: string;
  refreshUrl: string;
}): Promise<Stripe.AccountLink> {
  const stripe = getStripe();
  return stripe.accountLinks.create({
    account: params.accountId,
    return_url: params.returnUrl,
    refresh_url: params.refreshUrl,
    type: 'account_onboarding',
  });
}

export async function getConnectAccount(accountId: string): Promise<Stripe.Account> {
  const stripe = getStripe();
  return stripe.accounts.retrieve(accountId);
}

export function constructWebhookEvent(rawBody: string, signature: string): Stripe.Event {
  const stripe = getStripe();
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret?.startsWith('whsec_')) {
    throw new Error('STRIPE_WEBHOOK_SECRET not configured');
  }
  return stripe.webhooks.constructEvent(rawBody, signature, secret);
}

