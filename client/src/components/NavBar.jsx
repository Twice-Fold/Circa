export default function NavBar({ route }) {
  return (
    <nav className="nav">
      <a className="nav-brand" href="#/">
        <span className="nav-heart" aria-hidden="true">♥</span> Circa
      </a>
      <div className="nav-links">
        <a href="#/" className={route === '/' ? 'active' : ''}>Home</a>
        <a href="#/account" className={route === '/account' ? 'active' : ''}>My Account</a>
        <a
          href="#/settings"
          className={`nav-gear${route === '/settings' ? ' active' : ''}`}
          aria-label="Settings"
          title="Settings"
        >
          ⚙️
        </a>
      </div>
    </nav>
  );
}
