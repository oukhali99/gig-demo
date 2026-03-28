import { useEffect, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { useAuth } from './AuthContext';
import { listPayments, type Payment } from './api';

export default function PaymentsList() {
  const { auth, loading: authLoading } = useAuth();
  const [items, setItems] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!auth?.user?.sub) return;
    listPayments({ limit: 50 })
      .then((r) => setItems(r.items ?? []))
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, [auth?.user?.sub]);

  if (authLoading) return <p>Loading…</p>;
  if (!auth) return <Navigate to="/login" replace />;
  if (loading) return <p>Loading payments…</p>;
  if (error) return <p className="error">Error: {error}</p>;

  return (
    <>
      <h1>Payments</h1>
      <p style={{ color: '#666', marginBottom: '1rem' }}>
        Holds and releases for bookings where you are the client or worker.
      </p>
      {items.length === 0 ? (
        <p>No payments yet. Payments appear after a hold is placed on a confirmed or in-progress booking.</p>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.95rem' }}>
            <thead>
              <tr style={{ textAlign: 'left', borderBottom: '1px solid #ddd' }}>
                <th style={{ padding: '0.5rem 0.75rem' }}>Status</th>
                <th style={{ padding: '0.5rem 0.75rem' }}>Amount</th>
                <th style={{ padding: '0.5rem 0.75rem' }}>Booking</th>
                <th style={{ padding: '0.5rem 0.75rem' }}>Updated</th>
              </tr>
            </thead>
            <tbody>
              {items.map((p) => (
                <tr key={p.paymentId} style={{ borderBottom: '1px solid #eee' }}>
                  <td style={{ padding: '0.6rem 0.75rem' }}>
                    <span className={`badge ${p.status}`}>{p.status}</span>
                  </td>
                  <td style={{ padding: '0.6rem 0.75rem' }}>
                    {p.amount} {p.currency}
                  </td>
                  <td style={{ padding: '0.6rem 0.75rem', fontFamily: 'monospace', fontSize: '0.85rem' }}>
                    <Link to="/bookings">{p.bookingId.slice(0, 8)}…</Link>
                  </td>
                  <td style={{ padding: '0.6rem 0.75rem', color: '#666' }}>
                    {new Date(p.updatedAt).toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
