"use client"

import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Upload, Scan, UserPlus, Trash2, Eye, EyeOff } from "lucide-react"
import type { SortOption } from "../types"

interface GalleryToolbarProps {
  hasImages: boolean
  sortBy: SortOption
  onSortChange: (value: string) => void
  hideFullyVerified: boolean
  onToggleHideVerified: () => void
  uploading: boolean
  uploadProgress: string
  onUpload: (e: React.ChangeEvent<HTMLInputElement>) => void
  onAutoRecognition: () => void
  onShowUnknownFaces: () => void
  onDeleteAll: () => void
  isDeleting: boolean
  selectedCount: number
  onClearSelection: () => void
  allPhotosVerified: boolean
}

export function GalleryToolbar({
  hasImages,
  sortBy,
  onSortChange,
  hideFullyVerified,
  onToggleHideVerified,
  uploading,
  uploadProgress,
  onUpload,
  onAutoRecognition,
  onShowUnknownFaces,
  onDeleteAll,
  isDeleting,
  selectedCount,
  onClearSelection,
  allPhotosVerified,
}: GalleryToolbarProps) {
  return (
    <div className="flex items-center gap-4 flex-wrap mt-4">
      <label htmlFor="image-upload" className="cursor-pointer">
        <div className="flex items-center gap-2 rounded-md border border-input bg-background px-4 py-2 hover:bg-accent hover:text-accent-foreground">
          <Upload className="h-4 w-4" />
          <span>Загрузить фото</span>
        </div>
        <input
          id="image-upload"
          type="file"
          accept="image/*"
          multiple
          onChange={onUpload}
          disabled={uploading}
          className="hidden"
        />
      </label>

      {hasImages && (
        <Select value={sortBy} onValueChange={onSortChange}>
          <SelectTrigger className="w-[220px]">
            <SelectValue placeholder="Сортировка" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="filename">По названию файла</SelectItem>
            <SelectItem value="created">По времени создания</SelectItem>
            <SelectItem value="added">По времени добавления</SelectItem>
          </SelectContent>
        </Select>
      )}

      {hasImages && (
        <Button
          variant={hideFullyVerified ? "default" : "outline"}
          onClick={onToggleHideVerified}
          disabled={uploading}
          className={`w-[240px] justify-start ${hideFullyVerified ? "bg-blue-500 hover:bg-blue-600" : ""}`}
        >
          {hideFullyVerified ? (
            <Eye className="h-4 w-4 mr-2 flex-shrink-0" />
          ) : (
            <EyeOff className="h-4 w-4 mr-2 flex-shrink-0" />
          )}
          <span className="truncate">
            {hideFullyVerified ? "Верифицированные скрыты" : "Скрыть верифицированные"}
          </span>
        </Button>
      )}

      {hasImages && (
        <Button
          variant="secondary"
          onClick={onAutoRecognition}
          disabled={uploading || allPhotosVerified}
        >
          <Scan className="h-4 w-4 mr-2" />
          Распознать фото
        </Button>
      )}

      {hasImages && (
        <Button variant="secondary" onClick={onShowUnknownFaces} disabled={uploading}>
          <UserPlus className="h-4 w-4 mr-2" />
          Неизвестные лица
        </Button>
      )}

      {hasImages && (
        <Button
          variant="destructive"
          onClick={onDeleteAll}
          disabled={uploading || isDeleting}
          className="min-w-[180px] justify-start"
        >
          <Trash2 className="h-4 w-4 mr-2" />
          {isDeleting
            ? "Удаление..."
            : selectedCount > 0
              ? `Удалить ${selectedCount} фото`
              : "Удалить все фото"}
        </Button>
      )}

      {selectedCount > 0 && (
        <Button variant="outline" onClick={onClearSelection}>
          Снять выделение
        </Button>
      )}

      {uploading && <span className="text-sm text-muted-foreground">{uploadProgress}</span>}
    </div>
  )
}
