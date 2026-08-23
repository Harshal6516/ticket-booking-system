import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function Navbar() {
  const { user, logout, isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const isActive = (path: string) => location.pathname === path;

  return (
    <nav className="glass-card sticky top-0 z-50" style={{ borderRadius: 0, borderTop: 'none', borderLeft: 'none', borderRight: 'none' }}>
      <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-3 no-underline">
          <span className="text-2xl">🎫</span>
          <span className="text-xl font-bold bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">
            TicketHub
          </span>
        </Link>

        <div className="flex items-center gap-6">
          <Link
            to="/"
            className={`text-sm font-medium no-underline transition-colors ${
              isActive('/') ? 'text-primary' : 'text-text-muted hover:text-text'
            }`}
          >
            Events
          </Link>

          {isAuthenticated && user?.role === 'customer' && (
            <>
              <Link
                to="/bookings"
                className={`text-sm font-medium no-underline transition-colors ${
                  isActive('/bookings') ? 'text-primary' : 'text-text-muted hover:text-text'
                }`}
              >
                My Bookings
              </Link>
              <Link
                to="/waitlist"
                className={`text-sm font-medium no-underline transition-colors ${
                  isActive('/waitlist') ? 'text-primary' : 'text-text-muted hover:text-text'
                }`}
              >
                Waitlist
              </Link>
            </>
          )}

          {isAuthenticated && user?.role === 'admin' && (
            <Link
              to="/admin/venues"
              className={`text-sm font-medium no-underline transition-colors ${
                isActive('/admin/venues') ? 'text-primary' : 'text-text-muted hover:text-text'
              }`}
            >
              Venues
            </Link>
          )}

          {isAuthenticated && user?.role === 'organiser' && (
            <Link
              to="/organiser/dashboard"
              className={`text-sm font-medium no-underline transition-colors ${
                isActive('/organiser/dashboard') ? 'text-primary' : 'text-text-muted hover:text-text'
              }`}
            >
              Dashboard
            </Link>
          )}

          {isAuthenticated ? (
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-gradient-to-r from-primary to-secondary flex items-center justify-center text-white text-sm font-bold">
                  {user?.name?.[0]?.toUpperCase()}
                </div>
                <div className="text-sm">
                  <div className="font-medium text-text">{user?.name}</div>
                  <div className="text-xs text-text-muted capitalize">{user?.role}</div>
                </div>
              </div>
              <button onClick={handleLogout} className="btn-secondary text-sm !py-2 !px-4">
                Logout
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-3">
              <Link to="/login" className="btn-secondary text-sm !py-2 !px-4 no-underline">
                Login
              </Link>
              <Link to="/register" className="btn-primary text-sm !py-2 !px-4 no-underline">
                Register
              </Link>
            </div>
          )}
        </div>
      </div>
    </nav>
  );
}
