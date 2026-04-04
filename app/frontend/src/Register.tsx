import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from './AuthContext';
import { ApiError, authConfirm, authResendConfirmation } from './api';

export default function Register() {
  const { register, login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Confirmation step
  const [pendingEmail, setPendingEmail] = useState<string | null>(null);
  const [pendingPassword, setPendingPassword] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [codeError, setCodeError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [resendStatus, setResendStatus] = useState<'idle' | 'sending' | 'sent'>('idle');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await register(email, password);
      navigate('/');
    } catch (err) {
      if (err instanceof ApiError && err.code === 'EMAIL_NOT_CONFIRMED') {
        setPendingEmail(email);
        setPendingPassword(password);
      } else {
        setError(err instanceof Error ? err.message : 'Registration failed');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleConfirm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pendingEmail || !pendingPassword) return;
    setCodeError(null);
    setConfirming(true);
    try {
      await authConfirm(pendingEmail, code.trim());
      await login(pendingEmail, pendingPassword);
      navigate('/');
    } catch (err) {
      setCodeError(err instanceof Error ? err.message : 'Confirmation failed');
    } finally {
      setConfirming(false);
    }
  };

  const handleResend = async () => {
    if (!pendingEmail || resendStatus === 'sending') return;
    setResendStatus('sending');
    try {
      await authResendConfirmation(pendingEmail);
      setResendStatus('sent');
    } catch {
      setResendStatus('idle');
    }
  };

  if (pendingEmail) {
    return (
      <>
        <p><Link to="/">← Back</Link></p>
        <h1>Verify your email</h1>
        <form onSubmit={handleConfirm} className="card">
          <p>We sent a 6-digit code to <strong>{pendingEmail}</strong>.</p>
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
          <button type="submit" disabled={confirming}>{confirming ? 'Verifying…' : 'Verify'}</button>
        </form>
        <p>
          Didn't receive it?{' '}
          {resendStatus === 'sent'
            ? <span>Code resent.</span>
            : <button type="button" onClick={handleResend} disabled={resendStatus === 'sending'}>{resendStatus === 'sending' ? 'Sending…' : 'Resend code'}</button>
          }
        </p>
      </>
    );
  }

  return (
    <>
      <p><Link to="/">← Back</Link></p>
      <h1>Register</h1>
      <form onSubmit={handleSubmit} className="card">
        <label>Email</label>
        <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        <label>Password</label>
        <input type="password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} />
        {error && <p className="error">{error}</p>}
        <button type="submit" disabled={submitting}>{submitting ? 'Registering…' : 'Register'}</button>
      </form>
      <p>Already have an account? <Link to="/login">Log in</Link></p>
    </>
  );
}
