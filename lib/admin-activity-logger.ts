import { createServiceClient } from "@/lib/supabase/service"

export type AdminEventType =
  | "user_registered"
  | "user_linked"
  | "name_changed"
  | "privacy_changed"
  | "photo_verified"
  | "photo_rejected"

interface LogAdminActivityParams {
  eventType: AdminEventType
  userId?: string
  personId?: string
  metadata?: Record<string, any>
}

/**
 * Log admin-relevant activity to admin_activity table.
 * Fire-and-forget: errors are logged but don't affect the main operation.
 */
export async function logAdminActivity({
  eventType,
  userId,
  personId,
  metadata,
}: LogAdminActivityParams): Promise<void> {
  try {
    const supabase = createServiceClient()

    await supabase.from("admin_activity").insert({
      event_type: eventType,
      user_id: userId || null,
      person_id: personId || null,
      metadata: metadata || null,
    })
  } catch (error) {
    // Don't fail the main operation if activity logging fails
    console.error("[admin-activity-logger] Error logging activity:", error)
  }
}

/**
 * Human-readable labels for privacy settings
 */
export const PRIVACY_SETTING_LABELS: Record<string, string> = {
  show_in_players_gallery: "Показ в списке игроков",
  create_personal_gallery: "Персональная галерея",
  show_name_on_photos: "Имя на фото",
  show_telegram_username: "Telegram username",
  show_social_links: "Социальные ссылки",
}

/**
 * List of privacy-related settings to track
 */
export const PRIVACY_SETTINGS = [
  "show_in_players_gallery",
  "create_personal_gallery",
  "show_name_on_photos",
  "show_telegram_username",
  "show_social_links",
] as const
