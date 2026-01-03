"use client"

import { useState } from "react"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { renameGalleryFilesAction } from "@/app/admin/actions/galleries"
import type { Gallery } from "@/lib/types"

interface RenameFilesDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  gallery: Gallery
  onSuccess?: () => void
}

const SORT_LABELS: Record<string, string> = {
  filename: "по названию файла",
  created: "по времени создания",
  added: "по времени добавления",
}

function formatShootDate(dateString: string): string {
  const date = new Date(dateString)
  const day = String(date.getDate()).padStart(2, "0")
  const month = String(date.getMonth() + 1).padStart(2, "0")
  return `${day}.${month}`
}

export function RenameFilesDialog({
  open,
  onOpenChange,
  gallery,
  onSuccess,
}: RenameFilesDialogProps) {
  const [isRenaming, setIsRenaming] = useState(false)

  const sortOrder = gallery.sort_order || "filename"
  const sortLabel = SORT_LABELS[sortOrder] || sortOrder
  const dateStr = formatShootDate(gallery.shoot_date)
  const exampleName = `${gallery.title} ${dateStr}-001`

  async function handleRename() {
    setIsRenaming(true)
    try {
      const result = await renameGalleryFilesAction(gallery.id)
      if (result.success) {
        onOpenChange(false)
        onSuccess?.()
      } else {
        alert(`Ошибка переименования: ${result.error}`)
      }
    } finally {
      setIsRenaming(false)
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <AlertDialogHeader>
          <AlertDialogTitle>Переименовать файлы</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-2">
              <p>Вы действительно хотите переименовать все файлы в галерее?</p>
              <p>
                Новые имена файлов: <strong>{exampleName}</strong> и т.д.
              </p>
              <p>
                Сортировка: <strong>{sortLabel}</strong>
              </p>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isRenaming}>Отмена</AlertDialogCancel>
          <AlertDialogAction onClick={handleRename} disabled={isRenaming}>
            {isRenaming ? "Переименование..." : "Переименовать"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
