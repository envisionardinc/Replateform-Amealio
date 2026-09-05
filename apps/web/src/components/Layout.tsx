import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet } from 'react-router-dom';
import { Button } from '../design-system/Button';
import { Wordmark } from '../design-system/Wordmark';
import { authApi } from '../lib/api';
import { clearSession, getRefreshToken, isAuthenticated } from '../lib/session';

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
    <div className="app-shell">
      <header className="app-header">
        <Link to="/" aria-label="amealio home">
          <Wordmark invert />
        </Link>
        <div className="app-header-end">
          <nav className="app-header-nav" aria-label="Primary">
            <Link to="/">Home</Link>
            <Link to="/cart">Cart</Link>
            {signedIn ? <Link to="/orders">Orders</Link> : null}
            {signedIn ? <Link to="/diner">Tables</Link> : null}
            {signedIn ? <Link to="/profile">Profile</Link> : null}
          </nav>
          {signedIn ? (
            <Button variant="secondary" onClick={() => void logout()}>
              Sign out
            </Button>
          ) : (
            <Link to="/login">Sign in</Link>
          )}
        </div>
      </header>
      <main className="app-main">
        <Outlet />
      </main>
      <nav className="app-tabbar" aria-label="Primary">
        <NavLink to="/" end>
          Home
        </NavLink>
        <NavLink to="/cart">Cart</NavLink>
        {signedIn ? <NavLink to="/orders">Orders</NavLink> : <NavLink to="/login">Sign in</NavLink>}
        {signedIn ? <NavLink to="/profile">Profile</NavLink> : null}
      </nav>
    </div>
  );
}
