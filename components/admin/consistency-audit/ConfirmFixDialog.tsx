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

interface ConfirmFixDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  personName: string
  outlierCount: number
  onConfirm: () => void
}

export function ConfirmFixDialog({ open, onOpenChange, personName, outlierCount, onConfirm }: ConfirmFixDialogProps) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Исключить outliers из индекса?</AlertDialogTitle>
          <AlertDialogDescription>
            Будет исключено <strong>{outlierCount}</strong> проблемных дескрипторов 
            для игрока <strong>{personName}</strong>.
            <br /><br />
            Дескрипторы останутся в базе, но не будут использоваться для распознавания.
            Это можно отменить в любой момент через "Детали".
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Отмена</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm}>
            Исключить {outlierCount} outliers
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
