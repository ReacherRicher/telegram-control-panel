import bigIntLib from 'big-integer';
import { getClientForAccount } from './client';
import { Api } from 'telegram';
import prisma from '../../lib/prisma';
import logger from '../../lib/logger';

export async function syncContacts(slug: string, accountId: number): Promise<number> {
  const client = await getClientForAccount(slug);
  const result = await client.invoke(new Api.contacts.GetContacts({ hash: bigIntLib(0) }));

  if (!(result instanceof Api.contacts.Contacts)) {
    logger.warn('No contacts returned', { slug });
    return 0;
  }

  let count = 0;
  for (const user of result.users) {
    if (!(user instanceof Api.User)) continue;
    await prisma.user.upsert({
      where: { accountId_telegramId: { accountId, telegramId: String(user.id) } },
      update: {
        firstName: user.firstName || '',
        lastName: user.lastName || undefined,
        username: user.username || undefined,
        phone: user.phone || undefined,
        isPremium: user.premium || false,
        isVerified: user.verified || false,
        isBot: user.bot || false,
        accessHash: user.accessHash ? String(user.accessHash) : undefined,
      },
      create: {
        accountId,
        telegramId: String(user.id),
        firstName: user.firstName || '',
        lastName: user.lastName || undefined,
        username: user.username || undefined,
        phone: user.phone || undefined,
        isPremium: user.premium || false,
        isVerified: user.verified || false,
        isBot: user.bot || false,
        accessHash: user.accessHash ? String(user.accessHash) : undefined,
      },
    });
    count++;
  }

  logger.info(`Synced ${count} contacts for ${slug}`);
  return count;
}
