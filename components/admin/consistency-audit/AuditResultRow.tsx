"use client"

import { Button } from "@/components/ui/button"
import { Loader2, Eye, Wrench } from "lucide-react"
import type { ConsistencyAuditResult } from "./types"

interface AuditResultRowProps {
  result: ConsistencyAuditResult
  fixingPersonId: string | null
  onViewDetails: (personId: string, personName: string) => void
  onFixOutliers: (personId: string, personName: string, outlierCount: number) => void
}

export function AuditResultRow({ result, fixingPersonId, onViewDetails, onFixOutliers }: AuditResultRowProps) {
  function getConsistencyColor(value: number): string {
    if (value >= 0.8) return "text-green-600"
    if (value >= 0.6) return "text-yellow-600"
    return "text-red-600"
  }

  function getRowStyle(): string {
    if (result.outlier_count > 0) return "bg-red-50 border-red-200"
    if ((result.excluded_count || 0) > 0) return "bg-yellow-50 border-yellow-200"
    if (result.overall_consistency < 0.7) return "bg-orange-50 border-orange-200"
    return "border-gray-100"
  }

  return (
    <div
      className={`grid grid-cols-[2fr_0.7fr_0.7fr_0.9fr_0.7fr_110px] gap-2 px-4 py-2 text-sm border-l-4 items-center ${getRowStyle()}`}
    >
      <div className="font-medium truncate" title={result.person_name}>
        {result.person_name}
      </div>
      <div className="text-center text-muted-foreground">
        {result.photo_count}
      </div>
      <div className="text-center text-muted-foreground">
        {result.descriptor_count}
      </div>
      <div className="text-center">
        {((result.excluded_count || 0) > 0 || result.outlier_count > 0) ? (
          <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
            result.outlier_count > 0 
              ? "bg-red-100 text-red-800" 
              : "bg-yellow-100 text-yellow-800"
          }`}>
            {result.excluded_count || 0}{result.outlier_count > 0 ? `/${result.outlier_count}` : ""}
          </span>
        ) : (
          <span className="text-muted-foreground">0</span>
        )}
      </div>
      <div className={`text-center font-medium ${getConsistencyColor(result.overall_consistency)}`}>
        {Math.round(result.overall_consistency * 100)}%
      </div>
      <div className="flex justify-start items-center gap-1">
        <Button
          variant="outline"
          size="sm"
          className="h-7 px-2"
          onClick={() => onViewDetails(result.person_id, result.person_name)}
        >
          <Eye className="h-3.5 w-3.5 mr-1" />
          Детали
        </Button>
        {result.outlier_count > 0 && (
          <Button
            variant="outline"
            size="icon"
            className="h-7 w-7 border-gray-400"
            disabled={fixingPersonId === result.person_id}
            onClick={() => onFixOutliers(result.person_id, result.person_name, result.outlier_count)}
            title="Исправить outliers"
          >
            {fixingPersonId === result.person_id ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Wrench className="h-3.5 w-3.5" />
            )}
          </Button>
        )}
      </div>
    </div>
  )
}
