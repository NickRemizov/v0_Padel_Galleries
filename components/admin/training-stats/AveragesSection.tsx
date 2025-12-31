import { BarChart3 } from "lucide-react"
import type { Statistics } from "./types"

interface AveragesSectionProps {
  stats: Statistics
}

export function AveragesSection({ stats }: AveragesSectionProps) {
  return (
    <div className="rounded-lg border p-4">
      <div className="flex items-center gap-2 mb-3">
        <BarChart3 className="h-5 w-5 text-muted-foreground" />
        <h4 className="font-medium">Средние показатели</h4>
      </div>
      <div className="grid gap-6 grid-cols-1 md:grid-cols-2">
        {/* Фото/игрок */}
        <div className="space-y-2">
          <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Фото на игрока</div>
          <div className="grid grid-cols-3 gap-4">
            <div className="text-center p-3 bg-muted/50 rounded-lg">
              <div className="text-2xl font-bold text-blue-600">{stats.player_stats.avg_photos}</div>
              <div className="text-xs text-muted-foreground">среднее</div>
            </div>
            <div className="text-center p-3 bg-muted/50 rounded-lg">
              <div className="text-2xl font-bold">{stats.player_stats.min_photos}</div>
              <div className="text-xs text-muted-foreground">минимум</div>
            </div>
            <div className="text-center p-3 bg-muted/50 rounded-lg">
              <div className="text-2xl font-bold">{stats.player_stats.max_photos}</div>
              <div className="text-xs text-muted-foreground">максимум</div>
            </div>
          </div>
        </div>

        {/* Фото/галерея */}
        <div className="space-y-2">
          <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Фото в галерее</div>
          <div className="grid grid-cols-3 gap-4">
            <div className="text-center p-3 bg-muted/50 rounded-lg">
              <div className="text-2xl font-bold text-blue-600">{stats.gallery_stats.avg_photos}</div>
              <div className="text-xs text-muted-foreground">среднее</div>
            </div>
            <div className="text-center p-3 bg-muted/50 rounded-lg">
              <div className="text-2xl font-bold">{stats.gallery_stats.min_photos}</div>
              <div className="text-xs text-muted-foreground">минимум</div>
            </div>
            <div className="text-center p-3 bg-muted/50 rounded-lg">
              <div className="text-2xl font-bold">{stats.gallery_stats.max_photos}</div>
              <div className="text-xs text-muted-foreground">максимум</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
