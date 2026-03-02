import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { toast } from '../shared/Toast';

export const LoginPage: React.FC = () => {
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const { signIn, signUp } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;

    if (mode === 'signup') {
      if (password !== confirmPassword) {
        toast.warning('Passwords do not match');
        return;
      }
      if (password.length < 6) {
        toast.warning('Password must be at least 6 characters');
        return;
      }
      if (!displayName.trim()) {
        toast.warning('Please enter a display name');
        return;
      }
    }

    setSubmitting(true);
    try {
      if (mode === 'signin') {
        const { error } = await signIn(email, password);
        if (error) {
          toast.error(error);
        } else {
          toast.success('Signed in');
          navigate('/editor');
        }
      } else {
        const { error } = await signUp(email, password, displayName.trim());
        if (error) {
          toast.error(error);
        } else {
          toast.success('Account created! You can now sign in.');
          setMode('signin');
        }
      }
    } finally {
      setSubmitting(false);
    }
  };

  const tabClass = (tab: 'signin' | 'signup') =>
    `flex-1 py-2 text-center text-sm font-medieval transition-colors ${
      mode === tab
        ? 'bg-stone-700 text-copper-400 border-b-2 border-copper-400'
        : 'bg-stone-800 text-stone-400 hover:text-stone-300'
    }`;

  return (
    <div className="min-h-screen theme-root flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <h1 className="text-3xl font-bold font-medieval text-copper-400 text-center mb-6 text-shadow-dungeon">
          Enter the Forge
        </h1>

        {/* Tabs */}
        <div className="flex rounded-t overflow-hidden border border-stone-700 border-b-0">
          <button onClick={() => setMode('signin')} className={tabClass('signin')}>
            Sign In
          </button>
          <button onClick={() => setMode('signup')} className={tabClass('signup')}>
            Create Account
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="dungeon-panel rounded-t-none p-6 space-y-4">
          {mode === 'signup' && (
            <div>
              <label className="block text-xs text-stone-400 mb-1">Display Name</label>
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Your name"
                className="w-full px-3 py-2 bg-stone-700 rounded text-parchment-100 text-sm placeholder:text-stone-500 focus:outline-none focus:ring-1 focus:ring-copper-400"
                required
                autoFocus
              />
            </div>
          )}

          <div>
            <label className="block text-xs text-stone-400 mb-1">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="w-full px-3 py-2 bg-stone-700 rounded text-parchment-100 text-sm placeholder:text-stone-500 focus:outline-none focus:ring-1 focus:ring-copper-400"
              required
              autoFocus={mode === 'signin'}
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

          {mode === 'signup' && (
            <div>
              <label className="block text-xs text-stone-400 mb-1">Confirm Password</label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full px-3 py-2 bg-stone-700 rounded text-parchment-100 text-sm placeholder:text-stone-500 focus:outline-none focus:ring-1 focus:ring-copper-400"
                required
                minLength={6}
              />
            </div>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full py-2.5 bg-copper-600 hover:bg-copper-500 disabled:opacity-50 disabled:cursor-not-allowed rounded font-medieval text-sm text-parchment-100 transition-colors"
          >
            {submitting
              ? 'Please wait...'
              : mode === 'signin'
                ? 'Sign In'
                : 'Create Account'}
          </button>
        </form>
      </div>
    </div>
  );
};
