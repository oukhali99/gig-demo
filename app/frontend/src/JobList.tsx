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
  if (loading) return <p className="state-loading">Loading jobs…</p>;
  if (error) return <p className="error">Error: {error}</p>;

  return (
    <>
      <h1>Jobs</h1>
      {jobs.length === 0 ? (
        <p>No published jobs yet. <Link to="/jobs/new">Post one</Link>.</p>
      ) : (
        <ul className="job-list">
          {jobs.map((job) => (
            <li key={job.jobId} className="card job-card">
              <Link to={`/jobs/${job.jobId}`} className="job-card-title">
                {job.title}
              </Link>
              <p className="job-card-meta">
                {job.location} · ${(job.budget / 100).toFixed(2)} · {job.scheduledAt.slice(0, 10)}
              </p>
              <p className="job-card-byline">
                Posted by <Link to={`/users/${job.clientId}`}>{users[job.clientId]?.name ?? users[job.clientId]?.email ?? job.clientId}</Link>
              </p>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
