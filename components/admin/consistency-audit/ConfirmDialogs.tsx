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

interface ConfirmFixProps {
  open: boolean
  personName: string
  outlierCount: number
  onConfirm: () => void
  onCancel: () => void
}

export function ConfirmFixDialog({ open, personName, outlierCount, onConfirm, onCancel }: ConfirmFixProps) {
  return (
    <AlertDialog open={open} onOpenChange={(open) => !open && onCancel()}>
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
          <AlertDialogCancel onClick={onCancel}>Отмена</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm}>
            Исключить {outlierCount} outliers
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

interface ConfirmFixAllProps {
  open: boolean
  totalOutliers: number
  onConfirm: () => void
  onCancel: () => void
}

export function ConfirmFixAllDialog({ open, totalOutliers, onConfirm, onCancel }: ConfirmFixAllProps) {
  return (
    <AlertDialog open={open} onOpenChange={(open) => !open && onCancel()}>
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
          <AlertDialogCancel onClick={onCancel}>Отмена</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm}>
            Исключить все {totalOutliers} outliers
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
