import { Mail, MessageCircle, Facebook, Instagram } from "lucide-react"
import { createElement } from "react"

export const FIELD_LABELS: Record<string, string> = {
  gmail: "Gmail",
  telegram_nickname: "Telegram ник",
  telegram_profile_url: "Telegram профиль",
  facebook_profile_url: "Facebook профиль",
  instagram_profile_url: "Instagram профиль",
}

export const FIELD_ICONS: Record<string, React.ReactNode> = {
  gmail: createElement(Mail, { className: "h-3 w-3" }),
  telegram_nickname: createElement(MessageCircle, { className: "h-3 w-3" }),
  telegram_profile_url: createElement(MessageCircle, { className: "h-3 w-3" }),
  facebook_profile_url: createElement(Facebook, { className: "h-3 w-3" }),
  instagram_profile_url: createElement(Instagram, { className: "h-3 w-3" }),
}
