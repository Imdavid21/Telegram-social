export type FeedFilter = 'all' | 'unread' | 'saved' | 'media'
export type FeedMode = 'for-you' | 'latest'
export type ThemeMode = 'system' | 'light' | 'dark'
export type AutoplayMode = 'off' | 'on'

export type SourceType = 'person' | 'group' | 'channel' | 'conversation'
export type MediaKind = 'photo' | 'video' | 'gif' | 'audio' | 'voice' | 'document' | 'sticker' | 'album' | 'poll' | 'location' | 'contact'

export interface UserSettings {
  feedMode: FeedMode
  themeMode: ThemeMode
  includePrivateChatsInForYou: boolean
  summarizePrivateChats: boolean
  autoplay: AutoplayMode
}

export type RankingReasonType = 'fresh' | 'source_affinity' | 'media' | 'unread' | 'multi_source' | 'engagement' | 'favorite' | 'latest'
export interface RankingReason {
  type: RankingReasonType
  label: string
}

export interface Channel {
  id: string
  title: string
  username?: string
  initials: string
  accent: string
  unread: number
  followers?: string
  muted?: boolean
  type?: SourceType
  avatar?: string
  private?: boolean
  archived?: boolean
  verified?: boolean
}

export interface MediaAsset {
  kind: Exclude<MediaKind, 'album'>
  src?: string
  ticketEndpoint?: string
  gradient?: string
  label?: string
  mimeType?: string
  name?: string
  size?: number
  duration?: number
  width?: number
  height?: number
  round?: boolean
  supportsStreaming?: boolean
  groupId?: string
  messageId?: number
}

export interface AlbumMedia {
  kind: 'album'
  groupId?: string
  items: MediaAsset[]
}

export interface StoryMember {
  id: string
  messageId: number
  channelId: string
  timestamp: number
  text: string
}

export interface FeedItem {
  id: string
  messageId: number
  channelId: string
  timestamp: number
  text: string
  unread: boolean
  saved: boolean
  outgoing?: boolean
  sourceType?: SourceType
  edited?: boolean
  noForwards?: boolean
  groupId?: string
  media?: MediaAsset | AlbumMedia
  reactions: Array<{ emoji: string; count: number; chosen?: boolean }>
  myReaction?: string
  views?: string
  comments?: number
  storySources?: number
  storyVelocity?: number
  storyClustered?: boolean
  storyKey?: string
  storyMembers?: StoryMember[]
  sponsored?: {
    label: 'Sponsored' | 'Recommended'
    title: string
    url: string
    buttonText: string
    randomId: string
    sponsorInfo?: string
    additionalInfo?: string
  }
}

export interface FeedDiagnostics {
  loaded?: number
  telegramTotal?: number
  mainTotal?: number
  archivedTotal?: number
  archivedLoaded?: number
  entityTypes?: Record<string, number>
}

export interface FeedPage {
  channels: Channel[]
  feed: FeedItem[]
  nextCursor: string | null
  hasMore: boolean
  syncToken: number
  diagnostics?: FeedDiagnostics
}

export type FeedUpdate =
  | { seq: number; type: 'upsert'; post: FeedItem; source?: Channel }
  | { seq: number; type: 'source'; source: Channel }
  | { seq: number; type: 'delete'; sourceId?: string | null; messageIds: number[] }

export interface TelegramCredentials {
  apiId: number
  apiHash: string
}

export type AuthPrompt =
  | { type: 'phone'; title: string; hint: string }
  | { type: 'code'; title: string; hint: string }
  | { type: 'password'; title: string; hint: string }
