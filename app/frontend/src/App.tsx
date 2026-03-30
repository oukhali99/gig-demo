import { Routes, Route, Link, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './AuthContext';
import JobList from './JobList';
import JobDetail from './JobDetail';
import CreateJob from './CreateJob';
import DraftList from './DraftList';
import BookingsList from './BookingsList';
import PaymentsList from './PaymentsList';
import Login from './Login';
import Register from './Register';
import AdminModeration from './AdminModeration';

function Nav() {
  const { auth, loading, logout } = useAuth();
  if (loading) {
    return (
      <header className="app-header">
        <nav className="app-nav" aria-label="Main">
          <div className="app-nav-inner">
            <p className="state-loading">Loading…</p>
          </div>
        </nav>
      </header>
    );
  }
  return (
    <header className="app-header">
      <nav className="app-nav" aria-label="Main">
        <div className="app-nav-inner">
          <Link to="/" className="app-brand">
            Gigboard
          </Link>
          <div className="app-nav-cluster">
            <Link to="/" className="app-nav-link">
              Jobs
            </Link>
            {auth ? (
              <>
                <Link to="/drafts" className="app-nav-link">
                  Drafts
                </Link>
                <Link to="/bookings" className="app-nav-link">
                  My bookings
                </Link>
                <Link to="/payments" className="app-nav-link">
                  Payments
                </Link>
                {auth.user.role === 'admin' && (
                  <Link to="/admin" className="app-nav-link">
                    Admin
                  </Link>
                )}
              </>
            ) : (
              <>
                <Link to="/login" className="app-nav-link">
                  Log in
                </Link>
                <Link to="/register" className="app-nav-link">
                  Register
                </Link>
              </>
            )}
          </div>
          {auth ? (
            <div className="app-nav-end">
              <span className="app-nav-user" title={auth.user.email ?? auth.user.sub}>
                {auth.user.email ?? auth.user.sub}
              </span>
              <Link to="/jobs/new" className="btn-nav-cta">
                Post a job
              </Link>
              <button type="button" className="secondary" onClick={logout}>
                Logout
              </button>
            </div>
          ) : null}
        </div>
      </nav>
    </header>
  );
}

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { auth, loading } = useAuth();
  if (loading) return <p className="state-loading">Loading…</p>;
  if (!auth) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function RequireAdmin({ children }: { children: React.ReactNode }) {
  const { auth, loading } = useAuth();
  if (loading) return <p className="state-loading">Loading…</p>;
  if (!auth) return <Navigate to="/login" replace />;
  if (auth.user.role !== 'admin') return <Navigate to="/" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <AuthProvider>
      <Nav />
      <main className="container page-shell">
        <Routes>
          <Route path="/" element={<JobList />} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/jobs/new" element={<RequireAuth><CreateJob /></RequireAuth>} />
          <Route path="/drafts" element={<RequireAuth><DraftList /></RequireAuth>} />
          <Route path="/bookings" element={<RequireAuth><BookingsList /></RequireAuth>} />
          <Route path="/payments" element={<RequireAuth><PaymentsList /></RequireAuth>} />
          <Route path="/admin" element={<RequireAuth><RequireAdmin><AdminModeration /></RequireAdmin></RequireAuth>} />
          <Route path="/jobs/:id" element={<JobDetail />} />
        </Routes>
      </main>
    </AuthProvider>
  );
}
