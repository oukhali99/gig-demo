import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AssistantChat } from './AssistantChat';
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
    const budgetCents = Math.round(parseFloat(form.budget) * 100);
    if (!Number.isFinite(budgetCents) || budgetCents < 1) {
      setError('Budget must be a positive dollar amount (e.g. 50)');
      setSubmitting(false);
      return;
    }
    createJob({ ...form, budget: budgetCents, scheduledAt })
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
      <AssistantChat
        purpose="job_draft"
        title="Writing assistant"
        context={{
          title: form.title,
          categoryId: form.categoryId,
          location: form.location,
          description: form.description,
          budget: form.budget,
          scheduledAt: form.scheduledAt,
        }}
        applyActions={[
          {
            label: 'Append to description',
            onApply: (text) =>
              setForm((f) => ({
                ...f,
                description: f.description ? `${f.description.trim()}\n\n${text.trim()}` : text.trim(),
              })),
          },
          {
            label: 'Replace description',
            onApply: (text) => {
              if (window.confirm('Replace the entire description with the assistant’s last reply?')) {
                setForm((f) => ({ ...f, description: text.trim() }));
              }
            },
          },
          {
            label: 'Use for title',
            onApply: (text) => {
              const line = text.trim().split('\n')[0]?.slice(0, 200) ?? '';
              if (!line) return;
              setForm((f) => {
                if (f.title.trim() && !window.confirm('Replace the current title with a line from the assistant’s reply?')) {
                  return f;
                }
                return { ...f, title: line };
              });
            },
          },
        ]}
      />
    </>
  );
}
