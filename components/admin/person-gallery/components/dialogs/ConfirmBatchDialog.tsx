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
          <AlertDialogTitle>\u041f\u043e\u0434\u0442\u0432\u0435\u0440\u0434\u0438\u0442\u0435 \u0432\u0430\u0448\u0435 \u0434\u0435\u0439\u0441\u0442\u0432\u0438\u0435</AlertDialogTitle>
          <AlertDialogDescription>
            {state.action === "verify"
              ? `\u041f\u043e\u0434\u0442\u0432\u0435\u0440\u0434\u0438\u0442\u044c \u0438\u0433\u0440\u043e\u043a\u0430 ${personName} \u043d\u0430 ${state.count} \u0444\u043e\u0442\u043e?`
              : `\u0423\u0434\u0430\u043b\u0438\u0442\u044c \u0438\u0433\u0440\u043e\u043a\u0430 ${personName} \u0441 ${state.count} \u0444\u043e\u0442\u043e?`}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={handleCancel}>\u041e\u0442\u043c\u0435\u043d\u0430</AlertDialogCancel>
          <AlertDialogAction onClick={handleConfirm}>\u041f\u043e\u0434\u0442\u0432\u0435\u0440\u0434\u0438\u0442\u044c</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
