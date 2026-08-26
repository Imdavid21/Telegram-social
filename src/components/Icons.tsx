import type { SvgIconProps } from '@mui/material/SvgIcon'
import HomeOutlined from '@mui/icons-material/HomeOutlined'
import SearchOutlined from '@mui/icons-material/SearchOutlined'
import BookmarkBorderOutlined from '@mui/icons-material/BookmarkBorderOutlined'
import ImageOutlined from '@mui/icons-material/ImageOutlined'
import ExploreOutlined from '@mui/icons-material/ExploreOutlined'
import SettingsOutlined from '@mui/icons-material/SettingsOutlined'
import MoreHorizOutlined from '@mui/icons-material/MoreHorizOutlined'
import SendOutlined from '@mui/icons-material/SendOutlined'
import FavoriteBorderOutlined from '@mui/icons-material/FavoriteBorderOutlined'
import VisibilityOutlined from '@mui/icons-material/VisibilityOutlined'
import ChatBubbleOutlineOutlined from '@mui/icons-material/ChatBubbleOutlineOutlined'
import NotificationsNoneOutlined from '@mui/icons-material/NotificationsNoneOutlined'
import CheckOutlined from '@mui/icons-material/CheckOutlined'
import CloseOutlined from '@mui/icons-material/CloseOutlined'
import RefreshOutlined from '@mui/icons-material/RefreshOutlined'
import LogoutOutlined from '@mui/icons-material/LogoutOutlined'
import DarkModeOutlined from '@mui/icons-material/DarkModeOutlined'
import LightModeOutlined from '@mui/icons-material/LightModeOutlined'
import LockOutlined from '@mui/icons-material/LockOutlined'
import KeyboardArrowUpOutlined from '@mui/icons-material/KeyboardArrowUpOutlined'
import MenuOutlined from '@mui/icons-material/MenuOutlined'

type P = SvgIconProps
const minimal = { fontSize: 'inherit' as const, strokeWidth: 1.25 }
const icon = (Icon: typeof HomeOutlined) => (p: P) => <Icon {...minimal} {...p} />

export const HomeIcon = icon(HomeOutlined)
export const SearchIcon = icon(SearchOutlined)
export const BookmarkIcon = icon(BookmarkBorderOutlined)
export const ImageIcon = icon(ImageOutlined)
export const CompassIcon = icon(ExploreOutlined)
export const SettingsIcon = icon(SettingsOutlined)
export const MoreIcon = icon(MoreHorizOutlined)
export const SendIcon = icon(SendOutlined)
export const HeartIcon = icon(FavoriteBorderOutlined)
export const EyeIcon = icon(VisibilityOutlined)
export const MessageIcon = icon(ChatBubbleOutlineOutlined)
export const BellIcon = icon(NotificationsNoneOutlined)
export const CheckIcon = icon(CheckOutlined)
export const CloseIcon = icon(CloseOutlined)
export const RefreshIcon = icon(RefreshOutlined)
export const LogOutIcon = icon(LogoutOutlined)
export const MoonIcon = icon(DarkModeOutlined)
export const SunIcon = icon(LightModeOutlined)
export const LockIcon = icon(LockOutlined)
export const ChevronUpIcon = icon(KeyboardArrowUpOutlined)
export const MenuIcon = icon(MenuOutlined)
