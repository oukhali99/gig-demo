import { useEffect, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { loadStripe } from '@stripe/stripe-js';
import { Elements, CardElement, useStripe, useElements } from '@stripe/react-stripe-js';
import { useAuth } from './AuthContext';
import {
  getUser,
  listBookings,
  listJobs,
  confirmBooking,
  completeBooking,
  cancelBooking,
  getJob,
  type Booking,
  type Job,
} from './api';

const STRIPE_PUBLISHABLE_KEY = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY as string | undefined;
const stripePromise = STRIPE_PUBLISHABLE_KEY ? loadStripe(STRIPE_PUBLISHABLE_KEY) : null;

interface ConfirmCardFormProps {
  booking: Booking;
  job: Job | undefined;
  onSuccess: (updated: Booking) => void;
  onCancel: () => void;
}

function ConfirmCardForm({ booking, job, onSuccess, onCancel }: ConfirmCardFormProps) {
  const stripe = useStripe();
  const elements = useElements();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stripe || !elements) return;
    setError(null);
    setSubmitting(true);
    const card = elements.getElement(CardElement);
    if (!card) {
      setError('Card element not found');
      setSubmitting(false);
      return;
    }
    const { paymentMethod, error: pmErr } = await stripe.createPaymentMethod({ type: 'card', card });
    if (pmErr || !paymentMethod) {
      setError(pmErr?.message ?? 'Failed to process card');
      setSubmitting(false);
      return;
    }
    confirmBooking(booking.bookingId, paymentMethod.id)
      .then(onSuccess)
      .catch((err: Error) => setError(err.message))
      .finally(() => setSubmitting(false));
  };

  const budgetDisplay = job?.budget ? `$${(job.budget / 100).toFixed(2)}` : null;

  return (
    <form onSubmit={handleSubmit} className="card" style={{ marginTop: '0.5rem' }}>
      <p style={{ marginBottom: '0.5rem' }}>
        {budgetDisplay ? `A hold of ${budgetDisplay} will be placed on your card and captured when the job is complete.` : 'Confirm this booking.'}
      </p>
      {STRIPE_PUBLISHABLE_KEY && (
        <div style={{ border: '1px solid #ccc', borderRadius: '4px', padding: '0.6rem', marginBottom: '0.75rem' }}>
          <CardElement options={{ style: { base: { fontSize: '16px' } } }} />
        </div>
      )}
      {error && <p className="error">{error}</p>}
      <div style={{ display: 'flex', gap: '0.5rem' }}>
        <button type="submit" disabled={submitting || (!!STRIPE_PUBLISHABLE_KEY && !stripe)}>
          {submitting ? 'Confirming…' : 'Confirm booking'}
        </button>
        <button type="button" className="secondary" onClick={onCancel} disabled={submitting}>
          Cancel
        </button>
      </div>
    </form>
  );
}

