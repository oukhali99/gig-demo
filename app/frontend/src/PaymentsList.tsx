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

  if (authLoading) return <p className="state-loading">Loading…</p>;
  if (!auth) return <Navigate to="/login" replace />;
  if (loading) return <p className="state-loading">Loading payments…</p>;
  if (error) return <p className="error">Error: {error}</p>;

  return (
    <>
      <h1>Payments</h1>
      <p className="state-muted">Holds and releases for bookings where you are the client or worker.</p>
      {items.length === 0 ? (
        <p>No payments yet. Payments appear after a hold is placed on a confirmed or in-progress booking.</p>
      ) : (
        <div className="data-table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Status</th>
                <th>Amount</th>
                <th>Booking</th>
                <th>Updated</th>
              </tr>
            </thead>
            <tbody>
              {items.map((p) => (
                <tr key={p.paymentId}>
                  <td>
                    <span className={`badge ${p.status}`}>{p.status}</span>
                  </td>
                  <td>
                    {p.amount} {p.currency}
                  </td>
                  <td className="data-table-mono">
                    <Link to="/bookings">{p.bookingId.slice(0, 8)}…</Link>
                  </td>
                  <td className="data-table-muted">{new Date(p.updatedAt).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
