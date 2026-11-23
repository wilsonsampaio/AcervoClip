export type SocialPlatform = string;

export type VideoTypeFilter =
  | 'todos'
  | 'curto'
  | 'tutorial'
  | 'clipe'
  | 'analise'
  | 'documentario'
  | 'viral';

export interface CategoryConfig {
  slug: string;
  name: string;
  keywords: string[];
  createdAt: string;
}

export interface LibraryConfig {
  aiAutoCategorize: boolean;
  categories: CategoryConfig[];
}

export interface SocialPostResult {
  id: string;
  title: string;
  author: string;
  platform: string;
  videoType: string;
  videoTypeSlug: VideoTypeFilter;
  duration: string;
  summary: string;
  postUrl: string;
  directMediaUrl?: string;
  thumbnailUrl?: string;
  suggestedCategorySlug: string;
  tags: string[];
  hasDirectStream: boolean;
  sourceEngine: 'social-search' | 'open-archive' | 'url-inspect';
}

export interface SavedMediaItem {
  id: string;
  baseSlug: string;
  title: string;
  author: string;
  platform: string;
  videoType: string;
  duration: string;
  summary: string;
  postUrl: string;
  categorySlug: string;
  categoryName: string;
  tags: string[];
  savedAt: string;
  hasVideoFile: boolean;
  videoFilename?: string;
  videoSizeBytes: number;
  hasThumbnail: boolean;
  thumbnailFilename?: string;
  htmlFilename?: string;
  downloadMode: 'mp4-direct' | 'package-saved' | 'local-upload';
}

export interface CategorySummary extends CategoryConfig {
  itemCount: number;
  videoCount: number;
  totalBytes: number;
}

export interface LibrarySnapshot {
  config: LibraryConfig;
  categories: CategorySummary[];
  items: SavedMediaItem[];
  totalItems: number;
  totalVideos: number;
  totalBytes: number;
}

export interface DownloadQueueEntry {
  queueId: string;
  postId: string;
  title: string;
  platform: string;
  categorySlug: string;
  categoryName: string;
  status: 'downloading' | 'completed' | 'package-only' | 'error';
  message: string;
  startedAt: string;
  savedItem?: SavedMediaItem;
}

export type OAuthProviderId =
  | 'youtube'
  | 'reddit'
  | 'twitch'
  | 'vimeo'
  | 'dailymotion'
  | 'tiktok'
  | 'instagram'
  | 'x'
  | 'linkedin'
  | 'pinterest'
  | 'mastodon';

export interface OAuthProviderStatus {
  provider: OAuthProviderId;
  label: string;
  description: string;
  configured: boolean;
  connected: boolean;
  dynamicInstance?: boolean;
  instanceHost?: string;
  supportsImport: boolean;
  username?: string;
  avatarUrl?: string;
  callbackUrl: string;
  envHint: string;
}

export interface SocialAuthStatusResponse {
  appBaseUrl: string;
  providers: OAuthProviderStatus[];
}
