"use client"

import { useEffect, useState } from "react"
import { adminFetch } from "@/lib/admin-auth"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Loader2, UserPlus, Link2, Pencil, Eye, ChevronLeft, ChevronRight } from "lucide-react"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

interface AdminActivity {
  id: string
  event_type: string
  event_label: string
  created_at: string
  person_id: string | null
  user_id: string | null
  person_name: string
  telegram_username: string | null
  user_avatar: string | null
  metadata: Record<string, any>
}

const EVENT_ICONS: Record<string, React.ReactNode> = {
  user_registered: <UserPlus className="h-4 w-4" />,
  user_linked: <Link2 className="h-4 w-4" />,
  name_changed: <Pencil className="h-4 w-4" />,
  privacy_changed: <Eye className="h-4 w-4" />,
}

const EVENT_COLORS: Record<string, string> = {
  user_registered: "bg-green-500",
  user_linked: "bg-blue-500",
  name_changed: "bg-yellow-500",
  privacy_changed: "bg-purple-500",
}

function formatDate(dateString: string): string {
  const date = new Date(dateString)
  return date.toLocaleString("ru-RU", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

function formatRelativeDate(dateString: string): string {
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

  return formatDate(dateString)
}

function getEventDescription(activity: AdminActivity): string {
  const meta = activity.metadata || {}

  switch (activity.event_type) {
    case "user_registered":
      return `Зарегистрировался через Telegram${meta.telegram_username ? ` (${meta.telegram_username})` : ""}`

    case "user_linked": {
      let desc = `Telegram ${meta.telegram_username || ""} привязан к аккаунту`
      if (meta.old_telegram_full_name && meta.telegram_full_name) {
        desc += `. Имя в Telegram: "${meta.old_telegram_full_name}" → "${meta.telegram_full_name}"`
      }
      return desc
    }

    case "name_changed":
      if (meta.old_value && meta.new_value) {
        return `Изменил имя: "${meta.old_value}" → "${meta.new_value}"`
      }
      return "Изменил имя"

    case "privacy_changed":
      const label = meta.setting_label || meta.setting_name
      const oldVal = meta.old_value ? "вкл" : "выкл"
      const newVal = meta.new_value ? "вкл" : "выкл"
      return `${label}: ${oldVal} → ${newVal}`

    default:
      return activity.event_label
  }
}

export default function AdminActivityPage() {
  const [activities, setActivities] = useState<AdminActivity[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [total, setTotal] = useState(0)
  const [offset, setOffset] = useState(0)
  const [eventFilter, setEventFilter] = useState<string>("all")
  const limit = 50

  const loadActivities = async () => {
    try {
      setLoading(true)
      const params = new URLSearchParams({
        limit: String(limit),
        offset: String(offset),
      })
      if (eventFilter !== "all") {
        params.set("event_types", eventFilter)
      }

      const response = await adminFetch(`/api/admin/activity?${params}`)
      if (!response.ok) {
        throw new Error("Failed to load activities")
      }
      const data = await response.json()
      setActivities(data.data.activities)
      setTotal(data.data.total)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error loading activities")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadActivities()
  }, [offset, eventFilter])

  const handleFilterChange = (value: string) => {
    setEventFilter(value)
    setOffset(0)
  }

  const totalPages = Math.ceil(total / limit)
  const currentPage = Math.floor(offset / limit) + 1

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Активность пользователей</h1>
          <p className="text-muted-foreground">
            Регистрации, привязки аккаунтов, изменения настроек
          </p>
        </div>
      </div>

      {error && (
        <div className="rounded-md bg-destructive/10 p-4 text-destructive">
          {error}
          <Button variant="ghost" size="sm" className="ml-4" onClick={() => setError(null)}>
            Закрыть
          </Button>
        </div>
      )}

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Лента событий</CardTitle>
              <CardDescription>
                {total} событий
              </CardDescription>
            </div>
            <Select value={eventFilter} onValueChange={handleFilterChange}>
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="Фильтр по типу" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Все события</SelectItem>
                <SelectItem value="user_registered">Регистрации</SelectItem>
                <SelectItem value="user_linked">Привязки</SelectItem>
                <SelectItem value="name_changed">Изменения имени</SelectItem>
                <SelectItem value="privacy_changed">Изменения приватности</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center p-8">
              <Loader2 className="h-8 w-8 animate-spin" />
            </div>
          ) : activities.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              Нет событий
            </div>
          ) : (
            <div className="space-y-4">
              {activities.map((activity) => (
                <div
                  key={activity.id}
                  className="flex items-start gap-4 p-4 rounded-lg border bg-card hover:bg-accent/50 transition-colors"
                >
                  <Avatar className="h-10 w-10">
                    <AvatarImage src={activity.user_avatar || undefined} />
                    <AvatarFallback>
                      {activity.person_name.charAt(0).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-medium">{activity.person_name}</span>
                      {activity.telegram_username && (
                        <span className="text-sm text-muted-foreground">
                          {activity.telegram_username}
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {getEventDescription(activity)}
                    </p>
                  </div>

                  <div className="flex items-center gap-3 flex-shrink-0">
                    <Badge className={EVENT_COLORS[activity.event_type]}>
                      {EVENT_ICONS[activity.event_type]}
                      <span className="ml-1">{activity.event_label}</span>
                    </Badge>
                    <span className="text-xs text-muted-foreground whitespace-nowrap">
                      {formatRelativeDate(activity.created_at)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-6 pt-4 border-t">
              <div className="text-sm text-muted-foreground">
                Страница {currentPage} из {totalPages}
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={offset === 0}
                  onClick={() => setOffset(Math.max(0, offset - limit))}
                >
                  <ChevronLeft className="h-4 w-4" />
                  Назад
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={offset + limit >= total}
                  onClick={() => setOffset(offset + limit)}
                >
                  Вперед
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
