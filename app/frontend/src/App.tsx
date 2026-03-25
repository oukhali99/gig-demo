import { Routes, Route, Link, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './AuthContext';
import JobList from './JobList';
import JobDetail from './JobDetail';
import CreateJob from './CreateJob';
import DraftList from './DraftList';
import BookingsList from './BookingsList';
import Login from './Login';
import Register from './Register';

function Nav() {
  const { auth, loading, logout } = useAuth();
  if (loading) return <nav>Loading…</nav>;
  return (
    <nav>
      <Link to="/">Jobs</Link>
      {auth ? (
        <>
          <Link to="/drafts">Drafts</Link>
          <Link to="/bookings">My bookings</Link>
          <Link to="/jobs/new">Post a job</Link>
          <span style={{ marginLeft: 'auto' }}>{auth.user.email ?? auth.user.sub}</span>
          <button type="button" className="secondary" onClick={logout} style={{ marginLeft: '0.5rem' }}>Logout</button>
        </>
      ) : (
        <>
          <Link to="/login">Log in</Link>
          <Link to="/register">Register</Link>
        </>
      )}
    </nav>
  );
}

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { auth, loading } = useAuth();
  if (loading) return <p>Loading…</p>;
  if (!auth) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <AuthProvider>
      <Nav />
      <main className="container">
        <Routes>
          <Route path="/" element={<JobList />} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/jobs/new" element={<RequireAuth><CreateJob /></RequireAuth>} />
          <Route path="/drafts" element={<RequireAuth><DraftList /></RequireAuth>} />
          <Route path="/bookings" element={<RequireAuth><BookingsList /></RequireAuth>} />
          <Route path="/jobs/:id" element={<JobDetail />} />
        </Routes>
      </main>
    </AuthProvider>
  );
}
