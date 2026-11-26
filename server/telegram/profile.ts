/**
 * Profile management for a managed account: name, bio, username and profile photo.
 */
import bigInt from 'big-integer';
import { Api } from 'telegram';
import { CustomFile } from 'telegram/client/uploads';
import { getClientForAccount } from './client';
import { syncAccountInfoToDb } from './account';

export interface ProfileInfo {
  id: string;
  firstName: string;
  lastName: string;
  username: string;
  phone: string;
  about: string;
  isPremium: boolean;
  isVerified: boolean;
  /** data: URL of the small profile photo, or null */
  photo: string | null;
  /** max bio length for this account (70 regular / 140 premium) */
  aboutLimit: number;
}

export async function getProfile(slug: string): Promise<ProfileInfo> {
  const client = await getClientForAccount(slug);
  const full = await client.invoke(new Api.users.GetFullUser({ id: new Api.InputUserSelf() }));
  const me = full.users.find((u) => u instanceof Api.User && u.self) as Api.User | undefined;
  if (!me) throw new Error('Could not load the account profile');

  let photo: string | null = null;
  try {
    const buf = await client.downloadProfilePhoto('me', { isBig: false });
    if (buf && Buffer.isBuffer(buf) && buf.length > 0) photo = `data:image/jpeg;base64,${buf.toString('base64')}`;
  } catch { /* no photo */ }

  return {
    id: String(me.id),
    firstName: me.firstName || '',
    lastName: me.lastName || '',
    username: me.username || '',
    phone: me.phone || '',
    about: full.fullUser.about || '',
    isPremium: !!me.premium,
    isVerified: !!me.verified,
    photo,
    aboutLimit: me.premium ? 140 : 70,
  };
}

export async function updateProfile(slug: string, data: { firstName?: string; lastName?: string; about?: string }) {
  const client = await getClientForAccount(slug);
  if (data.firstName !== undefined && !data.firstName.trim()) throw new Error('First name cannot be empty');
  await client.invoke(new Api.account.UpdateProfile({
    firstName: data.firstName?.trim(),
    lastName: data.lastName?.trim(),
    about: data.about,
  }));
  await syncAccountInfoToDb(slug);
}

const USERNAME_RE = /^[a-zA-Z][a-zA-Z0-9_]{3,31}$/;

export async function checkUsername(slug: string, username: string): Promise<{ available: boolean; error?: string }> {
  const u = username.replace(/^@/, '').trim();
  if (!u) return { available: true };
  if (!USERNAME_RE.test(u)) return { available: false, error: '5–32 characters: letters, digits and _, must start with a letter' };
  const client = await getClientForAccount(slug);
  try {
    const ok = await client.invoke(new Api.account.CheckUsername({ username: u }));
    return { available: !!ok, error: ok ? undefined : 'This username is taken' };
  } catch (err) {
    const msg = String((err as Error)?.message || err);
    if (/USERNAME_INVALID/.test(msg)) return { available: false, error: 'Invalid username' };
    if (/USERNAME_OCCUPIED/.test(msg)) return { available: false, error: 'This username is taken' };
    if (/USERNAME_PURCHASE_AVAILABLE/.test(msg)) return { available: false, error: 'This username is only available on Fragment' };
    throw err;
  }
}

/** Set (or with an empty string, remove) the account username. */
export async function setUsername(slug: string, username: string) {
  const u = username.replace(/^@/, '').trim();
  if (u && !USERNAME_RE.test(u)) throw new Error('Invalid username: 5–32 characters, letters, digits and _');
  const client = await getClientForAccount(slug);
  try {
    await client.invoke(new Api.account.UpdateUsername({ username: u }));
  } catch (err) {
    const msg = String((err as Error)?.message || err);
    if (/USERNAME_NOT_MODIFIED/.test(msg)) return;
    if (/USERNAME_OCCUPIED/.test(msg)) throw new Error('This username is taken');
    throw err;
  }
  await syncAccountInfoToDb(slug);
}

export async function uploadProfilePhoto(slug: string, fileName: string, data: Buffer) {
  const client = await getClientForAccount(slug);
  const file = await client.uploadFile({ file: new CustomFile(fileName, data.length, '', data), workers: 1 });
  await client.invoke(new Api.photos.UploadProfilePhoto({ file }));
}

/** Remove the current (most recent) profile photo. */
export async function deleteCurrentProfilePhoto(slug: string): Promise<boolean> {
  const client = await getClientForAccount(slug);
  const res = await client.invoke(new Api.photos.GetUserPhotos({ userId: new Api.InputUserSelf(), offset: 0, maxId: bigInt(0), limit: 1 }));
  const p = res.photos[0];
  if (!(p instanceof Api.Photo)) return false;
  await client.invoke(new Api.photos.DeletePhotos({
    id: [new Api.InputPhoto({ id: p.id, accessHash: p.accessHash, fileReference: p.fileReference })],
  }));
  return true;
}

