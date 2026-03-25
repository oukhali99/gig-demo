import { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate, Link, Navigate } from 'react-router-dom';
import { useAuth } from './AuthContext';
import {
  getJob,
  getUser,
  publishJob,
  deleteJob,
  createBooking,
  listBookings,
  getJobImageUploadUrl,
  uploadToPresignedUrl,
  attachJobImage,
  getJobImageUrls,
  type Job,
  type Booking,
} from './api';

export default function JobDetail() {
  const { auth, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const [job, setJob] = useState<Job | null>(null);
  const [posterEmail, setPosterEmail] = useState<string | null>(null);
  const [myBooking, setMyBooking] = useState<Booking | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [booking, setBooking] = useState(false);
  const [imageUrls, setImageUrls] = useState<Record<string, string>>({});
  const [uploadingImage, setUploadingImage] = useState(false);
  const idempotencyKeyRef = useRef<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!auth || !id) return;
    getJob(id)
      .then(setJob)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [auth, id]);

  useEffect(() => {
    if (!id || !job?.imageKeys?.length) {
      setImageUrls({});
      return;
    }
    getJobImageUrls(id, job.imageKeys)
      .then(setImageUrls)
      .catch(() => setImageUrls({}));
  }, [id, job?.imageKeys?.length, job?.imageKeys?.join(',')]);

  useEffect(() => {
    if (!job?.clientId) return;
    getUser(job.clientId)
      .then((u) => setPosterEmail(u.email))
      .catch(() => setPosterEmail(null));
  }, [job?.clientId]);

  useEffect(() => {
    if (!auth?.user?.sub || !id || !job || job.status !== 'published') return;
    listBookings({ jobId: id, limit: 50 })
      .then((res) => {
        const mine = res.items.find((b) => b.workerId === auth.user!.sub);
        setMyBooking(mine ?? null);
      })
      .catch(() => setMyBooking(null));
  }, [auth?.user?.sub, id, job?.status]);

  if (authLoading) return <p>Loading…</p>;
  if (!auth) return <Navigate to="/login" replace />;

  const handlePublish = () => {
    if (!id || job?.status !== 'draft') return;
    setPublishing(true);
    publishJob(id)
      .then(setJob)
      .catch((e) => setError(e.message))
      .finally(() => setPublishing(false));
  };

  const handleDeleteDraft = () => {
    if (!id || job?.status !== 'draft') return;
    setDeleting(true);
    deleteJob(id)
      .then(() => navigate('/drafts', { replace: true }))
      .catch((e) => setError(e.message))
      .finally(() => setDeleting(false));
  };

  const handleAddPhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !id || !isOwner) return;
    if (!file.type.startsWith('image/')) {
      setError('Please select an image file (JPEG, PNG, etc.)');
      return;
    }
    e.target.value = '';
    setUploadingImage(true);
    setError(null);
    try {
      const { uploadUrl, imageKey } = await getJobImageUploadUrl(id, file.type);
      await uploadToPresignedUrl(uploadUrl, file);
      const updated = await attachJobImage(id, imageKey);
      setJob(updated);
      const urls = await getJobImageUrls(id, updated.imageKeys ?? []);
      setImageUrls(urls);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setUploadingImage(false);
    }
  };

  const handleBookJob = () => {
    if (!id || !auth?.user?.sub || job?.status !== 'published') return;
    if (!idempotencyKeyRef.current) {
      idempotencyKeyRef.current = crypto.randomUUID?.() ?? `book-${id}-${Date.now()}`;
    }
    setBooking(true);
    setError(null);
    createBooking(id, idempotencyKeyRef.current)
      .then((b) => {
        setMyBooking(b);
      })
      .catch((e) => setError(e.message))
      .finally(() => setBooking(false));
  };

  const isOwner = auth?.user?.sub && job?.clientId === auth.user.sub;
  const canBook = job?.status === 'published' && auth?.user?.sub && !isOwner;

  if (loading) return <p>Loading…</p>;
  if (error) return <p className="error">Error: {error}</p>;
  if (!job) return <p>Job not found.</p>;

  return (
    <>
      <p><Link to="/">← Back to jobs</Link></p>
      <div className="card">
        <span className={`badge ${job.status}`}>{job.status}</span>
        <h1 style={{ marginTop: '0.5rem' }}>{job.title}</h1>
        {posterEmail && (
          <p style={{ margin: '0.25rem 0', fontSize: '0.9rem', color: '#666' }}>
            Posted by {posterEmail}
          </p>
        )}
        <p><strong>Location:</strong> {job.location}</p>
        <p><strong>Budget:</strong> ${job.budget}</p>
        <p><strong>Scheduled:</strong> {job.scheduledAt.slice(0, 16).replace('T', ' ')}</p>
        <p><strong>Category:</strong> {job.categoryId}</p>
        <p>{job.description}</p>
        {(job.imageKeys?.length ?? 0) > 0 && (
          <div style={{ marginTop: '0.5rem' }}>
            <strong>Photos</strong>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginTop: '0.25rem' }}>
              {job.imageKeys!.map((key) => (
                imageUrls[key] ? (
                  <img
                    key={key}
                    src={imageUrls[key]}
                    alt="Job"
                    style={{ width: 120, height: 120, objectFit: 'cover', borderRadius: 4 }}
                  />
                ) : (
                  <div key={key} style={{ width: 120, height: 120, background: '#eee', borderRadius: 4 }} title="Loading…" />
                )
              ))}
            </div>
          </div>
        )}
        {isOwner && (
          <div style={{ marginTop: '0.5rem' }}>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/gif,image/webp"
              onChange={handleAddPhoto}
              style={{ display: 'none' }}
            />
            <button
              type="button"
              className="secondary"
              disabled={uploadingImage}
              onClick={() => fileInputRef.current?.click()}
            >
              {uploadingImage ? 'Uploading & checking…' : 'Add photo'}
            </button>
            <span style={{ marginLeft: '0.5rem', fontSize: '0.85rem', color: '#666' }}>
              Images are checked for appropriate content.
            </span>
          </div>
        )}
        {job.status === 'draft' && (
          <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
            <button onClick={handlePublish} disabled={publishing}>
              {publishing ? 'Publishing…' : 'Publish job'}
            </button>
            <button type="button" className="secondary" onClick={handleDeleteDraft} disabled={deleting}>
              {deleting ? 'Deleting…' : 'Delete draft'}
            </button>
          </div>
        )}
        {canBook && (
          <div style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid #eee' }}>
            {myBooking ? (
              <p>
                <span className={`badge ${myBooking.status}`}>{myBooking.status}</span>
                {' '}You have a booking for this job.{' '}
                <Link to="/bookings">View in My bookings</Link>
              </p>
            ) : (
              <button onClick={handleBookJob} disabled={booking}>
                {booking ? 'Booking…' : 'Book this job'}
              </button>
            )}
          </div>
        )}
      </div>
    </>
  );
}
