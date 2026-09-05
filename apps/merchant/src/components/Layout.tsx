import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { Button } from '../../../web/src/design-system/Button';
import { Wordmark } from '../../../web/src/design-system/Wordmark';
import { staffAuthApi } from '../lib/api';
import {
  clearSession,
  getRefreshToken,
  getStaff,
  isAuthenticated,
  isMerchantStaff,
  isSuperAdmin,
  setStaff,
} from '../lib/session';

export function Layout() {
  const navigate = useNavigate();
  const [signedIn, setSignedIn] = useState(isAuthenticated);
  const [staffRole, setStaffRole] = useState(getStaff()?.staffRole ?? null);

  useEffect(() => {
    const sync = () => {
      setSignedIn(isAuthenticated());
      setStaffRole(getStaff()?.staffRole ?? null);
    };
    window.addEventListener('amealio-staff-session', sync);
    return () => window.removeEventListener('amealio-staff-session', sync);
  }, []);

  useEffect(() => {
    if (!isAuthenticated() || getStaff()) return;
    staffAuthApi
      .me()
      .then((staff) => setStaff(staff))
      .catch(() => {
        clearSession();
        navigate('/login');
      });
  }, [navigate, signedIn]);

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

  const showMerchantNav = signedIn && isMerchantStaff();
  const showAdminNav = signedIn && isSuperAdmin();

  return (
    <div className="app-shell" data-staff-role={staffRole ?? 'anon'}>
      <header className="app-header">
        <Link to={showAdminNav ? '/global-catalog' : '/'} aria-label="amealio staff home">
          <Wordmark invert />
        </Link>
        <div className="app-header-end">
          <nav className="app-header-nav" aria-label="Staff">
            {showMerchantNav ? (
              <>
                <NavLink to="/" end>
                  Orders
                </NavLink>
                <NavLink to="/diner">Diners</NavLink>
                <NavLink to="/catalog">Catalog</NavLink>
              </>
            ) : null}
            {showAdminNav ? (
              <NavLink to="/global-catalog">Global Catalog</NavLink>
            ) : null}
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
      <nav className="app-tabbar" aria-label="Staff">
        {showMerchantNav ? (
          <>
            <NavLink to="/" end>
              Orders
            </NavLink>
            <NavLink to="/diner">Diners</NavLink>
            <NavLink to="/catalog">Catalog</NavLink>
          </>
        ) : null}
        {showAdminNav ? (
          <NavLink to="/global-catalog">Global Catalog</NavLink>
        ) : null}
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
