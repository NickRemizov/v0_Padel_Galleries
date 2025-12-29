"use client"

import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import {
  CheckCircle2,
  Loader2,
  Wrench,
  ChevronDown,
  ChevronRight,
  Info,
  Users,
} from "lucide-react"
import FaceCropPreview from "@/components/FaceCropPreview"
import { IntegrityFaceCard } from "./IntegrityFaceCard"
import { severityVariant } from "../utils"
import type { IssueRowProps } from "../types"

export function IntegrityIssueRow({
  title,
  count,
  issueType,
  description,
  severity = "medium",
  canFix = true,
  infoOnly = false,
  checked = false,
  showConfidence = false,
  showVerified = false,
  hasActions = false,
  maxItems = 40,
  simpleCards = false,
  customDetailsButton = false,
  onCustomDetails,
  // Данные из родителя
  details,
  isExpanded,
  onToggleExpand,
  onFix,
  isFixing,
  fixingDisabled,
  // Для FaceCard
  onConfirmFace,
  onRejectFace,
  processingFaces,
  removedFaces,
  confidenceThreshold,
}: IssueRowProps) {
  const hasDetails = details.length > 0

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between py-2">
        <div className="flex-1">
          <div className="flex items-center gap-2">
            {infoOnly && <Info className="h-4 w-4 text-muted-foreground" />}
            <span className="font-medium">{title}</span>
            {checked ? (
              <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                <CheckCircle2 className="w-3 h-3 mr-1" />
                OK
              </Badge>
            ) : (
              <Badge variant={severityVariant[severity]}>{count}</Badge>
            )}
          </div>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
        <div className="flex items-center gap-2">
          {!checked && customDetailsButton && onCustomDetails && (
            <Button variant="outline" size="sm" onClick={onCustomDetails}>
              <Users className="mr-2 h-4 w-4" />
              Просмотреть дубликаты
            </Button>
          )}
          {!checked && !customDetailsButton && hasDetails && (
            <Button
              variant="outline"
              size="sm"
              onClick={onToggleExpand}
              disabled={processingFaces.has(issueType)}
            >
              {processingFaces.has(issueType) ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Проверка...
                </>
              ) : (
                <>
                  {isExpanded ? <ChevronDown className="mr-2 h-4 w-4" /> : <ChevronRight className="mr-2 h-4 w-4" />}
                  Детали
                </>
              )}
            </Button>
          )}
          {!checked && canFix && !infoOnly && !customDetailsButton && (
            <Button variant="outline" size="sm" onClick={onFix} disabled={fixingDisabled}>
              {isFixing ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Исправление...
                </>
              ) : (
                <>
                  <Wrench className="mr-2 h-4 w-4" />
                  Исправить
                </>
              )}
            </Button>
          )}
          {infoOnly && !checked && !customDetailsButton && (
            <Badge variant="outline" className="text-muted-foreground">
              Только информация
            </Badge>
          )}
        </div>
      </div>
      
      {isExpanded && hasDetails && !customDetailsButton && (
        <div className="ml-4 p-3 bg-muted rounded-lg space-y-2">
          <div className="text-sm font-medium">
            Найдено записей: {details.length}
            {hasActions && " (✓ → Принять/Исправить, 🗑 → Отклонить)"}
          </div>
          
          {simpleCards ? (
            <SimpleCardsGrid details={details} maxItems={maxItems} />
          ) : (
            <div className={`grid gap-2 max-h-[500px] overflow-y-auto ${hasActions ? "grid-cols-6" : "grid-cols-4"}`}>
              {details.slice(0, maxItems).map((item: any, index: number) => (
                <IntegrityFaceCard
                  key={item.id || index}
                  item={item}
                  issueType={issueType}
                  showConfidence={showConfidence}
                  showVerified={showVerified}
                  hasActions={hasActions}
                  onConfirm={onConfirmFace}
                  onReject={onRejectFace}
                  isProcessing={processingFaces.has(item.id)}
                  isRemoved={removedFaces.has(item.id)}
                  confidenceThreshold={confidenceThreshold}
                />
              ))}
            </div>
          )}
          
          {details.length > maxItems && (
            <div className="text-xs text-muted-foreground">... и еще {details.length - maxItems} записей</div>
          )}
        </div>
      )}
      <Separator />
    </div>
  )
}

// Вспомогательный компонент для простых карточек
function SimpleCardsGrid({ details, maxItems }: { details: any[]; maxItems: number }) {
  return (
    <div className="grid grid-cols-4 gap-2 max-h-[400px] overflow-y-auto">
      {details.slice(0, maxItems).map((item: any, index: number) => (
        <div key={item.id || index} className="bg-background p-3 rounded border space-y-2">
          {item.bbox && item.image_url ? (
            <div className="relative w-full aspect-square bg-muted rounded overflow-hidden">
              <FaceCropPreview imageUrl={item.image_url} bbox={item.bbox} size={200} />
            </div>
          ) : (
            <div className="w-full h-full flex items-center justify-center text-muted-foreground text-xs text-center p-2">
              {item.photo_exists === false ? "Фото удалено" : "Нет превью"}
            </div>
          )}
          <div className="text-xs space-y-1">
            {item.real_name && <div className="font-medium">Игрок: {item.real_name}</div>}
            {item.person_name && <div className="font-medium">Игрок: {item.person_name}</div>}
            {item.name && <div className="font-medium">Игрок: {item.name}</div>}
            {item.telegram_username && (
              <div className="text-muted-foreground">Telegram: @{item.telegram_username}</div>
            )}
            {item.gallery_title && <div className="text-muted-foreground">Галерея: {item.gallery_title}</div>}
            {item.confidence !== undefined && item.confidence !== null && (
              <div>Уверенность: {(item.confidence * 100).toFixed(0)}%</div>
            )}
            {item.verified !== undefined && <div>Верифицирован: {item.verified ? "Да" : "Нет"}</div>}
            {item.count && <div className="font-medium text-orange-600">Дублей: {item.count} записей</div>}
          </div>
        </div>
      ))}
    </div>
  )
}
