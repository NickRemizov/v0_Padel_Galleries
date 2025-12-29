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
import type { SingleDeleteDialogState } from "../../types"

interface SingleDeleteDialogProps {
  state: SingleDeleteDialogState
  personName: string
  onOpenChange: (open: boolean) => void
  onConfirm: () => void
  onCancel: () => void
}

export function SingleDeleteDialog({
  state,
  personName,
  onOpenChange,
  onConfirm,
  onCancel,
}: SingleDeleteDialogProps) {
  return (
    <AlertDialog open={state.open} onOpenChange={onOpenChange}>
      <AlertDialogContent
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <AlertDialogHeader>
          <AlertDialogTitle>Подтвердите удаление</AlertDialogTitle>
          <AlertDialogDescription>
            Удалить игрока <strong>{personName}</strong> с изображения <strong>{state.filename}</strong>{" "}
            из галереи <strong>{state.galleryName}</strong>?
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={onCancel}>Отмена</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm}>Удалить</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
