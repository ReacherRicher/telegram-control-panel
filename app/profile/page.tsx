'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { Alert, ConfirmDialog, Spinner, useToast } from '@/components/ui';
import { api, useDebounced } from '@/lib/client';

interface Profile {
  id: string; firstName: string; lastName: string; username: string; phone: string; about: string;
  isPremium: boolean; isVerified: boolean; photo: string | null; aboutLimit: number;
}

export default function ProfilePage() {
  const toast = useToast();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [error, setError] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [about, setAbout] = useState('');
  const [username, setUsername] = useState('');
  const [busy, setBusy] = useState<'' | 'info' | 'username' | 'photo'>('');
  const [unameCheck, setUnameCheck] = useState<{ available: boolean; error?: string } | null>(null);
  const [confirmRemovePhoto, setConfirmRemovePhoto] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const debUsername = useDebounced(username, 500);

  const apply = (p: Profile) => {
    setProfile(p); setFirstName(p.firstName); setLastName(p.lastName); setAbout(p.about); setUsername(p.username);
  };

  const load = useCallback(async () => {
    setError('');
    const r = await api<Profile>('/api/profile');
    if (r.ok && r.data) apply(r.data); else setError(r.error || 'Could not load profile');
  }, []);
  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!profile || debUsername.replace(/^@/, '') === profile.username) { setUnameCheck(null); return; }
    if (!debUsername.trim()) { setUnameCheck({ available: true }); return; }
    api<{ available: boolean; error?: string }>(`/api/profile?checkUsername=${encodeURIComponent(debUsername)}`)
      .then((r) => setUnameCheck(r.ok && r.data ? r.data : { available: false, error: r.error }));
  }, [debUsername, profile]);

  async function saveInfo(e: React.FormEvent) {
    e.preventDefault();
    setBusy('info');
    const r = await api<Profile>('/api/profile', { method: 'PATCH', body: { firstName, lastName, about } });
    setBusy('');
    if (r.ok && r.data) { apply(r.data); toast('Profile updated', 'success'); } else toast(r.error || 'Update failed', 'error');
  }

  async function saveUsername(e: React.FormEvent) {
    e.preventDefault();
    setBusy('username');
    const r = await api<Profile>('/api/profile', { method: 'PATCH', body: { username } });
    setBusy('');
    if (r.ok && r.data) { apply(r.data); setUnameCheck(null); toast(r.data.username ? `Username set to @${r.data.username}` : 'Username removed', 'success'); }
    else toast(r.error || 'Update failed', 'error');
  }

  async function uploadPhoto(file: File) {
    setBusy('photo');
    const fd = new FormData();
    fd.append('photo', file);
    const res = await fetch('/api/profile', { method: 'POST', body: fd }).catch(() => null);
    const json = res ? await res.json().catch(() => ({})) : {};
    setBusy('');
    if (res?.ok && json.success) { apply(json.data); toast('Profile photo updated', 'success'); } else toast(json.error || 'Upload failed', 'error');
    if (fileRef.current) fileRef.current.value = '';
  }

  async function removePhoto() {
    setBusy('photo');
    const r = await api<Profile>('/api/profile', { method: 'DELETE' });
    setBusy(''); setConfirmRemovePhoto(false);
    if (r.ok && r.data) { apply(r.data); toast('Profile photo removed', 'success'); } else toast(r.error || 'Failed', 'error');
  }

  const infoDirty = !!profile && (firstName !== profile.firstName || lastName !== profile.lastName || about !== profile.about);
  const unameDirty = !!profile && username.replace(/^@/, '') !== profile.username;

  return (
    <DashboardLayout title="Profile" subtitle="Name, bio, username and photo of the active account">
      <div className="max-w-3xl space-y-4">
        {error && <Alert kind="error">{error} <button className="underline ml-2" onClick={load}>Retry</button></Alert>}
        {!profile && !error && <div className="card text-slate-400"><Spinner /> Loading profile…</div>}

        {profile && (
          <>
            <div className="card flex flex-col sm:flex-row gap-5 sm:items-center">
              <div className="w-24 h-24 rounded-full bg-slate-200 overflow-hidden grid place-items-center text-3xl text-slate-500 flex-shrink-0">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {profile.photo ? <img src={profile.photo} alt="Profile photo" className="w-full h-full object-cover" /> : (profile.firstName[0] || '?')}
              </div>
              <div className="flex-1 space-y-1">
                <div className="text-lg font-semibold" dir="auto">{[profile.firstName, profile.lastName].filter(Boolean).join(' ')}</div>
                <div className="text-sm text-slate-500" dir="ltr">
                  {profile.username ? `@${profile.username}` : 'no username'} · +{profile.phone.replace(/^\+/, '')} · ID {profile.id}
                </div>
                <div className="flex gap-1">
                  {profile.isPremium && <span className="badge-purple">Premium</span>}
                  {profile.isVerified && <span className="badge-blue">Verified</span>}
                </div>
              </div>
              <div className="flex sm:flex-col gap-2">
                <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => e.target.files?.[0] && uploadPhoto(e.target.files[0])} />
                <button className="btn-secondary btn-sm" disabled={busy === 'photo'} onClick={() => fileRef.current?.click()}>
                  {busy === 'photo' ? <><Spinner /> Uploading…</> : 'Upload photo'}
                </button>
                {profile.photo && <button className="btn-ghost btn-sm text-red-600" disabled={busy === 'photo'} onClick={() => setConfirmRemovePhoto(true)}>Remove photo</button>}
              </div>
            </div>

            <form className="card space-y-3" onSubmit={saveInfo}>
              <h2 className="card-title">Name & bio</h2>
              <div className="grid sm:grid-cols-2 gap-3">
                <div>
                  <label className="label" htmlFor="fn">First name</label>
                  <input id="fn" className="input" value={firstName} onChange={(e) => setFirstName(e.target.value)} maxLength={64} required dir="auto" />
                </div>
                <div>
                  <label className="label" htmlFor="ln">Last name</label>
                  <input id="ln" className="input" value={lastName} onChange={(e) => setLastName(e.target.value)} maxLength={64} dir="auto" />
                </div>
              </div>
              <div>
                <label className="label" htmlFor="bio">Bio</label>
                <textarea id="bio" className="input min-h-[80px]" value={about} onChange={(e) => setAbout(e.target.value)} maxLength={profile.aboutLimit} dir="auto" />
                <div className="text-xs text-slate-400 text-right tabular-nums">{about.length}/{profile.aboutLimit}</div>
              </div>
              <div className="flex justify-end gap-2">
                <button type="button" className="btn-secondary" disabled={!infoDirty || busy === 'info'} onClick={() => apply(profile)}>Reset</button>
                <button className="btn-primary" disabled={!infoDirty || busy === 'info'}>{busy === 'info' ? <><Spinner /> Saving…</> : 'Save'}</button>
              </div>
            </form>

            <form className="card space-y-3" onSubmit={saveUsername}>
              <h2 className="card-title">Username</h2>
              <p className="text-sm text-slate-500">People can find this account by its username and open <span dir="ltr">t.me/username</span>. Leave empty to remove it.</p>
              <div className="flex items-center">
                <span className="px-3 py-2 bg-slate-100 border border-r-0 border-slate-300 rounded-l-lg text-slate-500">@</span>
                <input className="input rounded-l-none" value={username.replace(/^@/, '')} onChange={(e) => setUsername(e.target.value)} maxLength={32} dir="ltr" aria-label="Username" />
              </div>
              {unameDirty && unameCheck && (
                <div className={`text-sm ${unameCheck.available ? 'text-emerald-600' : 'text-red-600'}`}>
                  {unameCheck.available ? (username.trim() ? '✓ Available' : 'The username will be removed') : `✕ ${unameCheck.error || 'Not available'}`}
                </div>
              )}
              <div className="flex justify-end">
                <button className="btn-primary" disabled={!unameDirty || busy === 'username' || (unameCheck !== null && !unameCheck.available)}>
                  {busy === 'username' ? <><Spinner /> Saving…</> : 'Save username'}
                </button>
              </div>
            </form>
          </>
        )}
      </div>

      <ConfirmDialog open={confirmRemovePhoto} title="Remove profile photo?" danger confirmLabel="Remove" busy={busy === 'photo'}
        onConfirm={removePhoto} onClose={() => setConfirmRemovePhoto(false)}>
        The current profile photo will be deleted from Telegram. Older photos (if any) become the current one.
      </ConfirmDialog>
    </DashboardLayout>
  );
}
