// Utility helpers

export function extractDomain(url: string): string | null {
  try {
    const u = new URL(url);
    return u.hostname;
  } catch {
    return null;
  }
}

export function extractUrls(text: string): string[] {
  const urlRegex = /https?:\/\/[^\s<>"']+/gi;
  return (text.match(urlRegex) || []).map((u) => u.replace(/[.,;!?]$/, ''));
}

export function sanitizeFilename(name: string): string {
  return name
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, '_')
    .replace(/^\.+/, '_')
    .substring(0, 255);
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

export function formatNumber(n: number): string {
  return new Intl.NumberFormat().format(n);
}

export function chunkArray<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries = 3,
  baseDelay = 1000
): Promise<T> {
  let lastError: Error | undefined;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err: unknown) {
      lastError = err as Error;
      const errMsg = lastError?.message || '';

      // FloodWait: GramJS throws FloodWaitError with .seconds (message is "A wait of N seconds is required")
      const e = err as { seconds?: number; code?: number; errorMessage?: string };
      const floodMatch = errMsg.match(/FLOOD_WAIT_(\d+)|wait of (\d+) seconds/i);
      const waitSeconds = typeof e.seconds === 'number' ? e.seconds : floodMatch ? parseInt(floodMatch[1] || floodMatch[2], 10) : 0;
      if (waitSeconds > 0) {
        console.log(`FloodWait: waiting ${waitSeconds}s...`);
        await sleep((waitSeconds + 1) * 1000);
        attempt--; // don't count flood wait as a retry
        continue;
      }

      // Deterministic Telegram errors (bad request / forbidden) won't succeed on retry
      if (e.code === 400 || e.code === 403 || e.code === 401) throw err;

      if (attempt < maxRetries) {
        const delay = baseDelay * Math.pow(2, attempt);
        await sleep(delay);
      }
    }
  }
  throw lastError;
}
