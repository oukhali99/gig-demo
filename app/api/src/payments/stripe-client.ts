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

export function constructWebhookEvent(rawBody: string, signature: string): Stripe.Event {
  const stripe = getStripe();
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret?.startsWith('whsec_')) {
    throw new Error('STRIPE_WEBHOOK_SECRET not configured');
  }
  return stripe.webhooks.constructEvent(rawBody, signature, secret);
}
