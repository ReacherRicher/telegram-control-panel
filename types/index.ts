// Type definitions for the entire application

export type ChatType = 'PRIVATE' | 'GROUP' | 'SUPERGROUP' | 'CHANNEL' | 'BOT' | 'SAVED_MESSAGES';

export type MessageType =
  | 'TEXT'
  | 'PHOTO'
  | 'VIDEO'
  | 'DOCUMENT'
  | 'AUDIO'
  | 'VOICE'
  | 'GIF'
  | 'ANIMATION'
  | 'STICKER'
  | 'CONTACT'
  | 'LOCATION'
  | 'POLL'
  | 'OTHER';

export type JobType =
  | 'INDEX_MESSAGES'
  | 'DOWNLOAD_MEDIA'
  | 'FORWARD_MESSAGES'
  | 'FORWARD_AND_DELETE'
  | 'EXPORT_MESSAGES'
  | 'DELETE_MESSAGES'
  | 'JOIN_CHAT'
  | 'LEAVE_CHAT'
  | 'LEAVE_ALL_GROUPS'
  | 'LEAVE_ALL_CHANNELS'
  | 'DELETE_ALL_PRIVATE_CHATS'
  | 'MARK_READ'
  | 'SEND_MESSAGE';

export type JobStatus = 'QUEUED' | 'RUNNING' | 'PAUSED' | 'COMPLETED' | 'FAILED' | 'CANCELLED';

export type JobItemStatus = 'PENDING' | 'SUCCESS' | 'FAILED' | 'SKIPPED';

export type ContentFilter =
  | 'ALL'
  | 'PHOTOS'
  | 'VIDEOS'
  | 'DOCUMENTS'
  | 'AUDIO'
  | 'VOICE'
  | 'GIFS'
  | 'STICKERS'
  | 'TEXT'
  | 'LINKS';

export type ExportFormat = 'JSON' | 'CSV' | 'TXT' | 'HTML';

export type DeletionMode = 'FOR_ME' | 'FOR_EVERYONE';

export type LogAction =
  | 'LOGIN'
  | 'LOGOUT'
  | 'SYNC'
  | 'INDEX'
  | 'DOWNLOAD'
  | 'EXPORT'
  | 'FORWARD'
  | 'DELETE'
  | 'JOIN'
  | 'LEAVE'
  | 'MARK_READ'
  | 'LOCATION_START'
  | 'LOCATION_STOP'
  | 'SEND'
  | 'PROFILE_UPDATE'
  | 'SECURITY'
  | 'ERROR';

export interface TelegramAccount {
  id: string;
  firstName: string;
  lastName?: string;
  username?: string;
  phone?: string;
  isPremium?: boolean;
  isVerified?: boolean;
}

export interface TelegramConnectionStatus {
  connected: boolean;
  account?: TelegramAccount;
  sessionFile: string;
}

export interface PaginationParams {
  page?: number;
  limit?: number;
}

export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface JobCreateParams {
  type: JobType;
  sourceChatRaw?: string;
  destinationChatRaw?: string;
  contentFilter?: ContentFilter;
  dateFrom?: Date;
  dateTo?: Date;
  formatOption?: ExportFormat;
  deletionMode?: DeletionMode;
}

export interface OperationReview {
  type: JobType;
  sourceChat?: string;
  destinationChat?: string;
  contentFilter?: ContentFilter;
  dateFrom?: Date;
  dateTo?: Date;
  estimatedCount?: number;
  warning?: string;
}

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}
