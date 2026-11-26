import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { createLog } from '@/server/services/log';

export async function POST(request: NextRequest) {
  const session = await getSession();
  await createLog({
    action: 'LOGOUT',
    details: `Admin logged out: ${session.username}`,
    ipAddress: request.headers.get('x-forwarded-for') || 'unknown',
  });
  session.destroy();
  return NextResponse.json({ success: true });
}
