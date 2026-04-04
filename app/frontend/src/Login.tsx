import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from './AuthContext';
import { ApiError, authConfirm, authResendConfirmation } from './api';

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Confirmation step
  const [unconfirmed, setUnconfirmed] = useState(false);
  const [code, setCode] = useState('');
  const [codeError, setCodeError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [resendStatus, setResendStatus] = useState<'idle' | 'sending' | 'sent'>('idle');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setUnconfirmed(false);
    setCode('');
    setCodeError(null);
    setResendStatus('idle');
    setSubmitting(true);
    try {
      await login(email, password);
      navigate('/');
    } catch (err) {
      if (err instanceof ApiError && err.code === 'EMAIL_NOT_CONFIRMED') {
        setUnconfirmed(true);
      } else {
        setError(err instanceof Error ? err.message : 'Login failed');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleConfirm = async (e: React.FormEvent) => {
    e.preventDefault();
    setCodeError(null);
    setConfirming(true);
    try {
      await authConfirm(email, code.trim());
      await login(email, password);
      navigate('/');
    } catch (err) {
      setCodeError(err instanceof Error ? err.message : 'Confirmation failed');
    } finally {
      setConfirming(false);
    }
  };

  const handleResend = async () => {
    if (resendStatus === 'sending') return;
    setResendStatus('sending');
    try {
      await authResendConfirmation(email);
      setResendStatus('sent');
    } catch {
      setResendStatus('idle');
    }
  };

  return (
    <>
      <p><Link to="/">← Back</Link></p>
      <h1>Log in</h1>
      {!unconfirmed ? (
        <form onSubmit={handleSubmit} className="card">
          <label>Email</label>
          <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          <label>Password</label>
          <input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} />
          {error && <p className="error">{error}</p>}
          <button type="submit" disabled={submitting}>{submitting ? 'Logging in…' : 'Log in'}</button>
        </form>
      ) : (
        <form onSubmit={handleConfirm} className="card">
          <p>Your email <strong>{email}</strong> hasn't been verified. Enter the 6-digit code we sent you.</p>
          <label>Verification code</label>
          <input
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            required
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="123456"
          />
          {codeError && <p className="error">{codeError}</p>}
          <button type="submit" disabled={confirming}>{confirming ? 'Verifying…' : 'Verify and log in'}</button>
          <p>
            Didn't receive it?{' '}
            {resendStatus === 'sent'
              ? <span>Code resent.</span>
              : <button type="button" onClick={handleResend} disabled={resendStatus === 'sending'}>{resendStatus === 'sending' ? 'Sending…' : 'Resend code'}</button>
            }
          </p>
        </form>
      )}
      <p>No account? <Link to="/register">Register</Link></p>
    </>
  );
}
