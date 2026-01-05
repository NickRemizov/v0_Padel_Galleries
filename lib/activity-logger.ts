import { createServiceClient } from "@/lib/supabase/service"

export type ActivityType =
  | "photo_hidden"
  | "photo_unhidden"
  | "photo_verified"
  | "photo_rejected"

interface LogActivityParams {
  personId: string
  activityType: ActivityType
  imageId?: string
  galleryId?: string
  metadata?: Record<string, any>
}

/**
 * Log user activity to user_activity table.
 * Fire-and-forget: errors are logged but don't affect the main operation.
 */
export async function logActivity({
  personId,
  activityType,
  imageId,
  galleryId,
  metadata,
}: LogActivityParams): Promise<void> {
  try {
    const supabase = createServiceClient()

    await supabase.from("user_activity").insert({
      person_id: personId,
      activity_type: activityType,
      image_id: imageId || null,
      gallery_id: galleryId || null,
      metadata: metadata || null,
    })
  } catch (error) {
    // Don't fail the main operation if activity logging fails
    console.error("[activity-logger] Error logging activity:", error)
  }
}
