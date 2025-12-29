"use client"

import { Check, Trash2, Loader2 } from "lucide-react"
import FaceCropPreview from "@/components/FaceCropPreview"
import { formatShortDate } from "../utils"
import type { FaceCardProps } from "../types"

export function IntegrityFaceCard({
  item,
  issueType,
  showConfidence = false,
  showVerified = false,
  hasActions = false,
  onConfirm,
  onReject,
  isProcessing,
  isRemoved,
  confidenceThreshold,
}: FaceCardProps) {
  if (isRemoved) return null

  const confirmAction = issueType === "verifiedWithoutPerson" ? "verify" : "elevate"
  const rejectAction = issueType === "verifiedWithoutPerson" ? "unverify" : "unlink"

  const shortDate = formatShortDate(item.shoot_date)
  const galleryWithDate = item.gallery_title
    ? shortDate
      ? `${item.gallery_title} ${shortDate}`
      : item.gallery_title
    : null

  return (
    <div className="bg-background p-1.5 rounded border space-y-1 relative">
      <div className="relative w-full aspect-square bg-muted rounded overflow-hidden">
        {item.bbox && item.image_url ? (
          <div className="w-full h-full">
            <FaceCropPreview imageUrl={item.image_url} bbox={item.bbox} size={200} />
          </div>
        ) : (
          <div className="w-full h-full flex items-center justify-center text-muted-foreground text-xs text-center p-2">
            {item.photo_exists === false ? "Фото удалено" : "Нет превью"}
          </div>
        )}
        {hasActions && !isProcessing && (
          <>
            <button
              onClick={() => onConfirm(item.id, confirmAction, item)}
              className="absolute top-1 left-1 w-7 h-7 bg-green-500 hover:bg-green-600 rounded flex items-center justify-center text-white shadow-md transition-colors"
              title={
                confirmAction === "verify"
                  ? "Тегировать лицо"
                  : `Установить confidence ${Math.round(confidenceThreshold * 100)}%`
              }
            >
              <Check className="w-4 h-4" />
            </button>
            <button
              onClick={() => onReject(item.id, rejectAction)}
              className="absolute top-1 right-1 w-7 h-7 bg-red-500 hover:bg-red-600 rounded flex items-center justify-center text-white shadow-md transition-colors"
              title={rejectAction === "unverify" ? "Убрать верификацию" : "Убрать привязку к игроку"}
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </>
        )}
        {isProcessing && (
          <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
            <Loader2 className="w-4 h-4 animate-spin text-white" />
          </div>
        )}
      </div>
      <div className="text-xs space-y-0.5 leading-tight">
        {(item.person_name || item.real_name) && (
          <div className="truncate">
            <span className="text-muted-foreground">Игрок:</span>{" "}
            <span className="font-medium">{item.person_name || item.real_name}</span>
          </div>
        )}
        {galleryWithDate && (
          <div className="truncate">
            <span className="text-muted-foreground">Галерея:</span> <span>{galleryWithDate}</span>
          </div>
        )}
        {item.filename && (
          <div className="truncate">
            <span className="text-muted-foreground">Файл:</span> <span>{item.filename}</span>
          </div>
        )}
        {showConfidence && item.confidence !== undefined && item.confidence !== null && (
          <div>Уверенность: {(item.confidence * 100).toFixed(0)}%</div>
        )}
        {showVerified && item.verified !== undefined && (
          <div>Верифицирован: {item.verified ? "Да" : "Нет"}</div>
        )}
        {item.photo_exists === false && (
          <div className="text-orange-600 font-medium">⚠️ Фото удалено</div>
        )}
        {item.count && (
          <div className="font-medium text-orange-600">Дублей: {item.count} записей</div>
        )}
      </div>
    </div>
  )
}
