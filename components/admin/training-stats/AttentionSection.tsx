import { AlertTriangle } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import type { Statistics } from "./types"

interface AttentionSectionProps {
  stats: Statistics
}

export function AttentionSection({ stats }: AttentionSectionProps) {
  const hasAttentionItems =
    stats.attention.few_photos_count > 0 ||
    stats.attention.no_avatar_count > 0 ||
    stats.attention.unknown_faces > 0 ||
    stats.players.without_verified > 0

  if (!hasAttentionItems) return null

  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-950/20 p-4 space-y-4">
      <div className="flex items-center gap-2">
        <AlertTriangle className="h-5 w-5 text-amber-600" />
        <h4 className="font-medium text-amber-800 dark:text-amber-200">Требуют внимания</h4>
      </div>

      {/* 1. Без подтверждённых фото */}
      {stats.players.without_verified > 0 && (
        <div>
          <div className="text-sm text-amber-700 dark:text-amber-300 mb-1">
            Без подтверждённых фото ({stats.players.without_verified}):
          </div>
          <div className="flex flex-wrap gap-1">
            {stats.players.without_verified_list?.slice(0, 20).map((p) => (
              <span
                key={p.id}
                className="inline-block px-2 py-0.5 rounded text-xs bg-amber-100 dark:bg-amber-900/50 text-amber-800 dark:text-amber-200"
              >
                {p.name}
              </span>
            ))}
            {stats.players.without_verified > 20 && (
              <Badge variant="outline" className="text-amber-700">
                +{stats.players.without_verified - 20} ещё
              </Badge>
            )}
          </div>
        </div>
      )}

      {/* 2. С 1-2 фото */}
      {stats.attention.few_photos_count > 0 && (
        <div>
          <div className="text-sm text-amber-700 dark:text-amber-300 mb-1">
            С 1-2 фото ({stats.attention.few_photos_count}):
          </div>
          <div className="flex flex-wrap gap-1">
            {stats.attention.few_photos_list?.map((p) => (
              <span
                key={p.id}
                className="inline-block px-2 py-0.5 rounded text-xs bg-amber-100 dark:bg-amber-900/50 text-amber-800 dark:text-amber-200"
              >
                {p.name} ({p.count})
              </span>
            ))}
          </div>
        </div>
      )}

      {/* 3. Без аватара */}
      {stats.attention.no_avatar_count > 0 && (
        <div>
          <div className="text-sm text-amber-700 dark:text-amber-300 mb-1">
            Без аватара ({stats.attention.no_avatar_count}):
          </div>
          <div className="flex flex-wrap gap-1">
            {stats.attention.no_avatar_list?.map((p) => (
              <span
                key={p.id}
                className="inline-block px-2 py-0.5 rounded text-xs bg-amber-100 dark:bg-amber-900/50 text-amber-800 dark:text-amber-200"
              >
                {p.name}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* 4. Неизвестные лица */}
      {stats.attention.unknown_faces > 0 && (
        <div className="flex items-center gap-2 text-sm text-amber-700 dark:text-amber-300">
          <span>❓ Неизвестные лица:</span>
          <strong>{stats.attention.unknown_faces}</strong>
        </div>
      )}
    </div>
  )
}
