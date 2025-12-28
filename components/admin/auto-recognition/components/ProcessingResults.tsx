"use client"

import type { ProcessingStats } from "../types"

interface ProcessingResultsProps {
  stats: ProcessingStats
}

export function ProcessingResults({ stats }: ProcessingResultsProps) {
  return (
    <div className="space-y-2 rounded-lg border p-4">
      <h3 className="font-semibold">Результаты</h3>
      <div className="grid grid-cols-2 gap-2 text-sm">
        <div>
          <span className="text-muted-foreground">Обработано фото:</span>
          <span className="ml-2 font-medium">{stats.successCount}</span>
        </div>
        <div>
          <span className="text-muted-foreground">Ошибок:</span>
          <span className="ml-2 font-medium">{stats.errorCount}</span>
        </div>
        <div>
          <span className="text-muted-foreground">Найдено лиц:</span>
          <span className="ml-2 font-medium">{stats.totalFaces}</span>
        </div>
        <div>
          <span className="text-muted-foreground">Распознано:</span>
          <span className="ml-2 font-medium">{stats.totalRecognized}</span>
        </div>
      </div>
    </div>
  )
}
