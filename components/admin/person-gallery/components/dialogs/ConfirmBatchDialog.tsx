"use client"

import type React from "react"
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
import type { ConfirmDialogState } from "../../types"

interface ConfirmBatchDialogProps {
  state: ConfirmDialogState
  personName: string
  onOpenChange: (open: boolean) => void
  onConfirm: () => void
  onCancel: () => void
}

export function ConfirmBatchDialog({
  state,
  personName,
  onOpenChange,
  onConfirm,
  onCancel,
}: ConfirmBatchDialogProps) {
  const handleCancel = (e: React.MouseEvent) => {
    e.stopPropagation()
    onCancel()
  }

  const handleConfirm = (e: React.MouseEvent) => {
    e.stopPropagation()
    onConfirm()
  }

  return (
    <AlertDialog open={state.open} onOpenChange={onOpenChange}>
      <AlertDialogContent
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <AlertDialogHeader>
          <AlertDialogTitle>Подтвердите ваше действие</AlertDialogTitle>
          <AlertDialogDescription>
            {state.action === "verify"
              ? `Подтвердить игрока ${personName} на ${state.count} фото?`
              : `Удалить игрока ${personName} с ${state.count} фото?`}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={handleCancel}>Отмена</AlertDialogCancel>
          <AlertDialogAction onClick={handleConfirm}>Подтвердить</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
