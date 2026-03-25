import { useEffect, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { useAuth } from './AuthContext';
import {
  listBookings,
  listJobs,
  confirmBooking,
  completeBooking,
  cancelBooking,
  getJob,
  type Booking,
  type Job,
} from './api';

export default function BookingsList() {
  const { auth, loading: authLoading } = useAuth();
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [jobs, setJobs] = useState<Record<string, Job>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [acting, setActing] = useState<string | null>(null);

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

  const handleConfirm = (b: Booking) => {
    setActing(b.bookingId);
    confirmBooking(b.bookingId)
      .then((updated) => refetchBooking(b.bookingId, updated))
      .catch((e) => setError(e.message))
      .finally(() => setActing(null));
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

  if (authLoading) return <p>Loading…</p>;
  if (!auth) return <Navigate to="/login" replace />;
  if (loading) return <p>Loading bookings…</p>;
  if (error) return <p className="error">Error: {error}</p>;

  return (
    <>
      <h1>My bookings</h1>
      <p style={{ color: '#666', marginBottom: '1rem' }}>
        Bookings where you are the worker. Confirm when the client accepts; complete when the job is done.
      </p>
      {bookings.length === 0 ? (
        <p>No bookings yet. <Link to="/">Browse jobs</Link> and book one.</p>
      ) : (
        <ul style={{ listStyle: 'none', padding: 0 }}>
          {bookings.map((b) => {
            const job = jobs[b.jobId];
            const isClient = auth.user?.sub === b.clientId;
            return (
              <li key={b.bookingId} className="card" style={{ marginBottom: '1rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.5rem' }}>
                  <div>
                    <span className={`badge ${b.status}`}>{b.status}</span>
                    {job ? (
                      <Link to={`/jobs/${b.jobId}`} style={{ display: 'block', fontWeight: 600, marginTop: '0.25rem' }}>
                        {job.title}
                      </Link>
                    ) : (
                      <span style={{ display: 'block', marginTop: '0.25rem' }}>Job {b.jobId.slice(0, 8)}…</span>
                    )}
                    <p style={{ margin: '0.25rem 0 0', fontSize: '0.9rem', color: '#666' }}>
                      Updated {new Date(b.updatedAt).toLocaleString()}
                    </p>
                  </div>
                  <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                    {b.status === 'requested' && isClient && (
                      <button
                        onClick={() => handleConfirm(b)}
                        disabled={acting === b.bookingId}
                      >
                        {acting === b.bookingId ? 'Confirming…' : 'Confirm'}
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
                    {b.status !== 'completed' && b.status !== 'cancelled' && (
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
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
