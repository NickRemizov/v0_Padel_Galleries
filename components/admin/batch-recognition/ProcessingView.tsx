"use client"

import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { Badge } from "@/components/ui/badge"
import { Loader2, CheckCircle2, XCircle } from "lucide-react"
import { ScrollArea } from "@/components/ui/scroll-area"
import type { ProcessingResult } from "./types"

interface ProcessingViewProps {
  results: ProcessingResult[]
  processing: boolean
  onClose: () => void
}

export function ProcessingView({ results, processing, onClose }: ProcessingViewProps) {
  const processedImages = results.filter((r) => r.status !== "pending" && r.status !== "processing").length
  const progress = results.length > 0 ? (processedImages / results.length) * 100 : 0
  const totalFaces = results.reduce((sum, r) => sum + r.facesFound, 0)
  const totalRecognized = results.reduce((sum, r) => sum + r.facesRecognized, 0)
  const errorCount = results.filter((r) => r.status === "error").length

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <div className="flex items-center justify-between text-sm">
          <span>Прогресс</span>
          <span>
            {processedImages} / {results.length}
          </span>
        </div>
        <Progress value={progress} />
      </div>

      {processing && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span>Обработка фотографий...</span>
        </div>
      )}

      {!processing && (
        <div className="space-y-2 rounded-lg border p-4">
          <h3 className="font-semibold">Результаты</h3>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div>
              <span className="text-muted-foreground">Обработано:</span>
              <span className="ml-2 font-medium">
                {results.filter((r) => r.status === "success").length}
              </span>
            </div>
            <div>
              <span className="text-muted-foreground">Ошибок:</span>
              <span className="ml-2 font-medium">{errorCount}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Найдено лиц:</span>
              <span className="ml-2 font-medium">{totalFaces}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Распознано:</span>
              <span className="ml-2 font-medium">{totalRecognized}</span>
            </div>
          </div>
        </div>
      )}

      <ScrollArea className="h-[300px]">
        <div className="space-y-2">
          {results.map((result) => (
            <div
              key={`${result.galleryId}-${result.imageId}`}
              className="flex items-center justify-between rounded-lg border p-3 text-sm"
            >
              <div className="flex-1 truncate">
                <p className="truncate font-medium" title={result.filename}>
                  {result.filename}
                </p>
                <p className="text-xs text-muted-foreground truncate">
                  {result.galleryTitle}
                </p>
                {result.status === "success" && (
                  <p className="text-xs text-muted-foreground">
                    Лиц: {result.facesFound}, распознано: {result.facesRecognized}
                  </p>
                )}
                {result.status === "error" && (
                  <p className="text-xs text-destructive">{result.error}</p>
                )}
              </div>
              <div>
                {result.status === "pending" && (
                  <Badge variant="secondary">Ожидание</Badge>
                )}
                {result.status === "processing" && (
                  <Badge variant="secondary">
                    <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                    Обработка
                  </Badge>
                )}
                {result.status === "success" && (
                  <Badge variant="default">
                    <CheckCircle2 className="mr-1 h-3 w-3" />
                    Готово
                  </Badge>
                )}
                {result.status === "error" && (
                  <Badge variant="destructive">
                    <XCircle className="mr-1 h-3 w-3" />
                    Ошибка
                  </Badge>
                )}
              </div>
            </div>
          ))}
        </div>
      </ScrollArea>

      {!processing && (
        <Button onClick={onClose} className="w-full">
          Закрыть
        </Button>
      )}
    </div>
  )
}
