"use client"

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
import type { ConfirmDialogState, SingleDeleteDialogState } from "../types"

interface SingleDeleteDialogProps {
  state: SingleDeleteDialogState
  galleryTitle: string
  onOpenChange: (open: boolean) => void
  onConfirm: () => void
}

export function SingleDeleteDialog({
  state,
  galleryTitle,
  onOpenChange,
  onConfirm,
}: SingleDeleteDialogProps) {
  return (
    <AlertDialog
      open={state.open}
      onOpenChange={(next) => onOpenChange(next)}
    >
      <AlertDialogContent
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <AlertDialogHeader>
          <AlertDialogTitle>Подтверждение удаления</AlertDialogTitle>
          <AlertDialogDescription>
            Вы действительно хотите удалить{" "}
            <span className="font-semibold">{state.filename}</span> из галереи{" "}
            <span className="font-semibold">{galleryTitle}</span>? Это действие невозможно отменить!
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Отмена</AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            className="bg-destructive hover:bg-destructive/90"
          >
            Удалить
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

interface BatchDeleteDialogProps {
  state: ConfirmDialogState
  galleryTitle: string
  selectedCount: number
  isDeleting: boolean
  onOpenChange: (open: boolean) => void
  onCancel: () => void
  onConfirm: () => void
}

export function BatchDeleteDialog({
  state,
  galleryTitle,
  selectedCount,
  isDeleting,
  onOpenChange,
  onCancel,
  onConfirm,
}: BatchDeleteDialogProps) {
  return (
    <AlertDialog open={state.open} onOpenChange={(next) => onOpenChange(next)}>
      <AlertDialogContent
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <AlertDialogHeader>
          <AlertDialogTitle>Подтвердите удаление</AlertDialogTitle>
          <AlertDialogDescription>
            {selectedCount > 0 ? (
              <>
                Вы действительно хотите удалить выбранные фотографии ({selectedCount} шт.)
                из галереи <span className="font-semibold">{galleryTitle}</span>? Это действие
                невозможно отменить!
              </>
            ) : (
              <>
                Вы действительно хотите удалить все фотографии (
                <span className="font-semibold">{state.count} шт.</span>) из галереи{" "}
                <span className="font-semibold">{galleryTitle}</span>? Это действие невозможно
                отменить!
              </>
            )}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={onCancel} disabled={isDeleting}>
            Отмена
          </AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm} disabled={isDeleting}>
            {isDeleting ? "Удаление..." : "Подтвердить"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
