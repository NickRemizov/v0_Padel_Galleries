"use client"

import { Progress } from "@/components/ui/progress"
import { Loader2 } from "lucide-react"
import type { ProcessingStats } from "../types"

interface ProcessingProgressProps {
  stats: ProcessingStats
  processing: boolean
}

export function ProcessingProgress({ stats, processing }: ProcessingProgressProps) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-sm">
        <span>Прогресс</span>
        <span>
          {stats.processedImages} / {stats.totalImages}
        </span>
      </div>
      <Progress value={stats.progress} />

      {processing && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span>Обработка фотографий...</span>
        </div>
      )}
    </div>
  )
}
