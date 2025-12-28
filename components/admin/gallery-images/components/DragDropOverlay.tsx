"use client"

import { Upload } from "lucide-react"

interface DragDropOverlayProps {
  isEmptyState?: boolean
}

export function DragDropOverlay({ isEmptyState = false }: DragDropOverlayProps) {
  if (isEmptyState) {
    return (
      <div className="absolute inset-0 z-50 flex items-center justify-center backdrop-blur-sm border-4 border-dashed border-primary rounded-lg bg-white/95 dark:bg-black/95">
        <div className="text-center">
          <Upload className="h-16 w-16 mx-auto mb-4 text-primary" />
          <p className="text-xl font-semibold">Перетащите фото сюда</p>
          <p className="text-sm text-muted-foreground mt-2">Отпустите, чтобы загрузить</p>
        </div>
      </div>
    )
  }

  return (
    <div className="absolute inset-0 bg-background/75 backdrop-blur-sm border-2 border-dashed border-primary rounded-lg z-50 pointer-events-none">
      <div className="sticky top-[calc(50vh-100px)] flex flex-col items-center justify-center py-12">
        <Upload className="h-16 w-16 text-primary mb-4" />
        <p className="text-lg font-semibold text-primary">Перетащите фото сюда</p>
        <p className="text-sm text-muted-foreground mt-2">Отпустите, чтобы загрузить</p>
      </div>
    </div>
  )
}
