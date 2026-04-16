import { FormEvent, useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { useAuth } from './AuthContext';
import { getUser, updateUser, stripeOnboard, stripeStatus, UserProfile } from './api';

export default function Profile() {
  const { auth, refreshSession } = useAuth();
  const { id } = useParams<{ id?: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const isOwner = !id || (auth?.user?.sub === id);
  const targetId = id ?? auth?.user?.sub;

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [name, setName] = useState('');
  const [bio, setBio] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [stripeConfigured, setStripeConfigured] = useState(false);
  const [stripeReady, setStripeReady] = useState(false);
  const [stripeLoading, setStripeLoading] = useState(false);

  useEffect(() => {
    if (!auth || !targetId) return;
    setLoading(true);
    getUser(targetId)
      .then((data) => {
        setProfile(data);
        setName(data.name ?? '');
        setBio(data.bio ?? '');
      })
      .catch((err) => setError(err.message || 'Failed to load profile'))
      .finally(() => setLoading(false));
  }, [auth, targetId]);

  // Load Stripe payout status for own profile
  useEffect(() => {
    if (!isOwner || !auth) return;
    stripeStatus()
      .then((s) => { setStripeConfigured(s.configured); setStripeReady(s.detailsSubmitted); })
      .catch(() => { /* Stripe not enabled or network error — hide section silently */ });
  }, [isOwner, auth]);

  // Handle return from Stripe onboarding
  useEffect(() => {
    const stripeParam = searchParams.get('stripe');
    if (!stripeParam) return;
    setSearchParams({}, { replace: true });

    if (stripeParam === 'complete') {
      refreshSession()
        .then(() => stripeStatus())
        .then((s) => { setStripeConfigured(s.configured); setStripeReady(s.detailsSubmitted); setSuccess('Payout account set up successfully.'); })
        .catch(() => setSuccess('Payout account set up. Please refresh the page.'));
    } else if (stripeParam === 'refresh') {
      // Account link expired — re-trigger onboarding automatically
      stripeOnboard()
        .then((r) => { window.location.href = r.url; })
        .catch((err) => setError(err.message || 'Failed to resume payout setup'));
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (!auth) {
    return (
      <div>
        <p>You must be logged in to view profiles.</p>
        <Link to="/login">Log in</Link>
      </div>
    );
  }

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!auth?.user?.sub) {
      setError('User not authenticated');
      return;
    }

    if (name.length > 64) {
      setError('Name must be 64 characters or less.');
      return;
    }
    if (bio.length > 512) {
      setError('Bio must be 512 characters or less.');
      return;
    }

    setSaving(true);
    updateUser(auth.user.sub, { name: name.trim(), bio: bio.trim() })
      .then((updated) => {
        setProfile(updated);
        setName(updated.name ?? '');
        setBio(updated.bio ?? '');
        setSuccess('Profile saved.');
      })
      .catch((err) => setError(err.message || 'Failed to save profile'))
      .finally(() => setSaving(false));
  }

  return (
    <div>
      <p>
        <Link to="/">← Back to Jobs</Link>
      </p>
      <h1>{isOwner ? 'My Profile' : 'User Profile'}</h1>
      {loading && <p className="state-loading">Loading…</p>}
      {!loading && (
        <form onSubmit={handleSubmit} className="card">
          <div className="form-row">
            <label htmlFor="profile-email">Email</label>
            <input id="profile-email" type="email" value={auth.user.email ?? profile?.email ?? ''} readOnly />
          </div>

          <div className="form-row">
            <label htmlFor="profile-name">Name (optional)</label>
            <input
              id="profile-name"
              name="name"
              type="text"
              value={name}
              maxLength={64}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your display name"
            />
            <small>{name.length}/64</small>
          </div>

          <div className="form-row">
            <label htmlFor="profile-bio">Bio (optional)</label>
            <textarea
              id="profile-bio"
              name="bio"
              value={bio}
              maxLength={512}
              onChange={(e) => setBio(e.target.value)}
              placeholder="Tell others about your experience and what you offer"
              rows={6}
            />
            <small>{bio.length}/512</small>
          </div>

          {error && <p className="error">Error: {error}</p>}
          {success && <p className="success">{success}</p>}

          {isOwner && (
            <div className="form-actions">
              <button type="submit" disabled={saving}>
                {saving ? 'Saving…' : 'Save profile'}
              </button>
            </div>
          )}
          {!isOwner && (
            <p className="state-muted">Viewing another user's profile; editing is disabled.</p>
          )}
        </form>
      )}

      {isOwner && !loading && (
        <div className="card" style={{ marginTop: '1.5rem' }}>
          <h2>Payouts</h2>
          {!stripeConfigured && !stripeReady ? (
            <>
              <p>Set up your payout account to apply for jobs and receive payment when you complete them.</p>
              <button
                onClick={() => {
                  setStripeLoading(true);
                  stripeOnboard()
                    .then((r) => { window.location.href = r.url; })
                    .catch((err) => { setError(err.message || 'Failed to start payout setup'); setStripeLoading(false); });
                }}
                disabled={stripeLoading}
              >
                {stripeLoading ? 'Redirecting…' : 'Set up payouts'}
              </button>
            </>
          ) : stripeConfigured && !stripeReady ? (
            <>
              <p>Your payout account is created but onboarding is incomplete. Finish setting it up to start applying for jobs.</p>
              <button
                onClick={() => {
                  setStripeLoading(true);
                  stripeOnboard()
                    .then((r) => { window.location.href = r.url; })
                    .catch((err) => { setError(err.message || 'Failed to resume payout setup'); setStripeLoading(false); });
                }}
                disabled={stripeLoading}
              >
                {stripeLoading ? 'Redirecting…' : 'Continue payout setup'}
              </button>
            </>
          ) : (
            <p className="success">Payouts active — you can apply for jobs and receive payments.</p>
          )}
        </div>
      )}
    </div>
  );
}
