import { NextRequest, NextResponse } from 'next/server';
import { activeAccount, fail } from '@/lib/account-route';
import { clientIp } from '@/lib/session';
import { createLog } from '@/server/services/log';
import {
  getProfile, updateProfile, checkUsername, setUsername, uploadProfilePhoto, deleteCurrentProfilePhoto,
} from '@/server/telegram/profile';

const MAX_PHOTO_BYTES = 10 * 1024 * 1024;

// GET — profile of the active account. ?checkUsername=foo → availability check
export async function GET(request: NextRequest) {
  const account = await activeAccount(request);
  if (account instanceof NextResponse) return account;
  try {
    const u = new URL(request.url).searchParams.get('checkUsername');
    if (u !== null) return NextResponse.json({ success: true, data: await checkUsername(account.slug, u) });
    return NextResponse.json({ success: true, data: await getProfile(account.slug) });
  } catch (err) {
    return fail(err);
  }
}

// PATCH — { firstName?, lastName?, about?, username? }
export async function PATCH(request: NextRequest) {
  const account = await activeAccount(request);
  if (account instanceof NextResponse) return account;
  const body = await request.json().catch(() => ({}));
  const str = (v: unknown) => (typeof v === 'string' ? v : undefined);
  try {
    const changed: string[] = [];
    const firstName = str(body.firstName), lastName = str(body.lastName), about = str(body.about), username = str(body.username);
    if (firstName !== undefined || lastName !== undefined || about !== undefined) {
      if (about !== undefined && about.length > 140) return fail('Bio is too long', 400);
      await updateProfile(account.slug, { firstName, lastName, about });
      if (firstName !== undefined) changed.push('first name');
      if (lastName !== undefined) changed.push('last name');
      if (about !== undefined) changed.push('bio');
    }
    if (username !== undefined) {
      await setUsername(account.slug, username);
      changed.push('username');
    }
    if (!changed.length) return fail('Nothing to update', 400);
    await createLog({ action: 'PROFILE_UPDATE', accountId: account.id, details: `Updated ${changed.join(', ')}`, ipAddress: clientIp(request) });
    return NextResponse.json({ success: true, data: await getProfile(account.slug) });
  } catch (err) {
    const msg = String((err as Error)?.message || err);
    return fail(/ABOUT_TOO_LONG/.test(msg) ? 'Bio is too long for this account' : msg, 400);
  }
}

// POST multipart { photo: File } — set a new profile photo
export async function POST(request: NextRequest) {
  const account = await activeAccount(request);
  if (account instanceof NextResponse) return account;
  try {
    const form = await request.formData();
    const file = form.get('photo');
    if (!(file instanceof File)) return fail('photo file is required', 400);
    if (!/^image\/(jpeg|png|webp)$/.test(file.type)) return fail('Use a JPG, PNG or WebP image', 400);
    if (file.size > MAX_PHOTO_BYTES) return fail('Image is larger than 10 MB', 400);
    await uploadProfilePhoto(account.slug, file.name || 'photo.jpg', Buffer.from(await file.arrayBuffer()));
    await createLog({ action: 'PROFILE_UPDATE', accountId: account.id, details: 'Uploaded a new profile photo', ipAddress: clientIp(request) });
    return NextResponse.json({ success: true, data: await getProfile(account.slug) });
  } catch (err) {
    return fail(err);
  }
}

// DELETE — remove the current profile photo
export async function DELETE(request: NextRequest) {
  const account = await activeAccount(request);
  if (account instanceof NextResponse) return account;
  try {
    const removed = await deleteCurrentProfilePhoto(account.slug);
    if (!removed) return fail('There is no profile photo to remove', 400);
    await createLog({ action: 'PROFILE_UPDATE', accountId: account.id, details: 'Removed the current profile photo', ipAddress: clientIp(request) });
    return NextResponse.json({ success: true, data: await getProfile(account.slug) });
  } catch (err) {
    return fail(err);
  }
}
