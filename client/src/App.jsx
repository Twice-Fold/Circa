import { useEffect, useState } from 'react';
import NavBar from './components/NavBar.jsx';
import GenerationBanner from './components/GenerationBanner.jsx';
import DebugConsole from './components/DebugConsole.jsx';
import { GenerationProvider } from './generation.jsx';
import Landing from './pages/Landing.jsx';
import SchedulerApp from './pages/SchedulerApp.jsx';
import MyAccount from './pages/MyAccount.jsx';
import Settings from './pages/Settings.jsx';
import TodoList from './pages/TodoList.jsx';
import Routines from './pages/Routines.jsx';
import AuthPage from './pages/AuthPage.jsx';
import { useAuth } from './auth.jsx';

function currentRoute() {
  return window.location.hash.replace(/^#/, '') || '/';
}

function Protected({ children }) {
  const { user, loading } = useAuth();

  useEffect(() => {
    if (!loading && !user) window.location.hash = '#/login';
  }, [user, loading]);

  if (loading) {
    return (
      <div className="app">
        <div className="loading card">
          <div className="spinner" />
          <p>Checking your session…</p>
        </div>
      </div>
    );
  }
  if (!user) return null; // redirecting
  return children;
}

export default function App() {
  const [route, setRoute] = useState(currentRoute);

  useEffect(() => {
    const onChange = () => {
      setRoute(currentRoute());
      window.scrollTo(0, 0);
    };
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);

  let page;
  if (route === '/app') {
    page = (
      <Protected>
        <SchedulerApp />
      </Protected>
    );
  } else if (route === '/account') {
    page = (
      <Protected>
        <MyAccount />
      </Protected>
    );
  } else if (route === '/settings') {
    page = (
      <Protected>
        <Settings />
      </Protected>
    );
  } else if (route === '/todos') {
    page = (
      <Protected>
        <TodoList />
      </Protected>
    );
  } else if (route === '/routines') {
    page = (
      <Protected>
        <Routines />
      </Protected>
    );
  } else if (route === '/login') {
    page = <AuthPage key="login" mode="login" />;
  } else if (route === '/signup') {
    page = <AuthPage key="signup" mode="signup" />;
  } else {
    page = <Landing />;
  }

  return (
    <GenerationProvider>
      <NavBar route={route} />
      {page}
      <GenerationBanner route={route} />
      <DebugConsole />
    </GenerationProvider>
  );
}
