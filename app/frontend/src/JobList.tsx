import { useEffect, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { useAuth } from './AuthContext';
import { listJobs, type Job } from './api';

export default function JobList() {
  const { auth, loading: authLoading } = useAuth();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!auth) return;
    listJobs({ status: 'published', limit: 20 })
      .then((res) => setJobs(res.items))
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
                {job.location} · ${job.budget} · {job.scheduledAt.slice(0, 10)}
              </p>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
