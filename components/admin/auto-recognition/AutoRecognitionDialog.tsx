"use client"

import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Checkbox } from "@/components/ui/checkbox"

import type { AutoRecognitionDialogProps } from "./types"
import { useAutoRecognition } from "./hooks"
import { ProcessingProgress, ProcessingResults, ProcessingResultItem } from "./components"

export function AutoRecognitionDialog({ 
  images, 
  open, 
  onOpenChange, 
  mode 
}: AutoRecognitionDialogProps) {
  const {
    processing,
    results,
    applyQualityFilters,
    setApplyQualityFilters,
    startProcessing,
    getStats,
  } = useAutoRecognition({ images, mode })

  const stats = getStats()
  const imagesToProcessCount = mode === "remaining" ? results.length : images.length

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {mode === "all" 
              ? "Автоматическое распознавание лиц" 
              : "Распознавание оставшихся фото"}
          </DialogTitle>
          <DialogDescription>
            {mode === "all"
              ? `Обработка ${imagesToProcessCount} фотографий. Это может занять несколько минут.`
              : `Обработка ${imagesToProcessCount} фотографий без ручной верификации.`}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Initial state - not started */}
          {!processing && results.length === 0 ? (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                {mode === "all"
                  ? "Система автоматически обнаружит и распознает лица на всех фотографиях галереи используя InsightFace."
                  : "Система обработает только фотографии без ручной верификации используя InsightFace."}
              </p>

              <div className="flex items-center space-x-2">
                <Checkbox
                  id="apply-quality-filters-auto"
                  checked={applyQualityFilters}
                  onCheckedChange={(checked) => setApplyQualityFilters(checked as boolean)}
                />
                <label
                  htmlFor="apply-quality-filters-auto"
                  className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                >
                  Применять настройки качества из глобального конфига
                </label>
              </div>
              <p className="text-xs text-muted-foreground">
                Если выключено, будут распознаны все лица без фильтрации по качеству
              </p>

              <Button onClick={startProcessing} className="w-full">
                Начать обработку
              </Button>
            </div>
          ) : (
            /* Processing or completed state */
            <>
              <ProcessingProgress stats={stats} processing={processing} />

              {!processing && <ProcessingResults stats={stats} />}

              {/* Results list */}
              <div className="max-h-[300px] space-y-2 overflow-y-auto">
                {results.map((result) => (
                  <ProcessingResultItem key={result.imageId} result={result} />
                ))}
              </div>

              {!processing && (
                <Button onClick={() => onOpenChange(false)} className="w-full">
                  Закрыть
                </Button>
              )}
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
