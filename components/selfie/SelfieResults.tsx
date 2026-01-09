"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Check, X, RotateCcw } from "lucide-react"

interface Match {
  photo_face_id: string
  photo_id: string
  image_url: string
  filename: string
  similarity: number
}

interface SelfieResultsProps {
  matches: Match[]
  selfieSearchId: string
  onConfirm: (photoFaceIds: string[]) => void
  onRetry: () => void
  onCancel: () => void
  isProcessing?: boolean
}

export function SelfieResults({
  matches,
  selfieSearchId,
  onConfirm,
  onRetry,
  onCancel,
  isProcessing
}: SelfieResultsProps) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(
    new Set(matches.map(m => m.photo_face_id))
  )

  const toggleSelection = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  const handleConfirm = () => {
    onConfirm(Array.from(selectedIds))
  }

  if (matches.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-8 text-center">
        <div className="text-6xl mb-4">😕</div>
        <h3 className="text-xl font-semibold mb-2">Фотографии не найдены</h3>
        <p className="text-muted-foreground mb-6">
          Мы не нашли ваших фотографий. Попробуйте сделать другое селфи с лучшим освещением.
        </p>
        <div className="flex gap-4">
          <Button variant="outline" onClick={onCancel}>
            Позже
          </Button>
          <Button onClick={onRetry}>
            <RotateCcw className="w-4 h-4 mr-2" />
            Попробовать ещё
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col">
      <div className="text-center mb-6">
        <h3 className="text-xl font-semibold mb-2">Это вы на этих фото?</h3>
        <p className="text-muted-foreground">
          Выберите фотографии, на которых точно вы
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        {matches.map((match) => (
          <div
            key={match.photo_face_id}
            className={`relative rounded-lg overflow-hidden cursor-pointer border-4 transition-colors ${
              selectedIds.has(match.photo_face_id)
                ? "border-green-500"
                : "border-transparent"
            }`}
            onClick={() => toggleSelection(match.photo_face_id)}
          >
            <img
              src={match.image_url}
              alt={match.filename}
              className="w-full aspect-square object-cover"
            />

            {/* Selection indicator */}
            <div
              className={`absolute top-2 right-2 w-8 h-8 rounded-full flex items-center justify-center transition-colors ${
                selectedIds.has(match.photo_face_id)
                  ? "bg-green-500 text-white"
                  : "bg-white/80 text-gray-400"
              }`}
            >
              <Check className="w-5 h-5" />
            </div>

            {/* Similarity badge */}
            <div className="absolute bottom-2 left-2 bg-black/70 text-white text-xs px-2 py-1 rounded">
              {Math.round(match.similarity * 100)}%
            </div>
          </div>
        ))}
      </div>

      <div className="flex justify-center gap-4">
        <Button
          variant="outline"
          onClick={onRetry}
          disabled={isProcessing}
        >
          <RotateCcw className="w-4 h-4 mr-2" />
          Другое селфи
        </Button>
        <Button
          onClick={handleConfirm}
          disabled={selectedIds.size === 0 || isProcessing}
        >
          {isProcessing ? (
            <>
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
              Сохранение...
            </>
          ) : (
            <>
              <Check className="w-4 h-4 mr-2" />
              Подтвердить ({selectedIds.size})
            </>
          )}
        </Button>
      </div>

      <p className="text-xs text-muted-foreground text-center mt-4">
        После подтверждения мы найдём все ваши остальные фотографии автоматически
      </p>
    </div>
  )
}
