import { Link } from "react-router-dom";
import "./LandingPage.css";

const valueCards = [
  {
    title: "Emergency Response",
    description: "Coordinate alarms, alerts, and response teams from a single command center.",
    icon: "⚠️",
  },
  {
    title: "Community Management",
    description: "Keep residents, societies, and volunteers connected with secure workflows.",
    icon: "👥",
  },
  {
    title: "Security Coordination",
    description: "Share incident context with security staff and responders instantly.",
    icon: "🛡️",
  },
  {
    title: "Real-time Communication",
    description: "Deliver alert messages, updates, and status changes without delay.",
    icon: "💬",
  },
];

const featureCards = [
  {
    title: "SOS & Emergency Response",
    description: "Trigger alerts, dispatch responders and resolve incidents with clarity.",
  },
  {
    title: "Resident & Society Management",
    description: "Manage people, properties, and society details in one central place.",
  },
  {
    title: "Security Coordination",
    description: "Keep security teams aligned with real-time incident updates.",
  },
  {
    title: "Notifications",
    description: "Send timely messages to residents, guardians, and operations teams.",
  },
  {
    title: "Reporting & Analytics",
    description: "Review trends and operational metrics in polished dashboard views.",
  },
];

const workflowSteps = [
  {
    title: "Detect",
    detail: "Incident alert captured and classified instantly.",
  },
  {
    title: "Alert",
    detail: "Response teams and stakeholders receive secure notifications.",
  },
  {
    title: "Respond",
    detail: "Security, volunteers, and guardians coordinate action.",
  },
  {
    title: "Resolve",
    detail: "Status updates continue until the incident is closed.",
  },
];

