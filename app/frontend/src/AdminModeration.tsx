import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ImageLightboxThumb } from './ImageLightboxThumb';
import {
  adminModerationApprove,
  adminModerationReject,
  getAdminModerationPending,
  getAdminModerationPreviewUrl,
} from './api';

type Row = { key: string; lastModified?: string };

function resourceLink(key: string): { to: string; label: string } | null {
  const parts = key.split('/').filter(Boolean);
  if (parts[0] === 'jobs' && parts[1]) {
    return { to: `/jobs/${parts[1]}`, label: 'Open job' };
  }
  if (parts[0] === 'bookings' && parts[1]) {
    return { to: '/bookings', label: 'Bookings' };
  }
  return null;
}

function PendingImagePreview({ storageKey }: { storageKey: string }) {
  const [src, setSrc] = useState<string | null>(null);
  const [previewErr, setPreviewErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setSrc(null);
    setPreviewErr(null);
    void getAdminModerationPreviewUrl(storageKey)
      .then((r) => {
        if (!cancelled) setSrc(r.url);
      })
      .catch((e) => {
        if (!cancelled) setPreviewErr(e instanceof Error ? e.message : 'Preview failed');
      });
    return () => {
      cancelled = true;
    };
  }, [storageKey]);

  if (previewErr) return <p className="error admin-moderation-preview-error">{previewErr}</p>;
  if (!src) return <p className="state-muted admin-moderation-preview-loading">Loading preview…</p>;

  return (
    <ImageLightboxThumb
      src={src}
      alt=""
      thumbClassName="admin-moderation-preview-img"
      thumbButtonClassName="image-lightbox-thumb-btn--stack"
    />
  );
}

export default function AdminModeration() {
  const [prefix, setPrefix] = useState<'jobs' | 'bookings'>('jobs');
  const [items, setItems] = useState<Row[]>([]);
  const [cursor, setCursor] = useState<string | undefined>();
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [acting, setActing] = useState<string | null>(null);

  const fetchPage = useCallback(
    async (append: boolean, nextCursor?: string) => {
      const res = await getAdminModerationPending({
        prefix,
        cursor: append ? nextCursor : undefined,
      });
      setItems((prev) => {
        if (!append) return res.items;
        const seen = new Set(prev.map((r) => r.key));
        const merged = [...prev];
        for (const r of res.items) {
          if (!seen.has(r.key)) {
            seen.add(r.key);
            merged.push(r);
          }
        }
        return merged;
      });
      setCursor(res.nextCursor);
    },
    [prefix]
  );

  useEffect(() => {
    setError(null);
    setLoading(true);
    setItems([]);
    setCursor(undefined);
    fetchPage(false)
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load queue'))
      .finally(() => setLoading(false));
  }, [prefix, fetchPage]);

  const loadMore = () => {
    if (!cursor || loadingMore) return;
    setLoadingMore(true);
    setError(null);
    fetchPage(true, cursor)
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load more'))
      .finally(() => setLoadingMore(false));
  };

  const onApprove = async (key: string) => {
    setActing(key);
    setError(null);
    try {
      await adminModerationApprove(key);
      setItems((prev) => prev.filter((r) => r.key !== key));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Approve failed');
    } finally {
      setActing(null);
    }
  };

  const onReject = async (key: string) => {
    if (!window.confirm('Reject and remove this image from storage?')) return;
    setActing(key);
    setError(null);
    try {
      await adminModerationReject(key);
      setItems((prev) => prev.filter((r) => r.key !== key));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Reject failed');
    } finally {
      setActing(null);
    }
  };

  return (
    <>
      <p>
        <Link to="/">← Back to jobs</Link>
      </p>
      <h1>Admin · Image moderation</h1>
      <p className="state-muted">
        Objects tagged for manual review after automated checks. Approve to publish to the CDN, or reject to delete the
        upload.
      </p>

      <div className="admin-prefix-toggle">
        <button
          type="button"
          className={prefix === 'jobs' ? undefined : 'secondary'}
          onClick={() => setPrefix('jobs')}
          disabled={loading}
        >
          Job images
        </button>
        <button
          type="button"
          className={prefix === 'bookings' ? undefined : 'secondary'}
          onClick={() => setPrefix('bookings')}
          disabled={loading}
        >
          Booking images
        </button>
      </div>

      {error && <p className="error">{error}</p>}

      {loading ? (
        <p className="state-loading">Loading queue…</p>
      ) : items.length === 0 ? (
        <p>No images awaiting review in this prefix.{cursor ? ' Try “Load more” to scan further pages.' : ''}</p>
      ) : (
        <ul className="admin-moderation-list">
          {items.map((row) => {
            const rl = resourceLink(row.key);
            return (
              <li key={row.key} className="card admin-moderation-item">
                <PendingImagePreview storageKey={row.key} />
                <code className="admin-moderation-key">{row.key}</code>
                {row.lastModified && <p className="job-card-meta admin-moderation-meta">{row.lastModified}</p>}
                <div className="admin-moderation-actions">
                  {rl && (
                    <Link to={rl.to} className="admin-moderation-resource-link">
                      {rl.label}
                    </Link>
                  )}
                  <button type="button" disabled={acting === row.key} onClick={() => void onApprove(row.key)}>
                    {acting === row.key ? '…' : 'Approve'}
                  </button>
                  <button
                    type="button"
                    className="secondary"
                    disabled={acting === row.key}
                    onClick={() => void onReject(row.key)}
                  >
                    Reject
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {cursor && (
        <button type="button" className="secondary" disabled={loadingMore} onClick={() => void loadMore()}>
          {loadingMore ? 'Loading…' : 'Load more (next S3 page)'}
        </button>
      )}
    </>
  );
}
