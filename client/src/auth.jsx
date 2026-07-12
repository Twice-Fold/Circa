import { createContext, useContext, useEffect, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from './firebase.js';

const AuthContext = createContext({ user: null, loading: true });

export function AuthProvider({ children }) {
  const [state, setState] = useState({ user: null, loading: true });

  useEffect(
    () => onAuthStateChanged(auth, (user) => setState({ user, loading: false })),
    []
  );

  return <AuthContext.Provider value={state}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
