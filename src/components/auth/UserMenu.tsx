import React, { useState, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useOptionalAuth } from '../../contexts/AuthContext';
import { toast } from '../shared/Toast';

// Deterministic color from string
const avatarColor = (name: string) => {
  const colors = [
    'bg-copper-600', 'bg-arcane-600', 'bg-moss-600', 'bg-blood-600',
    'bg-purple-600', 'bg-amber-600', 'bg-teal-600', 'bg-indigo-600',
  ];
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return colors[Math.abs(hash) % colors.length];
};

export const UserMenu: React.FC = () => {
  const auth = useOptionalAuth();
  const [open, setOpen] = useState(false);
  const [showPasswordChange, setShowPasswordChange] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setShowPasswordChange(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  if (!auth || auth.loading) return null;

  if (!auth.user || !auth.profile) {
    return (
      <Link
        to="/login"
        className="px-3 py-1.5 text-xs bg-stone-700 hover:bg-stone-600 rounded text-stone-300 transition-colors"
      >
        Sign In
      </Link>
    );
  }

  const handlePasswordChange = async () => {
    if (newPassword.length < 6) {
      toast.warning('Password must be at least 6 characters');
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.warning('Passwords do not match');
      return;
    }

    setSaving(true);
    const { error } = await auth.changePassword(newPassword);
    setSaving(false);

    if (error) {
      toast.error(error);
    } else {
      toast.success('Password updated');
      setNewPassword('');
      setConfirmPassword('');
      setShowPasswordChange(false);
    }
  };

  const initial = auth.profile.display_name.charAt(0).toUpperCase();
  const color = avatarColor(auth.profile.display_name);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 px-2 py-1 rounded hover:bg-stone-700 transition-colors"
      >
        <div className={`w-7 h-7 rounded-full ${color} flex items-center justify-center text-xs font-bold text-white`}>
          {initial}
        </div>
        <span className="text-xs text-stone-300 hidden md:inline max-w-[100px] truncate">
          {auth.profile.display_name}
        </span>
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 w-56 dungeon-panel rounded shadow-xl z-50 py-1">
          <div className="px-3 py-2 border-b border-stone-700">
            <div className="text-sm font-medium text-parchment-100 truncate">{auth.profile.display_name}</div>
            <div className="text-xs text-stone-400 truncate">{auth.user.email}</div>
          </div>

          {showPasswordChange ? (
            <div className="px-3 py-2 space-y-2 border-b border-stone-700">
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="New password"
                className="w-full px-2 py-1.5 bg-stone-700 rounded text-sm text-parchment-100 placeholder:text-stone-500 focus:outline-none focus:ring-1 focus:ring-copper-400"
                minLength={6}
                autoFocus
              />
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Confirm password"
                className="w-full px-2 py-1.5 bg-stone-700 rounded text-sm text-parchment-100 placeholder:text-stone-500 focus:outline-none focus:ring-1 focus:ring-copper-400"
                minLength={6}
              />
              <div className="flex gap-2">
                <button
                  onClick={handlePasswordChange}
                  disabled={saving}
                  className="flex-1 px-2 py-1 bg-copper-600 hover:bg-copper-500 disabled:opacity-50 rounded text-xs text-parchment-100 transition-colors"
                >
                  {saving ? 'Saving...' : 'Save'}
                </button>
                <button
                  onClick={() => { setShowPasswordChange(false); setNewPassword(''); setConfirmPassword(''); }}
                  className="px-2 py-1 bg-stone-700 hover:bg-stone-600 rounded text-xs text-stone-300 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setShowPasswordChange(true)}
              className="w-full text-left px-3 py-2 text-sm text-stone-300 hover:bg-stone-700 hover:text-parchment-100 transition-colors"
            >
              Change Password
            </button>
          )}

          <button
            onClick={() => { auth.signOut(); setOpen(false); }}
            className="w-full text-left px-3 py-2 text-sm text-stone-300 hover:bg-stone-700 hover:text-parchment-100 transition-colors"
          >
            Sign Out
          </button>
        </div>
      )}
    </div>
  );
};
