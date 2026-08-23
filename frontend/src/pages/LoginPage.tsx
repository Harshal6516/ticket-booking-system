import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { showToast } from '../components/Toast';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await login(email, password);
      showToast('success', 'Logged in successfully!');
      navigate('/');
    } catch (err: any) {
      showToast('error', err.response?.data?.error || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="glass-card p-10 w-full max-w-md animate-scale-in">
        <div className="text-center mb-8">
          <span className="text-4xl mb-4 block">🎫</span>
          <h1 className="text-2xl font-bold mb-2">Welcome Back</h1>
          <p className="text-text-muted text-sm">Sign in to your TicketHub account</p>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-5">
          <div>
            <label className="form-label" htmlFor="login-email">Email</label>
            <input
              id="login-email"
              type="email"
              className="form-input"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>

          <div>
            <label className="form-label" htmlFor="login-password">Password</label>
            <input
              id="login-password"
              type="password"
              className="form-input"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>

          <button type="submit" className="btn-primary w-full mt-2" disabled={loading}>
            {loading ? '⏳ Signing in...' : 'Sign In'}
          </button>
        </form>

        <p className="text-center mt-6 text-sm text-text-muted">
          Don't have an account?{' '}
          <Link to="/register" className="text-primary font-medium no-underline hover:underline">
            Register
          </Link>
        </p>
      </div>
    </div>
  );
}