export default function LandingPage() {
  return (
    <div className="landing-page">
      <header className="landing-navbar">
        <div className="landing-brand">
          <div className="landing-brand-mark">CC</div>
          <span>CareConnect</span>
        </div>

        <nav className="landing-links">
          <a href="#platform">Platform</a>
          <a href="#workflow">Emergency Response</a>
          <a href="#features">Analytics</a>
          <Link to="/register" className="landing-register-link">
            Register
          </Link>
        </nav>

        <Link to="/login" className="landing-navbar-login">
          Login
        </Link>
      </header>

      <main>
        <section className="landing-hero" id="hero">
          <div className="landing-hero-copy">
            <span className="landing-eyebrow">One platform for safer communities</span>
            <h1>Smarter Communities. Safer Lives.</h1>
            <p>
              CareConnect connects residents, guardians, volunteers, security teams and administrators for faster emergency response and stronger community operations.
            </p>

            <div className="landing-hero-actions">
              <Link to="/login" className="landing-button landing-button--primary">
                Admin Login
              </Link>
              <a href="#platform" className="landing-button landing-button--secondary">
                Learn More
              </a>
            </div>

            <div className="landing-hero-badges">
              <span>24/7 incident readiness</span>
              <span>Secure resident directory</span>
              <span>Actionable response workflow</span>
            </div>
          </div>

          <div className="landing-hero-visual">
            <div className="hero-visual-surface">
              <div className="hero-visual-header">
                <span>Emergency Operations</span>
                <strong>Live incident dashboard</strong>
              </div>
              <div className="hero-visual-grid">
                <div className="hero-visual-card hero-visual-card--alert">
                  <span className="hero-visual-icon">⚠️</span>
                  <div>
                    <p className="hero-visual-title">SOS activated</p>
                    <p className="hero-visual-copy">Resident alert received.</p>
                  </div>
                </div>
                <div className="hero-visual-card hero-visual-card--team">
                  <span className="hero-visual-icon">👥</span>
                  <div>
                    <p className="hero-visual-title">Team notified</p>
                    <p className="hero-visual-copy">Security and volunteers informed.</p>
                  </div>
                </div>
                <div className="hero-visual-map" />
                <div className="hero-visual-card hero-visual-card--location">
                  <span className="hero-visual-icon">📍</span>
                  <div>
                    <p className="hero-visual-title">Location</p>
                    <p className="hero-visual-copy">Heritage Park Tower B</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="landing-benefits" id="platform">
          <div className="landing-section-head">
            <span className="landing-section-eyebrow">Why CareConnect</span>
            <h2>Modern operations for safety, communication and community management.</h2>
          </div>

          <div className="landing-benefits-grid">
            {valueCards.map((card) => (
              <article key={card.title} className="landing-benefit-card">
                <div className="benefit-icon">{card.icon}</div>
                <h3>{card.title}</h3>
                <p>{card.description}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="landing-workflow" id="workflow">
          <div className="landing-workflow-copy">
            <span className="landing-section-eyebrow">Emergency workflow</span>
            <h2>Detect → Alert → Respond → Resolve</h2>
            <p>CareConnect keeps every stage aligned so your teams react quickly and every incident is handled consistently.</p>
          </div>

          <div className="landing-workflow-grid">
            {workflowSteps.map((step, index) => (
              <div key={step.title} className="workflow-step">
                <div className="workflow-step-bubble">{index + 1}</div>
                <div>
                  <h4>{step.title}</h4>
                  <p>{step.detail}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="landing-feature-cards" id="features">
          <div className="landing-section-head">
            <span className="landing-section-eyebrow">Platform capabilities</span>
            <h2>Everything needed for security, residents and admin teams.</h2>
          </div>

          <div className="landing-feature-grid">
            {featureCards.map((card) => (
              <article key={card.title} className="landing-feature-card">
                <h3>{card.title}</h3>
                <p>{card.description}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="landing-preview">
          <div className="landing-preview-copy">
            <span className="landing-section-eyebrow">Dashboard preview</span>
            <h2>Track incidents, manage residents, and monitor operations at a glance.</h2>
            <p>This preview reflects the clean admin experience CareConnect offers, with clear status cards and modern workspace styling.</p>
          </div>

          <div className="landing-preview-panel">
            <div className="preview-topbar">
              <span />
              <span />
              <span />
            </div>
            <div className="preview-body">
              <div className="preview-sidebar">
                <div className="preview-logo">CareConnect</div>
                <div className="preview-menu active">Dashboard</div>
                <div className="preview-menu">Incidents</div>
                <div className="preview-menu">Residents</div>
                <div className="preview-menu">Reports</div>
              </div>
              <div className="preview-main">
                <div className="preview-stats-row">
                  <div className="preview-stat-card">
                    <span>Active incidents</span>
                    <strong>8</strong>
                  </div>
                  <div className="preview-stat-card">
                    <span>Pending alerts</span>
                    <strong>14</strong>
                  </div>
                  <div className="preview-stat-card">
                    <span>Resolved today</span>
                    <strong>5</strong>
                  </div>
                </div>
                <div className="preview-chart" />
                <div className="preview-footer-row">
                  <div className="preview-chip">Response time 4m</div>
                  <div className="preview-chip">Volunteer ready</div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="landing-cta-section">
          <div>
            <h2>Ready to make your community safer?</h2>
            <p>Login to CareConnect and begin managing safety, residents and emergency workflows from one unified admin portal.</p>
          </div>
          <Link to="/login" className="landing-button landing-button--primary landing-button--large">
            Admin Login
          </Link>
        </section>
      </main>

      <footer className="landing-footer">
        <div className="landing-footer-branding">
          <p className="landing-footer__brand">CareConnect</p>
          <p className="landing-footer__text">Modern software for emergency response and community administration.</p>
        </div>

        <div className="landing-footer-links">
          <div>
            <p className="landing-footer-link-heading">Platform</p>
            <a href="#platform">Platform</a>
            <a href="#workflow">Emergency Response</a>
          </div>
          <div>
            <p className="landing-footer-link-heading">Resources</p>
            <a href="#features">Reporting</a>
            <a href="#hero">Administration</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
