import { Button } from "@/components/ui/button"
import { AlertTriangle, Loader2, Wrench } from "lucide-react"

interface AuditSummaryProps {
  summary: {
    total_people: number
    people_with_problems: number
    total_outliers: number
    total_excluded: number
  }
  totalFixableOutliers: number
  fixingAll: boolean
  onFixAll: () => void
}

export function AuditSummary({ summary, totalFixableOutliers, fixingAll, onFixAll }: AuditSummaryProps) {
  return (
    <div className="flex items-center justify-between py-3 px-4 bg-muted rounded-lg">
      <div className="flex items-center gap-6 text-sm">
        <div className="flex items-center gap-1 text-muted-foreground">
          <span>Проверено:</span>
          <span className="font-bold">{summary.total_people}</span>
        </div>
        
        <div className="flex items-center gap-1 text-foreground">
          <AlertTriangle className="h-4 w-4" />
          <span>С проблемами:</span>
          <span className="font-bold">{summary.people_with_problems}</span>
        </div>
        
        <div className="flex items-center gap-1 text-red-600">
          <span>Найдено проблем:</span>
          <span className="font-bold">{summary.total_outliers}</span>
        </div>
      </div>
      
      {totalFixableOutliers > 0 && (
        <Button
          variant="outline"
          size="sm"
          disabled={fixingAll}
          onClick={onFixAll}
          className="border-gray-400"
        >
          {fixingAll ? (
            <Loader2 className="h-4 w-4 animate-spin mr-2" />
          ) : (
            <Wrench className="h-4 w-4 mr-2" />
          )}
          Исправить все ({totalFixableOutliers})
        </Button>
      )}
    </div>
  )
}
