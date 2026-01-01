"use client"

import { Button } from "@/components/ui/button"
import { DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Check, X, ArrowUpDown, ArrowUp } from "lucide-react"
import type { VerifyButtonState } from "../types"

interface PersonGalleryHeaderProps {
  personName: string
  photosCount: number
  unverifiedCount: number
  selectedCount: number
  showUnverifiedFirst: boolean
  verifyButtonState: VerifyButtonState
  onToggleUnverifiedFirst: () => void
  onBatchVerify: () => void
  onBatchDelete: () => void
}

export function PersonGalleryHeader({
  personName,
  photosCount,
  unverifiedCount,
  selectedCount,
  showUnverifiedFirst,
  verifyButtonState,
  onToggleUnverifiedFirst,
  onBatchVerify,
  onBatchDelete,
}: PersonGalleryHeaderProps) {
  return (
    <div className="sticky top-0 z-10 pb-4 border-b">
      <DialogHeader>
        <div className="flex items-start justify-between gap-4">
          <div>
            <DialogTitle>Галерея: {personName}</DialogTitle>
            <DialogDescription>
              Фотографии с подтвержденным распознаванием или высокой уверенностью
            </DialogDescription>
          </div>
          {photosCount > 0 && (
            <div className="flex gap-2 shrink-0 mr-12">
              <Button
                variant={showUnverifiedFirst ? "default" : "outline"}
                size="sm"
                onClick={onToggleUnverifiedFirst}
                className={`w-[220px] justify-start ${showUnverifiedFirst ? "bg-blue-500 hover:bg-blue-600" : ""}`}
                disabled={unverifiedCount === 0}
              >
                {showUnverifiedFirst ? (
                  <ArrowUp className="h-4 w-4 mr-2 flex-shrink-0" />
                ) : (
                  <ArrowUpDown className="h-4 w-4 mr-2 flex-shrink-0" />
                )}
                <span className="truncate">
                  {showUnverifiedFirst ? "Обычный порядок" : "Вначале неподтверждённые"}
                </span>
              </Button>
              <Button
                variant="default"
                size="sm"
                disabled={verifyButtonState.disabled}
                onClick={onBatchVerify}
                className="w-[220px] justify-start bg-green-500 hover:bg-green-600 text-white disabled:bg-gray-300 disabled:text-gray-500"
              >
                <Check className="h-4 w-4 mr-2 flex-shrink-0" />
                <span className="truncate">{verifyButtonState.text}</span>
              </Button>
              <Button
                variant="destructive"
                size="sm"
                disabled={selectedCount === 0}
                onClick={onBatchDelete}
                className="min-w-[200px] justify-start"
              >
                <X className="h-4 w-4 mr-2" />
                {selectedCount > 0
                  ? `Убрать игрока с ${selectedCount} фото`
                  : "Убрать игрока с фото"}
              </Button>
            </div>
          )}
        </div>
      </DialogHeader>
    </div>
  )
}
