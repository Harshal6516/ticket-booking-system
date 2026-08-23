import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { showToast } from '../components/Toast';

export default function RegisterPage() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('customer');
  const [loading, setLoading] = useState(false);
  const { register } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await register(name, email, password, role);
      showToast('success', 'Account created successfully!');
      navigate('/');
    } catch (err: any) {
      showToast('error', err.response?.data?.error || 'Registration failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="glass-card p-10 w-full max-w-md animate-scale-in">
        <div className="text-center mb-8">
          <span className="text-4xl mb-4 block">🎫</span>
          <h1 className="text-2xl font-bold mb-2">Create Account</h1>
          <p className="text-text-muted text-sm">Join TicketHub and start booking</p>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-5">
          <div>
            <label className="form-label" htmlFor="register-name">Full Name</label>
            <input
              id="register-name"
              type="text"
              className="form-input"
              placeholder="John Doe"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>

          <div>
            <label className="form-label" htmlFor="register-email">Email</label>
            <input
              id="register-email"
              type="email"
              className="form-input"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>

          <div>
            <label className="form-label" htmlFor="register-password">Password</label>
            <input
              id="register-password"
              type="password"
              className="form-input"
              placeholder="Minimum 6 characters"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
            />
          </div>

          <div>
            <label className="form-label" htmlFor="register-role">I am a</label>
            <select
              id="register-role"
              className="form-select"
              value={role}
              onChange={(e) => setRole(e.target.value)}
            >
              <option value="customer">Customer — I want to book tickets</option>
              <option value="organiser">Organiser — I host events</option>
              <option value="admin">Admin — I manage venues</option>
            </select>
          </div>

          <button type="submit" className="btn-primary w-full mt-2" disabled={loading}>
            {loading ? '⏳ Creating account...' : 'Create Account'}
          </button>
        </form>

        <p className="text-center mt-6 text-sm text-text-muted">
          Already have an account?{' '}
          <Link to="/login" className="text-primary font-medium no-underline hover:underline">
            Sign In
          </Link>
        </p>
      </div>
    </div>
  );
}
