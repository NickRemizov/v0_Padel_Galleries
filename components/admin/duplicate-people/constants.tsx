import { Mail, MessageCircle, Facebook, Instagram } from "lucide-react"

export const FIELD_LABELS: Record<string, string> = {
  gmail: "Gmail",
  telegram_username: "Username в Telegram",
  telegram_profile_url: "Telegram профиль",
  facebook_profile_url: "Facebook профиль",
  instagram_profile_url: "Instagram профиль",
}

export const FIELD_ICONS: Record<string, React.ReactNode> = {
  gmail: <Mail className="h-3 w-3" />,
  telegram_username: <MessageCircle className="h-3 w-3" />,
  telegram_profile_url: <MessageCircle className="h-3 w-3" />,
  facebook_profile_url: <Facebook className="h-3 w-3" />,
  instagram_profile_url: <Instagram className="h-3 w-3" />,
}
