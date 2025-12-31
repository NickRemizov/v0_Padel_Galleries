"use client"

import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Images, Play } from "lucide-react"
import type { GalleryInfo, ProcessingMode } from "./types"
import { modeLabels } from "./types"

interface GallerySelectorProps {
  galleries: GalleryInfo[]
  mode: ProcessingMode
  applyQualityFilters: boolean
  onModeChange: (mode: ProcessingMode) => void
  onToggleGallery: (id: string) => void
  onSelectAll: () => void
  onDeselectAll: () => void
  onApplyQualityFiltersChange: (value: boolean) => void
  onStartProcessing: () => void
}

export function GallerySelector({
  galleries,
  mode,
  applyQualityFilters,
  onModeChange,
  onToggleGallery,
  onSelectAll,
  onDeselectAll,
  onApplyQualityFiltersChange,
  onStartProcessing,
}: GallerySelectorProps) {
  const selectedCount = galleries.filter((g) => g.selected).length
  const totalToProcess = galleries
    .filter((g) => g.selected)
    .reduce((sum, g) => sum + g.photos_to_process, 0)

  function formatDate(dateStr: string | null): string {
    if (!dateStr) return ""
    try {
      const date = new Date(dateStr)
      const day = date.getDate().toString().padStart(2, "0")
      const month = (date.getMonth() + 1).toString().padStart(2, "0")
      return `${day}.${month}`
    } catch {
      return ""
    }
  }

  return (
    <div className="space-y-4">
      <Tabs value={mode} onValueChange={(v) => onModeChange(v as ProcessingMode)}>
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="unprocessed">Необработанные</TabsTrigger>
          <TabsTrigger value="unverified">Неверифицированные</TabsTrigger>
        </TabsList>
      </Tabs>

      <p className="text-sm text-muted-foreground">
        {modeLabels[mode].description}
      </p>

      {galleries.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">
          <Images className="h-12 w-12 mx-auto mb-2 opacity-50" />
          <p>{modeLabels[mode].empty}</p>
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Checkbox
                id="apply-quality-filters"
                checked={applyQualityFilters}
                onCheckedChange={(checked) => onApplyQualityFiltersChange(checked as boolean)}
              />
              <label htmlFor="apply-quality-filters" className="text-sm">
                Применять настройки качества
              </label>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={onSelectAll}>
                Выбрать все
              </Button>
              <Button variant="outline" size="sm" onClick={onDeselectAll}>
                Снять все
              </Button>
            </div>
          </div>

          <ScrollArea className="h-[350px] border rounded-md p-2">
            <div className="space-y-1">
              {galleries.map((gallery) => (
                <div
                  key={gallery.id}
                  className={`flex items-center justify-between p-3 rounded-lg cursor-pointer hover:bg-accent transition-colors ${
                    gallery.selected ? "bg-accent" : ""
                  }`}
                  onClick={() => onToggleGallery(gallery.id)}
                >
                  <div className="flex items-center gap-3">
                    <Checkbox checked={gallery.selected} />
                    <div>
                      <div className="font-medium">
                        {gallery.title}
                        {gallery.shoot_date && (
                          <span className="text-muted-foreground ml-2">
                            {formatDate(gallery.shoot_date)}
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        Всего: {gallery.total_photos} фото
                      </div>
                    </div>
                  </div>
                  <Badge variant="secondary">
                    {gallery.photos_to_process} {modeLabels[mode].badge}
                  </Badge>
                </div>
              ))}
            </div>
          </ScrollArea>

          <div className="flex items-center justify-between pt-2 border-t">
            <div className="text-sm text-muted-foreground">
              Выбрано: {selectedCount} галерей, {totalToProcess} фото
            </div>
            <Button onClick={onStartProcessing} disabled={selectedCount === 0}>
              <Play className="mr-2 h-4 w-4" />
              Начать обработку
            </Button>
          </div>
        </>
      )}
    </div>
  )
}
