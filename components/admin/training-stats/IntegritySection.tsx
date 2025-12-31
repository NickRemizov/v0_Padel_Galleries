import { Wrench } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import type { Statistics } from "./types"

interface IntegritySectionProps {
  stats: Statistics
}

export function IntegritySection({ stats }: IntegritySectionProps) {
  const hasIntegrityIssues = stats.integrity.inconsistent_verified > 0 || stats.integrity.orphaned_descriptors > 0

  return (
    <div
      className={`rounded-lg border p-4 space-y-2 ${
        hasIntegrityIssues
          ? "border-red-200 bg-red-50 dark:bg-red-950/20"
          : "border-green-200 bg-green-50 dark:bg-green-950/20"
      }`}
    >
      <div className="flex items-center gap-2">
        <Wrench className={`h-5 w-5 ${hasIntegrityIssues ? "text-red-600" : "text-green-600"}`} />
        <h4
          className={`font-medium ${hasIntegrityIssues ? "text-red-800 dark:text-red-200" : "text-green-800 dark:text-green-200"}`}
        >
          Целостность данных
        </h4>
      </div>

      <div className="flex justify-between items-center">
        <span className="text-sm">verified ≠ confidence</span>
        <Badge
          variant={stats.integrity.inconsistent_verified === 0 ? "default" : "destructive"}
          className={stats.integrity.inconsistent_verified === 0 ? "bg-green-100 text-green-700 hover:bg-green-100" : ""}
        >
          {stats.integrity.inconsistent_verified === 0 ? "✓ OK" : stats.integrity.inconsistent_verified}
        </Badge>
      </div>
      <div className="flex justify-between items-center">
        <span className="text-sm">Осиротевшие дескрипторы</span>
        <Badge
          variant={stats.integrity.orphaned_descriptors === 0 ? "default" : "destructive"}
          className={stats.integrity.orphaned_descriptors === 0 ? "bg-green-100 text-green-700 hover:bg-green-100" : ""}
        >
          {stats.integrity.orphaned_descriptors === 0 ? "✓ OK" : stats.integrity.orphaned_descriptors}
        </Badge>
      </div>
      <div className="flex justify-between items-center pt-2 border-t">
        <span className="text-sm">Ср. confidence (unverified)</span>
        <span className="font-bold">{(stats.integrity.avg_unverified_confidence * 100).toFixed(1)}%</span>
      </div>
    </div>
  )
}
