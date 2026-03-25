import { useEffect, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { useAuth } from './AuthContext';
import { listMyDrafts, type Job } from './api';

export default function DraftList() {
  const { auth, loading: authLoading } = useAuth();
  const [drafts, setDrafts] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!auth) return;
    listMyDrafts()
      .then((res) => setDrafts(res.items))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [auth]);

  if (authLoading) return <p>Loading…</p>;
  if (!auth) return <Navigate to="/login" replace />;
  if (loading) return <p>Loading drafts…</p>;
  if (error) return <p className="error">Error: {error}</p>;

  return (
    <>
      <p><Link to="/">← Back to jobs</Link></p>
      <h1>My drafts</h1>
      {drafts.length === 0 ? (
        <p>No drafts. <Link to="/jobs/new">Post a job</Link> to create one.</p>
      ) : (
        <ul style={{ listStyle: 'none', padding: 0 }}>
          {drafts.map((job) => (
            <li key={job.jobId} className="card">
              <Link to={`/jobs/${job.jobId}`} style={{ fontWeight: 600 }}>
                {job.title}
              </Link>
              <p style={{ margin: '0.25rem 0 0', color: '#666', fontSize: '0.9rem' }}>
                {job.location} · ${job.budget} · {job.scheduledAt.slice(0, 10)}
              </p>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