export default function BookingsList() {
  const { auth, loading: authLoading } = useAuth();
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [jobs, setJobs] = useState<Record<string, Job>>({});
  const [users, setUsers] = useState<Record<string, { name?: string; email?: string }>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [acting, setActing] = useState<string | null>(null);
  const [confirmingBookingId, setConfirmingBookingId] = useState<string | null>(null);

  useEffect(() => {
    if (!auth?.user?.sub) return;
    const sub = auth.user.sub;
    Promise.all([
      listBookings({ workerId: sub, limit: 50 }),
      listJobs({ clientId: 'me', status: 'published', limit: 50 }).then((r) =>
        Promise.all(r.items.map((job) => listBookings({ jobId: job.jobId, limit: 20 }).then((br) => br.items)))
      ).then((arrays) => arrays.flat()),
    ])
      .then(([workerRes, clientBookings]) => {
        const byId = new Map<string, Booking>();
        workerRes.items.forEach((b) => byId.set(b.bookingId, b));
        clientBookings.forEach((b) => {
          if (b.clientId === sub) byId.set(b.bookingId, b);
        });
        const list = Array.from(byId.values()).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
        setBookings(list);
        const jobIds = [...new Set(list.map((b) => b.jobId))];
        const userIds = [...new Set(list.flatMap((b) => [b.clientId, b.workerId]))];
        Promise.all(userIds.map((id) => getUser(id).then((u) => [id, { name: u.name ?? undefined, email: u.email ?? undefined }] as const).catch(() => [id, { email: id }] as const)))
          .then((list) => {
            const usersMap: Record<string, { name?: string; email?: string }> = {};
            list.forEach(([id, user]) => { usersMap[id] = user; });
            setUsers(usersMap);
          });
        return Promise.all(jobIds.map((id: string) => getJob(id).then((job: Job) => [id, job] as const)));
      })
      .then((jobPairs) => {
        const jobMap: Record<string, Job> = {};
        (jobPairs as [string, Job][]).forEach(([id, job]) => { jobMap[id] = job; });
        setJobs(jobMap);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [auth?.user?.sub]);

  const refetchBooking = (bookingId: string, updated: Booking) => {
    setBookings((prev) => prev.map((b) => (b.bookingId === bookingId ? updated : b)));
  };

  const handleComplete = (b: Booking) => {
    setActing(b.bookingId);
    completeBooking(b.bookingId)
      .then((updated) => refetchBooking(b.bookingId, updated))
      .catch((e) => setError(e.message))
      .finally(() => setActing(null));
  };

  const handleCancel = (b: Booking) => {
    setActing(b.bookingId);
    cancelBooking(b.bookingId)
      .then((updated) => refetchBooking(b.bookingId, updated))
      .catch((e) => setError(e.message))
      .finally(() => setActing(null));
  };

  if (authLoading) return <p className="state-loading">Loading…</p>;
  if (!auth) return <Navigate to="/login" replace />;
  if (loading) return <p className="state-loading">Loading bookings…</p>;
  if (error) return <p className="error">Error: {error}</p>;

  return (
    <>
      <h1>My bookings</h1>
      <p className="state-muted">
        Bookings where you are the worker. Confirm when the client accepts; complete when the job is done.
      </p>
      {bookings.length === 0 ? (
        <p>No bookings yet. <Link to="/">Browse jobs</Link> and book one.</p>
      ) : (
        <ul className="booking-list">
          {bookings.map((b) => {
            const job = jobs[b.jobId];
            const isClient = auth.user?.sub === b.clientId;
            const isConfirming = confirmingBookingId === b.bookingId;
            return (
              <li key={b.bookingId} className="card booking-card">
                <div className="booking-card-row">
                  <div>
                    <span className={`badge ${b.status}`}>{b.status}</span>
                    {job ? (
                      <Link to={`/jobs/${b.jobId}`} className="booking-job-link">
                        {job.title}
                      </Link>
                    ) : (
                      <span className="booking-job-fallback">Job {b.jobId.slice(0, 8)}…</span>
                    )}
                    <p className="job-card-meta">Updated {new Date(b.updatedAt).toLocaleString()}</p>
                    <p className="booking-persons">
                      Client:{' '}
                      <Link to={`/users/${b.clientId}`}>
                        {users[b.clientId]?.name ?? users[b.clientId]?.email ?? b.clientId}
                      </Link>
                      {' '}• Worker:{' '}
                      <Link to={`/users/${b.workerId}`}>
                        {users[b.workerId]?.name ?? users[b.workerId]?.email ?? b.workerId}
                      </Link>
                    </p>
                  </div>
                  <div className="booking-card-actions">
                    {b.status === 'requested' && isClient && !isConfirming && (
                      <button onClick={() => setConfirmingBookingId(b.bookingId)}>
                        Confirm
                      </button>
                    )}
                    {(b.status === 'confirmed' || b.status === 'in_progress') && (
                      <button
                        onClick={() => handleComplete(b)}
                        disabled={acting === b.bookingId}
                      >
                        {acting === b.bookingId ? 'Completing…' : 'Mark complete'}
                      </button>
                    )}
                    {b.status !== 'completed' && b.status !== 'cancelled' && !isConfirming && (
                      <button
                        type="button"
                        className="secondary"
                        onClick={() => handleCancel(b)}
                        disabled={acting === b.bookingId}
                      >
                        {acting === b.bookingId ? 'Cancelling…' : 'Cancel'}
                      </button>
                    )}
                  </div>
                </div>
                {isConfirming && (
                  stripePromise ? (
                    <Elements stripe={stripePromise}>
                      <ConfirmCardForm
                        booking={b}
                        job={job}
                        onSuccess={(updated) => {
                          refetchBooking(b.bookingId, updated);
                          setConfirmingBookingId(null);
                        }}
                        onCancel={() => setConfirmingBookingId(null)}
                      />
                    </Elements>
                  ) : (
                    <ConfirmCardForm
                      booking={b}
                      job={job}
                      onSuccess={(updated) => {
                        refetchBooking(b.bookingId, updated);
                        setConfirmingBookingId(null);
                      }}
                      onCancel={() => setConfirmingBookingId(null)}
                    />
                  )
                )}
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
