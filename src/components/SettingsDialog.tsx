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
  useMediaQuery,
  useTheme
} from '@mui/material'
import type { ThemeMode, UserSettings } from '../types'

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
  account: { firstName: string; username?: string } | null
  favoriteCount: number
  hiddenSourceCount: number
  onClose: () => void
  onChange: (next: UserSettings) => void
  onResetPersonalization: () => void
  onLogout: () => void
}) {
  const theme = useTheme()
  const fullScreen = useMediaQuery(theme.breakpoints.down('sm'))
  const update = <K extends keyof UserSettings>(key: K, value: UserSettings[K]) => onChange({ ...settings, [key]: value })

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

        <Stack spacing={1}>
          <Typography variant="overline" color="text.secondary">Telegram</Typography>
          <Typography variant="body1" fontWeight={700}>{account?.username ? `@${account.username}` : account?.firstName || 'Connected account'}</Typography>
          <Typography variant="body2" color="text.secondary">{account?.firstName || 'Connected to Telegram'}</Typography>
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
