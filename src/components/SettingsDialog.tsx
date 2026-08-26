import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControl,
  FormControlLabel,
  FormLabel,
  Radio,
  RadioGroup,
  Stack,
  Switch,
  Typography,
  Avatar,
  Chip,
  useMediaQuery,
  useTheme
} from '@mui/material'
import type { TelegramAccount, ThemeMode, UserSettings } from '../types'

export function SettingsDialog({
  open,
  settings,
  account,
  favoriteCount,
  hiddenSourceCount,
  onClose,
  onChange,
  onResetPersonalization,
  onLogout
}: {
  open: boolean
  settings: UserSettings
  account: TelegramAccount | null
  favoriteCount: number
  hiddenSourceCount: number
  onClose: () => void
  onChange: (next: UserSettings) => void
  onResetPersonalization: () => void
  onLogout: () => void
}) {
  const theme = useTheme()
  const fullScreen = useMediaQuery(theme.breakpoints.down('sm'))
  const update = <K extends keyof UserSettings,>(key: K, value: UserSettings[K]) => onChange({ ...settings, [key]: value })

  return <Dialog open={open} onClose={onClose} fullScreen={fullScreen} fullWidth maxWidth="sm" aria-labelledby="supergram-settings-title">
    <DialogTitle id="supergram-settings-title">Settings</DialogTitle>
    <DialogContent dividers>
      <Stack spacing={3}>
        <Stack spacing={1.5}>
          <Typography variant="overline" color="text.secondary">Feed</Typography>
          <FormControl>
            <FormLabel>Default feed</FormLabel>
            <RadioGroup row value={settings.feedMode} onChange={event => update('feedMode', event.target.value === 'latest' ? 'latest' : 'for-you')}>
              <FormControlLabel value="for-you" control={<Radio />} label="For You" />
              <FormControlLabel value="latest" control={<Radio />} label="Latest" />
            </RadioGroup>
          </FormControl>
          <FormControlLabel control={<Switch checked={settings.includePrivateChatsInForYou} onChange={event => update('includePrivateChatsInForYou', event.target.checked)} />} label="Include private chats in For You" />
          <FormControlLabel control={<Switch checked={settings.summarizePrivateChats} onChange={event => update('summarizePrivateChats', event.target.checked)} />} label="Summarize private chats" />
          <FormControlLabel control={<Switch checked={settings.autoplay === 'on'} onChange={event => update('autoplay', event.target.checked ? 'on' : 'off')} />} label="Autoplay videos" />
          <Typography variant="body2" color="text.secondary">{favoriteCount} favorite {favoriteCount === 1 ? 'source' : 'sources'} · {hiddenSourceCount} hidden from For You</Typography>
          <Button variant="outlined" color="inherit" onClick={onResetPersonalization} sx={{ alignSelf: 'flex-start' }}>Reset For You</Button>
          <Typography variant="caption" color="text.secondary">Resets reading and relevance signals. It does not remove saved posts, read state, or favorite sources.</Typography>
        </Stack>

        <Divider />

        <Stack spacing={1.5}>
          <Typography variant="overline" color="text.secondary">Appearance</Typography>
          <FormControl>
            <FormLabel>Theme</FormLabel>
            <RadioGroup row value={settings.themeMode} onChange={event => update('themeMode', event.target.value as ThemeMode)}>
              <FormControlLabel value="system" control={<Radio />} label="System" />
              <FormControlLabel value="light" control={<Radio />} label="Light" />
              <FormControlLabel value="dark" control={<Radio />} label="Dark" />
            </RadioGroup>
          </FormControl>
        </Stack>

        <Divider />

        <Stack spacing={1.5}>
          <Typography variant="overline" color="text.secondary">Telegram account</Typography>
          <Stack direction="row" spacing={1.5} alignItems="center">
            <Avatar src={account?.avatar} alt="" sx={{ width: 52, height: 52 }}>{account?.firstName?.[0] || 'T'}</Avatar>
            <Stack spacing={.25} minWidth={0}>
              <Stack direction="row" spacing={.75} alignItems="center" flexWrap="wrap">
                <Typography variant="body1" fontWeight={750}>{[account?.firstName, account?.lastName].filter(Boolean).join(' ') || 'Connected account'}</Typography>
                {account?.premium && <Chip label="Premium" size="small" variant="outlined" />}
                {account?.verified && <Chip label="Verified" size="small" variant="outlined" />}
              </Stack>
              {account?.username && <Typography variant="body2" color="text.secondary">@{account.username}</Typography>}
              {account?.bio && <Typography variant="body2" color="text.secondary" sx={{ mt: .5 }}>{account.bio}</Typography>}
            </Stack>
          </Stack>
          <Typography variant="caption" color="text.secondary">Telegram settings exposed to this client are shown read-only. Supergram does not change them unless a feature explicitly says it will.</Typography>
          <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
            {account?.settings?.archiveAndMuteNewNoncontactPeers !== undefined && <Chip size="small" label={`Auto-archive strangers: ${account.settings.archiveAndMuteNewNoncontactPeers ? 'On' : 'Off'}`} />}
            {account?.settings?.keepArchivedUnmuted !== undefined && <Chip size="small" label={`Keep unmuted archived: ${account.settings.keepArchivedUnmuted ? 'On' : 'Off'}`} />}
            {account?.settings?.hideReadMarks !== undefined && <Chip size="small" label={`Hide read marks: ${account.settings.hideReadMarks ? 'On' : 'Off'}`} />}
            {account?.translationDisabled !== undefined && <Chip size="small" label={`Translation: ${account.translationDisabled ? 'Off' : 'On'}`} />}
          </Stack>
          <Typography variant="overline" color="text.secondary" sx={{ mt: .5 }}>Available in Supergram</Typography>
          <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
            {Object.entries(account?.capabilities || {}).filter(([, enabled]) => enabled).map(([key]) => <Chip key={key} size="small" variant="outlined" label={key.replace(/([A-Z])/g, ' $1').replace(/^./, c => c.toUpperCase())} />)}
          </Stack>
          <Button variant="outlined" color="inherit" onClick={onLogout} sx={{ alignSelf: 'flex-start' }}>Switch Telegram account</Button>
        </Stack>

        <Divider />

        <Stack spacing={.5}>
          <Typography variant="overline" color="text.secondary">About</Typography>
          <Typography variant="body2" color="text.secondary">Supergram is an independent client using the Telegram API. It is not affiliated with Telegram.</Typography>
          <Stack direction="row" spacing={2}>
            <Button component="a" href="/privacy.html" size="small" color="inherit">Privacy</Button>
            <Button component="a" href="/terms.html" size="small" color="inherit">Terms</Button>
          </Stack>
        </Stack>
      </Stack>
    </DialogContent>
    <DialogActions><Button onClick={onClose}>Done</Button></DialogActions>
  </Dialog>
}
