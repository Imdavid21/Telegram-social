import { useMemo, useState } from 'react'
import {
  Avatar,
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogTitle,
  IconButton,
  List,
  ListItem,
  ListItemAvatar,
  ListItemButton,
  ListItemText,
  Stack,
  Tab,
  Tabs,
  TextField,
  Tooltip,
  useMediaQuery,
  useTheme
} from '@mui/material'
import type { Channel, SourceType } from '../types'
import { BookmarkIcon, CloseIcon } from './Icons'

type SourceTab = 'all' | 'favorites' | 'channel' | 'group' | 'person'

function initials(channel: Channel) {
  return channel.initials || channel.title.split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]).join('').toUpperCase() || 'SG'
}

export function SourceBrowser({ open, channels, favorites, selectedSource, onClose, onSelect, onFavorite }: {
  open: boolean
  channels: Channel[]
  favorites: Set<string>
  selectedSource: string | null
  onClose: () => void
  onSelect: (id: string | null) => void
  onFavorite: (channel: Channel) => void
}) {
  const theme = useTheme()
  const fullScreen = useMediaQuery(theme.breakpoints.down('sm'))
  const [query, setQuery] = useState('')
  const [tab, setTab] = useState<SourceTab>('all')
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    return [...channels]
      .filter(channel => {
        if (tab === 'favorites' && !favorites.has(channel.id)) return false
        if (tab === 'channel' || tab === 'group' || tab === 'person') {
          if ((channel.type as SourceType | undefined) !== tab) return false
        }
        if (q && !`${channel.title} ${channel.username || ''}`.toLowerCase().includes(q)) return false
        return true
      })
      .sort((a, b) => Number(favorites.has(b.id)) - Number(favorites.has(a.id)) || Number(b.unread || 0) - Number(a.unread || 0) || a.title.localeCompare(b.title))
  }, [channels, favorites, query, tab])

  return <Dialog open={open} onClose={onClose} fullScreen={fullScreen} fullWidth maxWidth="sm" aria-labelledby="source-browser-title">
    <DialogTitle id="source-browser-title" sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
      Sources
      <IconButton onClick={onClose} aria-label="Close source browser"><CloseIcon /></IconButton>
    </DialogTitle>
    <DialogContent dividers sx={{ p: 0 }}>
      <Stack spacing={1.5} sx={{ px: 2, pt: 2 }}>
        <TextField value={query} onChange={event => setQuery(event.target.value)} placeholder="Search sources" fullWidth size="small" autoFocus />
        <Tabs value={tab} onChange={(_, value: SourceTab) => setTab(value)} variant="scrollable" scrollButtons="auto" aria-label="Source filters">
          <Tab value="all" label="All" />
          <Tab value="favorites" label="Favorites" />
          <Tab value="channel" label="Channels" />
          <Tab value="group" label="Groups" />
          <Tab value="person" label="People" />
        </Tabs>
      </Stack>
      <List disablePadding sx={{ mt: 1 }}>
        <ListItem disablePadding secondaryAction={null}>
          <ListItemButton selected={selectedSource === null} onClick={() => { onSelect(null); onClose() }}>
            <ListItemAvatar><Avatar sx={{ bgcolor: 'action.selected' }}>∞</Avatar></ListItemAvatar>
            <ListItemText primary="All sources" secondary={`${channels.length} Telegram sources`} />
          </ListItemButton>
        </ListItem>
        {visible.map(channel => <ListItem key={channel.id} disablePadding secondaryAction={
          <Tooltip title={favorites.has(channel.id) ? 'Remove favorite' : 'Favorite source'}>
            <IconButton edge="end" onClick={() => onFavorite(channel)} aria-label={favorites.has(channel.id) ? `Remove ${channel.title} from favorites` : `Favorite ${channel.title}`} color={favorites.has(channel.id) ? 'primary' : 'default'}><BookmarkIcon /></IconButton>
          </Tooltip>
        }>
          <ListItemButton selected={selectedSource === channel.id} onClick={() => { onSelect(channel.id); onClose() }} sx={{ pr: 7 }}>
            <ListItemAvatar><Badge color="primary" badgeContent={channel.unread || 0} max={99}><Avatar src={channel.avatar} sx={{ bgcolor: channel.accent || 'action.selected' }}>{initials(channel)}</Avatar></Badge></ListItemAvatar>
            <ListItemText primary={channel.title} secondary={channel.username ? `@${channel.username}` : channel.type === 'person' ? 'Private chat' : channel.type === 'group' ? 'Group' : 'Telegram channel'} />
          </ListItemButton>
        </ListItem>)}
      </List>
      {!visible.length && <Stack alignItems="center" spacing={1} sx={{ p: 5 }}><strong>No sources found</strong><Button onClick={() => { setQuery(''); setTab('all') }}>Clear filters</Button></Stack>}
    </DialogContent>
  </Dialog>
}
