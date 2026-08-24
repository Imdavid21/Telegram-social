export type FeedFilter = 'all' | 'unread' | 'saved' | 'media'

export type SourceType = 'person' | 'group' | 'channel' | 'conversation'

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
  media?: {
    kind: 'photo' | 'video' | 'gif' | 'audio' | 'document'
    src?: string
    gradient?: string
    label?: string
    mimeType?: string
    fileName?: string
    size?: number
  }
  reactions: Array<{ emoji: string; count: number }>
  views?: string
  comments?: number
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

export interface TelegramCredentials {
  apiId: number
  apiHash: string
}

export type AuthPrompt =
  | { type: 'phone'; title: string; hint: string }
  | { type: 'code'; title: string; hint: string }
  | { type: 'password'; title: string; hint: string }
