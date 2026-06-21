import { useEffect, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { useAuth } from './AuthContext';
import { getUser, listJobs, type Job } from './api';

export default function JobList() {
  const { auth, loading: authLoading } = useAuth();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [users, setUsers] = useState<Record<string, { name?: string; email?: string }>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!auth) return;
    listJobs({ status: 'published', limit: 20 })
      .then((res) => {
        setJobs(res.items);
        const userIds = Array.from(new Set(res.items.map((job) => job.clientId)));
        return Promise.all(userIds.map((id) => getUser(id).then((u) => [id, { name: u.name ?? undefined, email: u.email ?? undefined }] as const).catch(() => [id, { email: id }] as const)));
      })
      .then((list) => {
        const userMap: Record<string, { name?: string; email?: string }> = {};
        list.forEach(([id, user]) => { userMap[id] = user; });
        setUsers(userMap);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [auth]);

  if (authLoading) return <p className="state-loading">Loading…</p>;
  if (!auth) return <Navigate to="/login" replace />;
  if (loading) return <p className="state-loading">Loading the board…</p>;
  if (error) return <p className="error">Couldn't load the board: {error}</p>;

  const prettyCategory = (id: string) =>
    id.replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

  return (
    <>
      <header className="page-head">
        <div>
          <p className="eyebrow">On the board</p>
          <h1>Open gigs</h1>
        </div>
        <Link to="/jobs/new" className="btn-signal">
          Post a job
        </Link>
      </header>
      {jobs.length === 0 ? (
        <div className="board-empty">
          <p>The board's empty right now. Be the first to pin a job.</p>
          <Link to="/jobs/new" className="btn-signal">
            Post the first job
          </Link>
        </div>
      ) : (
        <ul className="ticket-grid">
          {jobs.map((job) => (
            <li key={job.jobId}>
              <Link to={`/jobs/${job.jobId}`} className="ticket">
                <div className="ticket-head">
                  <span className="ticket-tag">{prettyCategory(job.categoryId)}</span>
                  <span className="ticket-stamp">Open</span>
                </div>
                <h2 className="ticket-title">{job.title}</h2>
                <dl className="ticket-meta">
                  <div>
                    <dt>Pay</dt>
                    <dd className="ticket-pay">${(job.budget / 100).toFixed(0)}</dd>
                  </div>
                  <div>
                    <dt>Where</dt>
                    <dd>{job.location}</dd>
                  </div>
                  <div>
                    <dt>When</dt>
                    <dd className="mono">{job.scheduledAt.slice(0, 10)}</dd>
                  </div>
                </dl>
                <p className="ticket-by">
                  Posted by {users[job.clientId]?.name ?? users[job.clientId]?.email ?? 'a neighbor'}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
