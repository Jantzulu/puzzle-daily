import React, { useState, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useOptionalAuth } from '../../contexts/AuthContext';
import { toast } from '../shared/Toast';

const AVATAR_ICONS = ['⚔️', '🛡️', '🧙', '🏹', '💀', '🐉', '👑', '🔮', '🗡️', '🧝', '🦊', '🐺', '🏰', '⭐', '🔥', '💎'];
const AVATAR_COLORS = [
  'bg-copper-600', 'bg-arcane-600', 'bg-moss-600', 'bg-blood-600',
  'bg-purple-600', 'bg-amber-600', 'bg-teal-600', 'bg-indigo-600',
];

// Parse avatar_url as "icon:color_index" or fall back to initial-based
const parseAvatar = (profile: { display_name: string; avatar_url?: string | null }) => {
  if (profile.avatar_url?.includes(':')) {
    const [icon, colorIdx] = profile.avatar_url.split(':');
    return { icon, color: AVATAR_COLORS[parseInt(colorIdx) || 0] || AVATAR_COLORS[0] };
  }
  // Default: first letter + deterministic color
  let hash = 0;
  for (let i = 0; i < profile.display_name.length; i++) hash = profile.display_name.charCodeAt(i) + ((hash << 5) - hash);
  return { icon: profile.display_name.charAt(0).toUpperCase(), color: AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length] };
};

export const UserMenu: React.FC = () => {
  const auth = useOptionalAuth();
  const [open, setOpen] = useState(false);
  const [showPasswordChange, setShowPasswordChange] = useState(false);
  const [showNameEdit, setShowNameEdit] = useState(false);
  const [showAvatarEdit, setShowAvatarEdit] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [newDisplayName, setNewDisplayName] = useState('');
  const [selectedIcon, setSelectedIcon] = useState('');
  const [selectedColorIdx, setSelectedColorIdx] = useState(0);
  const [saving, setSaving] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setShowPasswordChange(false);
        setShowNameEdit(false);
        setShowAvatarEdit(false);
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

  const handleAvatarSave = async () => {
    setSaving(true);
    const { error } = await auth.updateProfile({ avatar_url: `${selectedIcon}:${selectedColorIdx}` });
    setSaving(false);

    if (error) {
      toast.error(error);
    } else {
      toast.success('Avatar updated');
      setShowAvatarEdit(false);
    }
  };

  const handleNameChange = async () => {
    const trimmed = newDisplayName.trim();
    if (trimmed.length < 1) {
      toast.warning('Display name cannot be empty');
      return;
    }

    setSaving(true);
    const { error } = await auth.updateProfile({ display_name: trimmed });
    setSaving(false);

    if (error) {
      toast.error(error);
    } else {
      toast.success('Display name updated');
      setNewDisplayName('');
      setShowNameEdit(false);
    }
  };

  const avatar = parseAvatar(auth.profile);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 px-2 py-1 rounded hover:bg-stone-700 transition-colors"
      >
        <div className={`w-7 h-7 rounded-full ${avatar.color} flex items-center justify-center text-xs font-bold text-white`}>
          {avatar.icon}
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

          {showAvatarEdit ? (
            <div className="px-3 py-2 space-y-2 border-b border-stone-700">
              <div className="text-xs text-stone-400 mb-1">Pick an icon</div>
              <div className="grid grid-cols-8 gap-1">
                {AVATAR_ICONS.map((icon) => (
                  <button
                    key={icon}
                    onClick={() => setSelectedIcon(icon)}
                    className={`w-6 h-6 rounded flex items-center justify-center text-sm hover:bg-stone-600 transition-colors ${selectedIcon === icon ? 'ring-1 ring-copper-400 bg-stone-600' : ''}`}
                  >
                    {icon}
                  </button>
                ))}
              </div>
              <div className="text-xs text-stone-400 mb-1">Pick a color</div>
              <div className="flex gap-1">
                {AVATAR_COLORS.map((c, i) => (
                  <button
                    key={c}
                    onClick={() => setSelectedColorIdx(i)}
                    className={`w-6 h-6 rounded-full ${c} transition-all ${selectedColorIdx === i ? 'ring-2 ring-copper-400 scale-110' : 'hover:scale-105'}`}
                  />
                ))}
              </div>
              <div className="flex items-center gap-2 pt-1">
                <div className={`w-8 h-8 rounded-full ${AVATAR_COLORS[selectedColorIdx]} flex items-center justify-center text-sm`}>
                  {selectedIcon}
                </div>
                <button
                  onClick={handleAvatarSave}
                  disabled={saving}
                  className="flex-1 px-2 py-1 bg-copper-600 hover:bg-copper-500 disabled:opacity-50 rounded text-xs text-parchment-100 transition-colors"
                >
                  {saving ? 'Saving...' : 'Save'}
                </button>
                <button
                  onClick={() => setShowAvatarEdit(false)}
                  className="px-2 py-1 bg-stone-700 hover:bg-stone-600 rounded text-xs text-stone-300 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => {
                const cur = parseAvatar(auth.profile!);
                setSelectedIcon(cur.icon);
                setSelectedColorIdx(AVATAR_COLORS.indexOf(cur.color));
                setShowAvatarEdit(true);
              }}
              className="w-full text-left px-3 py-2 text-sm text-stone-300 hover:bg-stone-700 hover:text-parchment-100 transition-colors"
            >
              Change Avatar
            </button>
          )}

          {showNameEdit ? (
            <div className="px-3 py-2 space-y-2 border-b border-stone-700">
              <input
                type="text"
                value={newDisplayName}
                onChange={(e) => setNewDisplayName(e.target.value)}
                placeholder="New display name"
                className="w-full px-2 py-1.5 bg-stone-700 rounded text-sm text-parchment-100 placeholder:text-stone-500 focus:outline-none focus:ring-1 focus:ring-copper-400"
                maxLength={30}
                autoFocus
              />
              <div className="flex gap-2">
                <button
                  onClick={handleNameChange}
                  disabled={saving}
                  className="flex-1 px-2 py-1 bg-copper-600 hover:bg-copper-500 disabled:opacity-50 rounded text-xs text-parchment-100 transition-colors"
                >
                  {saving ? 'Saving...' : 'Save'}
                </button>
                <button
                  onClick={() => { setShowNameEdit(false); setNewDisplayName(''); }}
                  className="px-2 py-1 bg-stone-700 hover:bg-stone-600 rounded text-xs text-stone-300 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => { setShowNameEdit(true); setNewDisplayName(auth.profile!.display_name); }}
              className="w-full text-left px-3 py-2 text-sm text-stone-300 hover:bg-stone-700 hover:text-parchment-100 transition-colors"
            >
              Change Display Name
            </button>
          )}

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
