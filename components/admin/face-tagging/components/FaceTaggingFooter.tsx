"use client"

import { Button } from "@/components/ui/button"
import { Loader2, Save, Plus, Scan } from "lucide-react"

interface FaceTaggingFooterProps {
  canSave: boolean
  saving: boolean
  redetecting: boolean
  detecting: boolean
  hasRedetectedData: boolean
  onAddPerson: () => void
  onRedetect: () => void
  onShowMetrics: () => void
  onCancel: () => void
  onSave: () => void
}

export function FaceTaggingFooter({
  canSave,
  saving,
  redetecting,
  detecting,
  hasRedetectedData,
  onAddPerson,
  onRedetect,
  onShowMetrics,
  onCancel,
  onSave,
}: FaceTaggingFooterProps) {
  return (
    <div className="flex-shrink-0">
      <div className="flex items-center justify-between gap-4">
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={onAddPerson}>
            <Plus className="mr-2 h-4 w-4" />
            Добавить человека
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={onRedetect}
            disabled={redetecting || detecting}
          >
            {redetecting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Повторное распознавание...
              </>
            ) : (
              <>
                <Scan className="mr-2 h-4 w-4" />
                Распознать без фильтров
              </>
            )}
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={onShowMetrics}
            disabled={!hasRedetectedData}
          >
            Показать метрики
          </Button>
        </div>

        <div className="flex gap-2 ml-auto">
          <Button variant="outline" onClick={onCancel}>
            Отмена
          </Button>
          <Button onClick={onSave} disabled={!canSave}>
            {saving ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Сохранение...
              </>
            ) : (
              <>
                <Save className="mr-2 h-4 w-4" />
                Сохранить
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  )
}
