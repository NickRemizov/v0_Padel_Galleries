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

interface ConfirmFixAllDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  totalOutliers: number
  onConfirm: () => void
}

export function ConfirmFixAllDialog({ open, onOpenChange, totalOutliers, onConfirm }: ConfirmFixAllDialogProps) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Исправить все outliers?</AlertDialogTitle>
          <AlertDialogDescription>
            Будет исключено <strong>{totalOutliers}</strong> проблемных дескрипторов 
            у всех игроков.
            <br /><br />
            Дескрипторы останутся в базе, но не будут использоваться для распознавания.
            Это можно отменить в любой момент через "Детали" каждого игрока.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Отмена</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm}>
            Исключить все {totalOutliers} outliers
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
