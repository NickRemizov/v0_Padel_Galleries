import { BarChart3, TrendingUp } from "lucide-react"
import { Progress } from "@/components/ui/progress"
import type { Statistics } from "./types"

interface ChartsSectionProps {
  stats: Statistics
}

export function ChartsSection({ stats }: ChartsSectionProps) {
  return (
    <div className="grid gap-4 grid-cols-1 md:grid-cols-2">
      {/* Гистограмма */}
      <div className="rounded-lg border p-4">
        <div className="flex items-center gap-2 mb-3">
          <BarChart3 className="h-5 w-5 text-muted-foreground" />
          <h4 className="font-medium">Гистограмма (по диапазонам фото)</h4>
        </div>
        <div className="space-y-2">
          {stats.histogram.map((item, i) => (
            <div key={i} className="space-y-1">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium w-16">{item.range}</span>
                <span className="text-muted-foreground text-xs">
                  {item.count} игр. ({item.total_faces} лиц)
                </span>
              </div>
              <Progress
                value={(item.count / Math.max(...stats.histogram.map((h) => h.count), 1)) * 100}
                className="h-2"
              />
            </div>
          ))}
        </div>
      </div>

      {/* Распределение */}
      <div className="rounded-lg border p-4">
        <div className="flex items-center gap-2 mb-3">
          <TrendingUp className="h-5 w-5 text-muted-foreground" />
          <h4 className="font-medium">Распределение (≥N фото)</h4>
        </div>
        <div className="space-y-2">
          {stats.distribution.map((item, i) => (
            <div key={i} className="space-y-1">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium">≥ {item.threshold} фото</span>
                <span className="text-muted-foreground text-xs">
                  {item.count} игр. ({item.percentage}%)
                </span>
              </div>
              <Progress value={item.percentage} className="h-2 [&>div]:bg-green-500" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
