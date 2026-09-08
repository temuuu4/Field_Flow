// Route guard for the operational application.
//
// Unauthenticated users hitting any non-public route are redirected to
// `/login` with the intended destination captured in `location.state` so
// the login page can optionally bounce them back after success. While
// the AuthContext is still bootstrapping (`loading === true`) we render
// the AuthLoadingScreen so the user never sees the unauthenticated login
// screen briefly when they actually have a valid session.

import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { AuthLoadingScreen } from './AuthLoadingScreen';
import { ROLE, getDefaultRouteForRole } from '../../auth/roles';

export function RequireAuth({ children }) {
  const { authenticated, loading, user } = useAuth();
  const location = useLocation();

  if (loading) return <AuthLoadingScreen />;
  if (!authenticated) {
    return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  }
  // If a future state ever lands the user as authenticated without a
  // recognized role (e.g. the backend introduced a new role the FE was
  // not yet updated for), redirect to their default route so they still
  // have a page they can see. The backend still rejects any privileged
  // action.
  if (user && user.role !== ROLE.ADMIN && user.role !== ROLE.OPERATOR && user.role !== ROLE.DRIVER) {
    return <Navigate to={getDefaultRouteForRole(user.role)} replace />;
  }
  return children;
}