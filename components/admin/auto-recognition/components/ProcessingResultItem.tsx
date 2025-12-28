"use client"

import { Badge } from "@/components/ui/badge"
import { Loader2, CheckCircle2, XCircle } from "lucide-react"
import type { ProcessingResult } from "../types"

interface ProcessingResultItemProps {
  result: ProcessingResult
}

export function ProcessingResultItem({ result }: ProcessingResultItemProps) {
  return (
    <div className="flex items-center justify-between rounded-lg border p-3 text-sm">
      <div className="flex-1 truncate">
        <p className="truncate font-medium" title={result.filename}>
          {result.filename}
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
  )
}
