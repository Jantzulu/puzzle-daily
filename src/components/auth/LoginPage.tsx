import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { toast } from '../shared/Toast';

type AuthMode = 'signin' | 'signup';

export const LoginPage: React.FC = () => {
  const [mode, setMode] = useState<AuthMode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const { signIn, signUp, profile } = useAuth();
  const navigate = useNavigate();

  const resetForm = () => {
    setEmail('');
    setPassword('');
    setConfirmPassword('');
    setDisplayName('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;

    if (mode === 'signup') {
      if (password !== confirmPassword) {
        toast.error('Passwords do not match');
        return;
      }
      if (!displayName.trim()) {
        toast.error('Display name is required');
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
          // Redirect based on role (profile may not be loaded yet, default to home)
          navigate(profile?.role === 'creator' ? '/editors' : '/');
        }
      } else {
        const { error } = await signUp(email, password, displayName.trim());
        if (error) {
          toast.error(error);
        } else {
          toast.success('Account created! Welcome aboard.');
          navigate('/');
        }
      }
    } finally {
      setSubmitting(false);
    }
  };

  const switchMode = (newMode: AuthMode) => {
    setMode(newMode);
    resetForm();
  };

  return (
    <div className="min-h-screen theme-root flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <h1 className="text-3xl font-bold font-medieval text-copper-400 text-center mb-6 text-shadow-dungeon">
          {mode === 'signin' ? 'Enter the Forge' : 'Join the Adventure'}
        </h1>

        {/* Mode toggle */}
        <div className="flex mb-4 rounded-pixel overflow-hidden border border-stone-600/50">
          <button
            onClick={() => switchMode('signin')}
            className={`flex-1 py-2 text-sm font-bold transition-colors ${
              mode === 'signin'
                ? 'bg-copper-600/30 text-copper-300'
                : 'bg-stone-800/50 text-stone-400 hover:text-stone-300'
            }`}
          >
            Sign In
          </button>
          <button
            onClick={() => switchMode('signup')}
            className={`flex-1 py-2 text-sm font-bold transition-colors ${
              mode === 'signup'
                ? 'bg-copper-600/30 text-copper-300'
                : 'bg-stone-800/50 text-stone-400 hover:text-stone-300'
            }`}
          >
            Sign Up
          </button>
        </div>

        <form onSubmit={handleSubmit} className="dungeon-panel p-6 space-y-4">
          {mode === 'signup' && (
            <div>
              <label className="block text-xs text-stone-400 mb-1">Display Name</label>
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Your hero name"
                className="w-full px-3 py-2 bg-stone-700 rounded text-parchment-100 text-sm placeholder:text-stone-500 focus:outline-none focus:ring-1 focus:ring-copper-400"
                required
                autoFocus
                maxLength={30}
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
            {submitting ? 'Please wait...' : mode === 'signin' ? 'Sign In' : 'Create Account'}
          </button>
        </form>

        <p className="text-stone-600 text-xs text-center mt-4">
          {mode === 'signin'
            ? "Don't have an account? Sign up above."
            : 'Your puzzle progress will be linked to your account.'}
        </p>
      </div>
    </div>
  );
};
