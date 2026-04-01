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
  getJobImageUrls,
  type Job,
  type Booking,
} from './api';
import { ImageLightboxThumb } from './ImageLightboxThumb';

export default function JobDetail() {
  const { auth, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const [job, setJob] = useState<Job | null>(null);
  const [poster, setPoster] = useState<{ name?: string | null; email?: string | null } | null>(null);
  const [myBooking, setMyBooking] = useState<Booking | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [booking, setBooking] = useState(false);
  const [imageUrls, setImageUrls] = useState<Record<string, string | null>>({});
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
      .then((u) => setPoster({ name: u.name ?? null, email: u.email ?? null }))
      .catch(() => setPoster(null));
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

  if (authLoading) return <p className="state-loading">Loading…</p>;
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
      const { uploadUrl, job: updated } = await getJobImageUploadUrl(id, file.type);
      await uploadToPresignedUrl(uploadUrl, file);
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

  if (loading) return <p className="state-loading">Loading…</p>;
  if (error) return <p className="error">Error: {error}</p>;
  if (!job) return <p>Job not found.</p>;

  return (
    <>
      <p><Link to="/">← Back to jobs</Link></p>
      <div className="card">
        <span className={`badge ${job.status}`}>{job.status}</span>
        <h1 className="job-detail-title">{job.title}</h1>
        {poster && (
          <p className="job-detail-byline">
            Posted by <Link to={`/users/${job?.clientId}`}>{poster.name ?? poster.email ?? 'Unknown'}</Link>
          </p>
        )}
        <p><strong>Location:</strong> {job.location}</p>
        <p><strong>Budget:</strong> ${job.budget}</p>
        <p><strong>Scheduled:</strong> {job.scheduledAt.slice(0, 16).replace('T', ' ')}</p>
        <p><strong>Category:</strong> {job.categoryId}</p>
        <p>{job.description}</p>
        {(job.imageKeys?.length ?? 0) > 0 && (
          <div className="job-photos">
            <strong className="job-photo-label">Photos</strong>
            <div className="job-photo-grid">
              {job.imageKeys!.map((key) => {
                const url = imageUrls[key];
                if (url) {
                  return (
                    <ImageLightboxThumb
                      key={key}
                      src={url}
                      alt="Job photo"
                      thumbClassName="job-thumb"
                    />
                  );
                }
                if (url === null) {
                  return (
                    <div key={key} className="job-thumb-placeholder">
                      Awaiting moderation
                    </div>
                  );
                }
                return (
                  <div key={key} className="job-thumb-loading" title="Loading…">
                    Loading…
                  </div>
                );
              })}
            </div>
          </div>
        )}
        {isOwner && (
          <div className="job-upload-row">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/gif,image/webp"
              onChange={handleAddPhoto}
              className="visually-hidden"
            />
            <button
              type="button"
              className="secondary"
              disabled={uploadingImage}
              onClick={() => fileInputRef.current?.click()}
            >
              {uploadingImage ? 'Uploading & checking…' : 'Add photo'}
            </button>
            <span className="job-photo-hint">Images are checked for appropriate content.</span>
          </div>
        )}
        {job.status === 'draft' && (
          <div className="job-actions-row">
            <button onClick={handlePublish} disabled={publishing}>
              {publishing ? 'Publishing…' : 'Publish job'}
            </button>
            <button type="button" className="secondary" onClick={handleDeleteDraft} disabled={deleting}>
              {deleting ? 'Deleting…' : 'Delete draft'}
            </button>
          </div>
        )}
        {canBook && (
          <div className="job-book-section">
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
