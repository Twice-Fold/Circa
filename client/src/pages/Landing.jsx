export default function Landing() {
  return (
    <div className="landing">
      <section className="hero">
        <div className="logo-heart hero-heart" aria-hidden="true">♥</div>
        <h1 className="hero-title">Circa</h1>
        <p className="hero-sub">Navigating through the Circadian Rhythm</p>
        <button
          className="scroll-indicator"
          aria-label="Scroll down to how it works"
          onClick={() => document.getElementById('how-it-works')?.scrollIntoView({ behavior: 'smooth' })}
        >
          <span className="scroll-label">scroll</span>
          <span className="chevron" aria-hidden="true" />
        </button>
      </section>

      <section id="how-it-works" className="how">
        <h2 className="how-heading">How It Works</h2>
        <div className="how-grid">
          <article className="card how-card">
            <div className="how-emoji" aria-hidden="true">📸</div>
            <h3>Snap It</h3>
            <p>
              Upload a screenshot of your sleep data — from Apple Health, Google Fit, or whatever
              you use. Circa reads it instantly and turns it into a schedule built around your
              actual energy patterns.
            </p>
          </article>

          <article className="card how-card">
            <div className="how-emoji" aria-hidden="true">🔄</div>
            <h3>Sync It</h3>
            <p>
              Prefer hands-off? Connect Circa directly to Google Health for automatic, ongoing
              sleep data — no screenshots needed.{' '}
              <strong>
                Regular transfer of data via Google Health requires you to SIGN UP WITH GOOGLE (or
                convert your normal account into a Google account).
              </strong>
            </p>
          </article>
        </div>

        <div className="signup-cta">
          <a className="btn-signup" href="#/signup">Sign Up Today</a>
        </div>
      </section>
    </div>
  );
}
