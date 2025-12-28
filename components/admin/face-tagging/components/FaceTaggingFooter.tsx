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
            \u0414\u043e\u0431\u0430\u0432\u0438\u0442\u044c \u0447\u0435\u043b\u043e\u0432\u0435\u043a\u0430
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
                \u041f\u043e\u0432\u0442\u043e\u0440\u043d\u043e\u0435 \u0440\u0430\u0441\u043f\u043e\u0437\u043d\u0430\u0432\u0430\u043d\u0438\u0435...
              </>
            ) : (
              <>
                <Scan className="mr-2 h-4 w-4" />
                \u0420\u0430\u0441\u043f\u043e\u0437\u043d\u0430\u0442\u044c \u0431\u0435\u0437 \u0444\u0438\u043b\u044c\u0442\u0440\u043e\u0432
              </>
            )}
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={onShowMetrics}
            disabled={!hasRedetectedData}
          >
            \u041f\u043e\u043a\u0430\u0437\u0430\u0442\u044c \u043c\u0435\u0442\u0440\u0438\u043a\u0438
          </Button>
        </div>

        <div className="flex gap-2 ml-auto">
          <Button variant="outline" onClick={onCancel}>
            \u041e\u0442\u043c\u0435\u043d\u0430
          </Button>
          <Button onClick={onSave} disabled={!canSave}>
            {saving ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                \u0421\u043e\u0445\u0440\u0430\u043d\u0435\u043d\u0438\u0435...
              </>
            ) : (
              <>
                <Save className="mr-2 h-4 w-4" />
                \u0421\u043e\u0445\u0440\u0430\u043d\u0438\u0442\u044c
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  )
}
