import { useEffect, useState } from 'react';
import { Link, Outlet } from 'react-router-dom';
import { clearSession, getRefreshToken, isAuthenticated } from '../lib/session';
import { authApi } from '../lib/api';

export function Layout() {
  const [signedIn, setSignedIn] = useState(isAuthenticated);
  useEffect(() => {
    const sync = () => setSignedIn(isAuthenticated());
    window.addEventListener('amealio-session', sync);
    return () => window.removeEventListener('amealio-session', sync);
  }, []);

  async function logout() {
    const refresh = getRefreshToken();
    try {
      if (refresh) await authApi.logout(refresh);
    } catch {
      /* still clear local session */
    }
    clearSession();
    window.location.href = '/';
  }

  return (
    <>
      <header className="app-bar">
        <Link to="/" aria-label="amealio home">
          amealio
        </Link>
        <nav aria-label="Primary">
          <Link to="/">Home</Link>
          <Link to="/cart">Cart</Link>
          {signedIn ? <Link to="/orders">Orders</Link> : null}
          {signedIn ? (
            <button type="button" className="secondary" onClick={() => void logout()}>
              Sign out
            </button>
          ) : (
            <Link to="/login">Sign in</Link>
          )}
        </nav>
      </header>
      <main>
        <Outlet />
      </main>
    </>
  );
}
