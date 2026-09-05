import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { Button } from '../../../web/src/design-system/Button';
import { Wordmark } from '../../../web/src/design-system/Wordmark';
import { staffAuthApi } from '../lib/api';
import { clearSession, getRefreshToken, isAuthenticated } from '../lib/session';

export function Layout() {
  const navigate = useNavigate();
  const [signedIn, setSignedIn] = useState(isAuthenticated);
  useEffect(() => {
    const sync = () => setSignedIn(isAuthenticated());
    window.addEventListener('amealio-staff-session', sync);
    return () => window.removeEventListener('amealio-staff-session', sync);
  }, []);

  async function logout() {
    const refresh = getRefreshToken();
    try {
      if (refresh) await staffAuthApi.logout(refresh);
    } catch {
      /* still clear */
    }
    clearSession();
    navigate('/login');
  }

  return (
    <div className="app-shell">
      <header className="app-header">
        <Link to="/" aria-label="amealio merchant home">
          <Wordmark invert />
        </Link>
        <div className="app-header-end">
          <nav className="app-header-nav" aria-label="Merchant">
            <Link to="/">Orders</Link>
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
      <nav className="app-tabbar" aria-label="Merchant">
        <NavLink to="/" end>
          Orders
        </NavLink>
        {signedIn ? (
          <button type="button" onClick={() => void logout()}>
            Sign out
          </button>
        ) : (
          <NavLink to="/login">Sign in</NavLink>
        )}
      </nav>
    </div>
  );
}
