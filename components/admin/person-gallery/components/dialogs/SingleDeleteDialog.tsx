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
          <AlertDialogTitle>\u041f\u043e\u0434\u0442\u0432\u0435\u0440\u0434\u0438\u0442\u0435 \u0443\u0434\u0430\u043b\u0435\u043d\u0438\u0435</AlertDialogTitle>
          <AlertDialogDescription>
            \u0423\u0434\u0430\u043b\u0438\u0442\u044c \u0438\u0433\u0440\u043e\u043a\u0430 <strong>{personName}</strong> \u0441 \u0438\u0437\u043e\u0431\u0440\u0430\u0436\u0435\u043d\u0438\u044f <strong>{state.filename}</strong>{" "}
            \u0438\u0437 \u0433\u0430\u043b\u0435\u0440\u0435\u0438 <strong>{state.galleryName}</strong>?
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={onCancel}>\u041e\u0442\u043c\u0435\u043d\u0430</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm}>\u0423\u0434\u0430\u043b\u0438\u0442\u044c</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
