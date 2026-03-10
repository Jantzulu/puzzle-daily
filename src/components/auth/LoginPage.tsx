import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { toast } from '../shared/Toast';

export const LoginPage: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const { signIn } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;

    setSubmitting(true);
    try {
      const { error } = await signIn(email, password);
      if (error) {
        toast.error(error);
      } else {
        toast.success('Signed in');
        navigate('/editors');
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen theme-root flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <h1 className="text-3xl font-bold font-medieval text-copper-400 text-center mb-6 text-shadow-dungeon">
          Enter the Forge
        </h1>

        <form onSubmit={handleSubmit} className="dungeon-panel p-6 space-y-4">
          <div>
            <label className="block text-xs text-stone-400 mb-1">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="w-full px-3 py-2 bg-stone-700 rounded text-parchment-100 text-sm placeholder:text-stone-500 focus:outline-none focus:ring-1 focus:ring-copper-400"
              required
              autoFocus
            />
          </div>

          <div>
            <label className="block text-xs text-stone-400 mb-1">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full px-3 py-2 bg-stone-700 rounded text-parchment-100 text-sm placeholder:text-stone-500 focus:outline-none focus:ring-1 focus:ring-copper-400"
              required
              minLength={6}
            />
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="w-full py-2.5 bg-copper-600 hover:bg-copper-500 disabled:opacity-50 disabled:cursor-not-allowed rounded font-medieval text-sm text-parchment-100 transition-colors"
          >
            {submitting ? 'Please wait...' : 'Sign In'}
          </button>
        </form>

        <p className="text-stone-600 text-xs text-center mt-4">
          Contact your admin for login credentials.
        </p>
      </div>
    </div>
  );
};
