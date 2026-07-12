import { useEffect, useState } from 'react';
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider,
} from 'firebase/auth';
import { auth, firebaseConfigured } from '../firebase.js';
import { useAuth } from '../auth.jsx';

// Firebase error codes → messages a human can act on. Anything unmapped
// gets a generic message; the raw code goes to the console for debugging.
function friendlyAuthError(error) {
  switch (error?.code) {
    case 'auth/invalid-email':
      return 'That email address doesn’t look valid.';
    case 'auth/missing-password':
      return 'Enter a password.';
    case 'auth/user-not-found':
    case 'auth/wrong-password':
    case 'auth/invalid-credential':
      return 'Wrong email or password.';
    case 'auth/email-already-in-use':
      return 'An account with that email already exists — try logging in instead.';
    case 'auth/weak-password':
      return 'Password needs to be at least 6 characters.';
    case 'auth/too-many-requests':
      return 'Too many attempts — wait a minute and try again.';
    case 'auth/popup-closed-by-user':
    case 'auth/cancelled-popup-request':
      return null; // user changed their mind — not an error worth showing
    case 'auth/popup-blocked':
      return 'Your browser blocked the Google sign-in popup — allow popups for this site and try again.';
    case 'auth/network-request-failed':
      return 'Network error — check your connection and try again.';
    default:
      console.error('Unmapped auth error:', error);
      return 'Something went wrong — please try again.';
  }
}

export default function AuthPage({ mode }) {
  const isSignup = mode === 'signup';
  const { user, loading } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  // Already signed in? Straight to their home base.
  useEffect(() => {
    if (!loading && user) window.location.hash = '#/account';
  }, [user, loading]);

  async function run(action) {
    setError(null);
    setBusy(true);
    try {
      await action();
      window.location.hash = '#/account';
    } catch (e) {
      setError(friendlyAuthError(e));
    } finally {
      setBusy(false);
    }
  }

  function handleSubmit(e) {
    e.preventDefault();
    run(() =>
      isSignup
        ? createUserWithEmailAndPassword(auth, email, password)
        : signInWithEmailAndPassword(auth, email, password)
    );
  }

  function handleGoogle() {
    run(() => signInWithPopup(auth, new GoogleAuthProvider()));
  }

  if (!firebaseConfigured) {
    return (
      <div className="app auth-page">
        <div className="card">
          <h2>Firebase isn’t configured</h2>
          <p className="muted">
            Copy <code>client/.env.example</code> to <code>client/.env</code>, fill in your
            Firebase web app config, and restart the dev server.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="app auth-page">
      <div className="card auth-card">
        <h2>{isSignup ? 'Create your Circa account' : 'Welcome back'}</h2>
        <p className="muted small auth-switch">
          {isSignup ? 'Already have an account?' : 'New to Circa?'}{' '}
          <a href={isSignup ? '#/login' : '#/signup'}>{isSignup ? 'Log in' : 'Sign up'}</a>
        </p>

        {error && <div className="error-banner auth-error">{error}</div>}

        <form className="auth-form" onSubmit={handleSubmit}>
          <label>
            Email
            <input
              type="email"
              value={email}
              autoComplete="email"
              placeholder="you@example.com"
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </label>
          <label>
            Password
            <input
              type="password"
              value={password}
              autoComplete={isSignup ? 'new-password' : 'current-password'}
              placeholder={isSignup ? 'At least 6 characters' : 'Your password'}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </label>
          <button className="btn-primary auth-submit" type="submit" disabled={busy}>
            {busy ? 'One moment…' : isSignup ? 'Sign Up' : 'Log In'}
          </button>
        </form>

        <div className="divider"><span>or</span></div>

        <button className="btn-google" onClick={handleGoogle} disabled={busy} type="button">
          <span className="google-g" aria-hidden="true">G</span>
          Continue with Google
        </button>

        {isSignup && (
          <p className="muted small auth-note">
            Signing up with Google also enables automatic Google Health syncing later.
          </p>
        )}
      </div>
    </div>
  );
}
