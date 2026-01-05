"use client"

import Link from "next/link"
import { Camera, MessageCircle, Eye, EyeOff, Check, X, Heart } from "lucide-react"

interface Activity {
  type: string
  created_at: string
  image_id?: string
  gallery_id?: string
  metadata?: Record<string, any>
}

interface ActivityFeedProps {
  activities: Activity[]
}

function formatDate(dateString: string): string {
  const date = new Date(dateString)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMs / 3600000)
  const diffDays = Math.floor(diffMs / 86400000)

  if (diffMins < 1) return "только что"
  if (diffMins < 60) return `${diffMins} мин назад`
  if (diffHours < 24) return `${diffHours} ч назад`
  if (diffDays < 7) return `${diffDays} д назад`

  return date.toLocaleDateString("ru-RU", {
    day: "numeric",
    month: "short",
    year: date.getFullYear() !== now.getFullYear() ? "numeric" : undefined,
  })
}

function getActivityIcon(type: string) {
  switch (type) {
    case "new_photos":
      return <Camera className="h-5 w-5 text-blue-500" />
    case "comment_received":
      return <MessageCircle className="h-5 w-5 text-green-500" />
    case "photo_hidden":
      return <EyeOff className="h-5 w-5 text-orange-500" />
    case "photo_unhidden":
      return <Eye className="h-5 w-5 text-teal-500" />
    case "photo_verified":
      return <Check className="h-5 w-5 text-emerald-500" />
    case "photo_rejected":
      return <X className="h-5 w-5 text-red-500" />
    case "favorite_added":
      return <Heart className="h-5 w-5 text-pink-500" />
    default:
      return <Camera className="h-5 w-5 text-muted-foreground" />
  }
}

function getActivityText(activity: Activity): { title: string; description: string } {
  const meta = activity.metadata || {}

  switch (activity.type) {
    case "new_photos":
      return {
        title: `Новые фото с вами`,
        description: meta.gallery_title
          ? `${meta.count || 1} фото в галерее "${meta.gallery_title}"`
          : `${meta.count || 1} новых фото`,
      }
    case "comment_received":
      return {
        title: `Новый комментарий`,
        description: meta.commenter_name
          ? `${meta.commenter_name}: "${meta.comment_preview?.substring(0, 50)}${(meta.comment_preview?.length || 0) > 50 ? "..." : ""}"`
          : meta.comment_preview || "К фото с вами",
      }
    case "photo_hidden":
      return {
        title: `Фото скрыто`,
        description: meta.gallery_title
          ? `${meta.filename || "Фото"} в "${meta.gallery_title}"`
          : meta.filename || "Вы скрыли фото",
      }
    case "photo_unhidden":
      return {
        title: `Фото показано`,
        description: meta.gallery_title
          ? `${meta.filename || "Фото"} в "${meta.gallery_title}"`
          : meta.filename || "Вы показали фото",
      }
    case "photo_verified":
      return {
        title: `Фото подтверждено`,
        description: meta.gallery_title
          ? `${meta.filename || "Фото"} в "${meta.gallery_title}"`
          : meta.filename || "Вы подтвердили, что это вы",
      }
    case "photo_rejected":
      return {
        title: `Фото отклонено`,
        description: meta.gallery_title
          ? `${meta.filename || "Фото"} в "${meta.gallery_title}"`
          : meta.filename || "Вы отклонили распознавание",
      }
    case "favorite_added":
      return {
        title: `Добавлено в избранное`,
        description: meta.gallery_title
          ? `Фото из "${meta.gallery_title}"`
          : "Фото добавлено в избранное",
      }
    default:
      return {
        title: activity.type,
        description: "",
      }
  }
}

function getActivityLink(activity: Activity): string | null {
  const meta = activity.metadata || {}

  switch (activity.type) {
    case "new_photos":
      if (meta.gallery_slug) {
        return `/gallery/${meta.gallery_slug}`
      }
      return null
    case "comment_received":
    case "favorite_added":
      if (meta.gallery_slug && meta.image_slug) {
        return `/gallery/${meta.gallery_slug}?photo=${meta.image_slug}`
      }
      return null
    case "photo_hidden":
    case "photo_unhidden":
    case "photo_verified":
    case "photo_rejected":
      return "/my-photos"
    default:
      return null
  }
}

// Group activities by date
function groupByDate(activities: Activity[]): Map<string, Activity[]> {
  const groups = new Map<string, Activity[]>()

  for (const activity of activities) {
    const date = new Date(activity.created_at)
    const today = new Date()
    const yesterday = new Date(today)
    yesterday.setDate(yesterday.getDate() - 1)

    let dateKey: string
    if (date.toDateString() === today.toDateString()) {
      dateKey = "Сегодня"
    } else if (date.toDateString() === yesterday.toDateString()) {
      dateKey = "Вчера"
    } else {
      dateKey = date.toLocaleDateString("ru-RU", {
        day: "numeric",
        month: "long",
        year: date.getFullYear() !== today.getFullYear() ? "numeric" : undefined,
      })
    }

    if (!groups.has(dateKey)) {
      groups.set(dateKey, [])
    }
    groups.get(dateKey)!.push(activity)
  }

  return groups
}

export function ActivityFeed({ activities }: ActivityFeedProps) {
  const groupedActivities = groupByDate(activities)

  return (
    <div className="space-y-8">
      {Array.from(groupedActivities.entries()).map(([date, dayActivities]) => (
        <div key={date}>
          <h3 className="text-sm font-semibold text-muted-foreground mb-4">{date}</h3>
          <div className="space-y-3">
            {dayActivities.map((activity, index) => {
              const { title, description } = getActivityText(activity)
              const link = getActivityLink(activity)

              const content = (
                <div className="flex items-start gap-4 p-4 rounded-lg border bg-card hover:bg-accent/50 transition-colors">
                  <div className="flex-shrink-0 mt-0.5">
                    {getActivityIcon(activity.type)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium">{title}</p>
                    {description && (
                      <p className="text-sm text-muted-foreground truncate">{description}</p>
                    )}
                  </div>
                  <div className="flex-shrink-0 text-xs text-muted-foreground">
                    {formatDate(activity.created_at)}
                  </div>
                </div>
              )

              if (link) {
                return (
                  <Link key={`${activity.type}-${activity.created_at}-${index}`} href={link}>
                    {content}
                  </Link>
                )
              }

              return (
                <div key={`${activity.type}-${activity.created_at}-${index}`}>
                  {content}
                </div>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}
