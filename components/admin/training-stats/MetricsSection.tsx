import { Users, Camera, Images, UserCheck } from "lucide-react"
import { StatValue } from "./StatValue"
import type { Statistics } from "./types"

interface MetricsSectionProps {
  stats: Statistics
}

export function MetricsSection({ stats }: MetricsSectionProps) {
  return (
    <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
      {/* Игроки */}
      <div className="rounded-lg border p-4">
        <div className="flex items-center gap-2 mb-3">
          <Users className="h-5 w-5 text-muted-foreground" />
          <h4 className="font-medium">Игроки</h4>
        </div>
        <div className="grid grid-cols-3 gap-2">
          <StatValue label="Всего" value={stats.players.total} />
          <StatValue label="С фото" value={stats.players.with_verified} color="text-green-600" />
          <StatValue label="Без фото" value={stats.players.without_verified} color="text-muted-foreground" />
        </div>
      </div>

      {/* Лица */}
      <div className="rounded-lg border p-4">
        <div className="flex items-center gap-2 mb-3">
          <Camera className="h-5 w-5 text-muted-foreground" />
          <h4 className="font-medium">Лица на фото</h4>
        </div>
        <div className="grid grid-cols-3 gap-2">
          <StatValue label="Всего" value={stats.faces.total.toLocaleString()} />
          <StatValue label="Verified" value={stats.faces.verified.toLocaleString()} color="text-green-600" />
          <StatValue label="Unverified" value={stats.faces.unverified.toLocaleString()} color="text-muted-foreground" />
        </div>
      </div>

      {/* Изображения */}
      <div className="rounded-lg border p-4">
        <div className="flex items-center gap-2 mb-3">
          <Images className="h-5 w-5 text-muted-foreground" />
          <h4 className="font-medium">Изображения</h4>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <StatValue label="Всего" value={stats.images.total.toLocaleString()} />
          <StatValue label="Распознан" value={stats.images.recognized.toLocaleString()} color="text-green-600" />
        </div>
      </div>

      {/* Распределение людей на фото */}
      <div className="rounded-lg border p-4">
        <div className="flex items-center gap-2 mb-3">
          <UserCheck className="h-5 w-5 text-muted-foreground" />
          <h4 className="font-medium text-sm">Распределение людей на фото</h4>
        </div>
        <div className="grid grid-cols-3 gap-2">
          <StatValue label="1 чел" value={stats.images.with_1_person} />
          <StatValue label="2-3 чел" value={stats.images.with_2_3_persons} />
          <StatValue label="4+ чел" value={stats.images.with_4_plus_persons} />
        </div>
      </div>
    </div>
  )
}
