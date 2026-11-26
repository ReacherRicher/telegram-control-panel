export const JOB_LABELS: Record<string, string> = {
  INDEX_MESSAGES: 'Index messages',
  DOWNLOAD_MEDIA: 'Download media',
  FORWARD_MESSAGES: 'Forward',
  FORWARD_AND_DELETE: 'Forward & clean up',
  EXPORT_MESSAGES: 'Export',
  DELETE_MESSAGES: 'Delete messages',
  JOIN_CHAT: 'Join chat',
  LEAVE_CHAT: 'Leave chat',
  LEAVE_ALL_GROUPS: 'Leave all groups',
  LEAVE_ALL_CHANNELS: 'Leave all channels',
  DELETE_ALL_PRIVATE_CHATS: 'Delete all private chats',
  MARK_READ: 'Mark as read',
  SEND_MESSAGE: 'Send / broadcast',
};

export const JOB_STATUS: Record<string, { label: string; badge: string; dot: string }> = {
  QUEUED: { label: 'Queued', badge: 'badge-gray', dot: 'bg-slate-400' },
  RUNNING: { label: 'Running', badge: 'badge-blue', dot: 'bg-blue-500 animate-pulse' },
  PAUSED: { label: 'Paused', badge: 'badge-yellow', dot: 'bg-amber-500' },
  COMPLETED: { label: 'Completed', badge: 'badge-green', dot: 'bg-emerald-500' },
  FAILED: { label: 'Failed', badge: 'badge-red', dot: 'bg-red-500' },
  CANCELLED: { label: 'Cancelled', badge: 'badge-gray', dot: 'bg-slate-400' },
};

export const CHAT_TYPES: Record<string, { label: string; badge: string; icon: string }> = {
  PRIVATE: { label: 'Private', badge: 'badge-blue', icon: '👤' },
  GROUP: { label: 'Group', badge: 'badge-green', icon: '👥' },
  SUPERGROUP: { label: 'Supergroup', badge: 'badge-purple', icon: '👥' },
  CHANNEL: { label: 'Channel', badge: 'badge-yellow', icon: '📢' },
  BOT: { label: 'Bot', badge: 'badge-gray', icon: '🤖' },
  SAVED_MESSAGES: { label: 'Saved', badge: 'badge-blue', icon: '🔖' },
};

export const MESSAGE_TYPES = ['TEXT', 'PHOTO', 'VIDEO', 'DOCUMENT', 'AUDIO', 'VOICE', 'GIF', 'STICKER', 'LOCATION', 'CONTACT', 'POLL', 'OTHER'];

export const TYPE_BADGE: Record<string, string> = {
  TEXT: 'badge-gray', PHOTO: 'badge-blue', VIDEO: 'badge-purple', DOCUMENT: 'badge-yellow',
  AUDIO: 'badge-green', VOICE: 'badge-green', GIF: 'badge-blue', STICKER: 'badge-yellow',
  LOCATION: 'badge-green', CONTACT: 'badge-gray', POLL: 'badge-gray', OTHER: 'badge-gray',
};

export const ACTIVE_STATUSES = ['QUEUED', 'RUNNING', 'PAUSED'];
