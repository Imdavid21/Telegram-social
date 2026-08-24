import type { Channel, FeedItem } from '../types'

const now = Date.now()
const mins = (m: number) => now - m * 60_000

export const demoChannels: Channel[] = [
  { id: 'hyperliquid', title: 'Hyperliquid', username: 'hyperliquid', initials: 'HL', accent: '#9BE8C8', unread: 4, followers: '148K' },
  { id: 'notboring', title: 'Not Boring', username: 'notboringco', initials: 'NB', accent: '#F7CB73', unread: 2, followers: '42K' },
  { id: 'tech', title: 'Tech Signals', initials: 'TS', accent: '#77A8FF', unread: 7, followers: '91K' },
  { id: 'markets', title: 'Markets Daily', initials: 'MD', accent: '#E58FA8', unread: 0, followers: '118K' },
  { id: 'design', title: 'Design Details', initials: 'DD', accent: '#C8A7FF', unread: 3, followers: '36K' },
  { id: 'telegram', title: 'Telegram Tips', username: 'TelegramTips', initials: 'TG', accent: '#6FC7F3', unread: 1, followers: '9.1M' }
]

export const demoFeed: FeedItem[] = [
  {
    id: 'hyperliquid-914', messageId: 914, channelId: 'hyperliquid', timestamp: mins(3), unread: true, saved: false,
    text: 'Markets should feel like infrastructure, not a maze. New spot pairs are live, with improved routing across the app.',
    media: { kind: 'photo', gradient: 'linear-gradient(135deg,#10211d 0%,#18382f 45%,#9be8c8 140%)', label: 'MARKETS, WITHOUT THE MAZE' },
    reactions: [{ emoji: '⚡', count: 318 }, { emoji: '🔥', count: 204 }], views: '38.4K', comments: 74
  },
  {
    id: 'notboring-221', messageId: 221, channelId: 'notboring', timestamp: mins(11), unread: true, saved: true,
    text: 'The interesting part of AI infrastructure is no longer the model layer. It is the new software that turns messy real-world work into structured, compounding data.',
    reactions: [{ emoji: '💡', count: 91 }, { emoji: '👍', count: 48 }], views: '12.8K', comments: 19
  },
  {
    id: 'tech-707', messageId: 707, channelId: 'tech', timestamp: mins(24), unread: true, saved: false,
    text: 'A useful mental model for agentic products: the UI is becoming a receipt for work already done, instead of the place where every step is manually performed.',
    media: { kind: 'photo', gradient: 'linear-gradient(160deg,#151822 0%,#202f55 55%,#6f9fff 130%)', label: 'SOFTWARE AFTER THE CLICK' },
    reactions: [{ emoji: '👀', count: 144 }, { emoji: '👍', count: 52 }], views: '21.1K', comments: 31
  },
  {
    id: 'markets-411', messageId: 411, channelId: 'markets', timestamp: mins(43), unread: false, saved: false,
    text: 'Morning setup: volatility is compressed, positioning is crowded, and the next move will probably be more about flows than headlines. Watch liquidity first.',
    reactions: [{ emoji: '📈', count: 72 }], views: '9.7K', comments: 11
  },
  {
    id: 'design-562', messageId: 562, channelId: 'design', timestamp: mins(69), unread: true, saved: false,
    text: 'Good product density is not about putting less on screen. It is about making every visible object earn its place and making hierarchy obvious in under a second.',
    media: { kind: 'photo', gradient: 'linear-gradient(135deg,#241c2d 0%,#493563 65%,#c8a7ff 135%)', label: 'DENSITY ≠ CLUTTER' },
    reactions: [{ emoji: '❤️', count: 233 }, { emoji: '✍️', count: 40 }], views: '17.5K', comments: 26
  },
  {
    id: 'telegram-125', messageId: 125, channelId: 'telegram', timestamp: mins(105), unread: false, saved: true,
    text: 'Tip: Saved Messages can act as your personal cloud notebook. Forward anything you want to revisit later and search it from any device.',
    reactions: [{ emoji: '👍', count: 1100 }], views: '804K', comments: 0
  }
]
