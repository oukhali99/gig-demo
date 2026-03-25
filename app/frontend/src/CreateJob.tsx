import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { createJob } from './api';

export default function CreateJob() {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    title: '',
    categoryId: 'landscaping',
    location: '',
    description: '',
    budget: '',
    scheduledAt: '',
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    const scheduledAt = form.scheduledAt
      ? new Date(form.scheduledAt).toISOString()
      : new Date().toISOString();
    createJob({ ...form, scheduledAt })
      .then((job) => navigate(`/jobs/${job.jobId}`))
      .catch((e) => setError(e.message))
      .finally(() => setSubmitting(false));
  };

  return (
    <>
      <p><a href="/">← Back to jobs</a></p>
      <h1>Post a job</h1>
      <form onSubmit={handleSubmit} className="card">
        <label>Title</label>
        <input
          required
          value={form.title}
          onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
          placeholder="e.g. Mow lawn"
        />
        <label>Category</label>
        <select
          value={form.categoryId}
          onChange={(e) => setForm((f) => ({ ...f, categoryId: e.target.value }))}
        >
          <option value="landscaping">Landscaping</option>
          <option value="handyman">Handyman</option>
          <option value="moving">Moving</option>
          <option value="other">Other</option>
        </select>
        <label>Location</label>
        <input
          required
          value={form.location}
          onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))}
          placeholder="e.g. Seattle, WA"
        />
        <label>Description</label>
        <textarea
          required
          value={form.description}
          onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
          placeholder="Describe the job..."
        />
        <label>Budget ($)</label>
        <input
          required
          type="text"
          inputMode="numeric"
          value={form.budget}
          onChange={(e) => setForm((f) => ({ ...f, budget: e.target.value }))}
          placeholder="50"
        />
        <label>Scheduled (date/time)</label>
        <input
          type="datetime-local"
          value={form.scheduledAt}
          onChange={(e) => setForm((f) => ({ ...f, scheduledAt: e.target.value }))}
        />
        {error && <p className="error">{error}</p>}
        <button type="submit" disabled={submitting}>
          {submitting ? 'Creating…' : 'Create job'}
        </button>
      </form>
    </>
  );
}
