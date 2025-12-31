"use client"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

interface RecognizeResult {
  total_unknown: number
  recognized_count: number
  by_person: Array<{ person_id: string; name: string; count: number }>
  index_rebuilt: boolean
}

interface RecognizeResultDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  result: RecognizeResult | null
}

export function RecognizeResultDialog({ open, onOpenChange, result }: RecognizeResultDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Результаты поиска известных лиц</DialogTitle>
          <DialogDescription>
            Проверено {result?.total_unknown ?? 0} неизвестных лиц
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4 text-center">
            <div className="p-4 bg-muted rounded-lg">
              <div className="text-3xl font-bold text-primary">
                {result?.recognized_count ?? 0}
              </div>
              <div className="text-sm text-muted-foreground">Распознано</div>
            </div>
            <div className="p-4 bg-muted rounded-lg">
              <div className="text-3xl font-bold">
                {(result?.total_unknown ?? 0) - (result?.recognized_count ?? 0)}
              </div>
              <div className="text-sm text-muted-foreground">Осталось неизвестных</div>
            </div>
          </div>

          {result?.by_person && result.by_person.length > 0 && (
            <div>
              <div className="font-medium mb-2">По игрокам:</div>
              <div className="max-h-[200px] overflow-y-auto space-y-1">
                {result.by_person.map((item) => (
                  <div 
                    key={item.person_id} 
                    className="flex justify-between items-center py-1 px-2 bg-muted/50 rounded"
                  >
                    <span className="truncate">{item.name}</span>
                    <span className="font-medium text-primary ml-2">{item.count}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {result?.recognized_count === 0 && (
            <div className="text-center text-muted-foreground py-4">
              Новых совпадений не найдено
            </div>
          )}
        </div>

        <div className="flex justify-end">
          <Button onClick={() => onOpenChange(false)}>
            Закрыть
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
