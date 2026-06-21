import { Link } from 'react-router-dom';

export default function LandingPage() {
  return (
    <div className="landing">
      <section className="hero">
        <div className="hero-inner">
          <div>
            <p className="hero-eyebrow">The neighborhood job board</p>
            <h1>
              Local work, <em>pinned to the board.</em>
            </h1>
            <p className="hero-sub">
              Post the odd jobs you need done, or pick up paid work near you. Gigboard
              connects the two — and holds payment securely until the job is finished.
            </p>
            <div className="hero-cta">
              <Link to="/register" className="btn-signal">
                Post a job
              </Link>
              <Link to="/register" className="btn-ghost">
                Find work near you
              </Link>
            </div>
            <p className="hero-foot">
              Already on the board? <Link to="/login">Log in</Link>
            </p>
          </div>

          <div className="hero-ticket" aria-hidden="true">
            <div className="ticket-head">
              <span className="ticket-tag">Furniture</span>
              <span className="ticket-stamp">Open</span>
            </div>
            <h2 className="ticket-title">Move a sofa across town</h2>
            <dl className="ticket-meta">
              <div>
                <dt>Pay</dt>
                <dd className="ticket-pay">$80</dd>
              </div>
              <div>
                <dt>Where</dt>
                <dd>Eastside</dd>
              </div>
              <div>
                <dt>When</dt>
                <dd className="mono">Sat</dd>
              </div>
            </dl>
            <p className="ticket-by">Posted by a neighbor</p>
          </div>
        </div>
      </section>

      <div className="landing-body">
        <p className="eyebrow">How it works</p>
        <div className="how-grid">
          <div className="how-col">
            <h3>If you need a hand</h3>
            <ol className="how-steps">
              <li>
                <div>
                  <strong>Post the job</strong>
                  <span>Describe the task, set a budget, add photos.</span>
                </div>
              </li>
              <li>
                <div>
                  <strong>Get matched</strong>
                  <span>A local worker requests the job and you confirm.</span>
                </div>
              </li>
              <li>
                <div>
                  <strong>Pay when it's done</strong>
                  <span>Payment is held securely and released on completion.</span>
                </div>
              </li>
            </ol>
          </div>

          <div className="how-col">
            <h3>If you're looking for work</h3>
            <ol className="how-steps">
              <li>
                <div>
                  <strong>Browse the board</strong>
                  <span>See open gigs near you with pay and details up front.</span>
                </div>
              </li>
              <li>
                <div>
                  <strong>Request a job</strong>
                  <span>Claim the ones that fit and get confirmed by the poster.</span>
                </div>
              </li>
              <li>
                <div>
                  <strong>Do it, get paid</strong>
                  <span>Mark it complete and the held payment is transferred to you.</span>
                </div>
              </li>
            </ol>
          </div>
        </div>
      </div>

      <div className="landing-foot">
        <h2>Pick a side and get started.</h2>
        <div className="hero-cta" style={{ justifyContent: 'center' }}>
          <Link to="/register" className="btn-signal">
            Create your account
          </Link>
        </div>
      </div>
    </div>
  );
}
