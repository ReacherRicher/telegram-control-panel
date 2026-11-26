import { getClientForAccount } from './client';
import { Api } from 'telegram';
import prisma from '../../lib/prisma';
import logger from '../../lib/logger';
import type { TelegramAccount } from '../../types';

export async function getAccountInfo(slug: string): Promise<TelegramAccount | null> {
  try {
    const client = await getClientForAccount(slug);
    const me = await client.getMe();
    if (!me) return null;
    const user = me as Api.User;
    return {
      id: String(user.id),
      firstName: user.firstName || '',
      lastName: user.lastName || undefined,
      username: user.username || undefined,
      phone: user.phone || undefined,
      isPremium: user.premium || false,
      isVerified: user.verified || false,
    };
  } catch (err) {
    logger.error('getAccountInfo failed', { slug, error: err });
    return null;
  }
}

export async function syncAccountInfoToDb(slug: string) {
  const info = await getAccountInfo(slug);
  if (!info) return;
  await prisma.account.update({
    where: { slug },
    data: {
      telegramId: info.id,
      firstName: info.firstName,
      lastName: info.lastName,
      username: info.username,
      phone: info.phone,
      isPremium: info.isPremium,
      isVerified: info.isVerified,
    },
  });
}
