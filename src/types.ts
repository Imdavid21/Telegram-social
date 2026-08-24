export type FeedFilter = 'all' | 'unread' | 'saved' | 'media'

export interface Channel {
  id: string
  title: string
  username?: string
  initials: string
  accent: string
  unread: number
  followers?: string
  muted?: boolean
}

export interface FeedItem {
  id: string
  messageId: number
  channelId: string
  timestamp: number
  text: string
  unread: boolean
  saved: boolean
  media?: {
    kind: 'photo' | 'video'
    src?: string
    gradient?: string
    label?: string
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
