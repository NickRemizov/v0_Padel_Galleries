"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import {
  runConsistencyAuditAction,
  clearPersonOutliersAction,
  auditAllEmbeddingsAction,
} from "@/app/admin/actions/people"
import type { ConsistencyAuditResult, AuditSummary } from "./types"

export function useConsistencyAudit(open: boolean) {
  const [loading, setLoading] = useState(false)
  const [results, setResults] = useState<ConsistencyAuditResult[]>([])
  const [displayedResults, setDisplayedResults] = useState<ConsistencyAuditResult[]>([])
  const [summary, setSummary] = useState<AuditSummary | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [currentIndex, setCurrentIndex] = useState(0)
  const scrollRef = useRef<HTMLDivElement>(null)

  const [fixingPersonId, setFixingPersonId] = useState<string | null>(null)
  const [fixingAll, setFixingAll] = useState(false)

  const runAudit = useCallback(async () => {
    setLoading(true)
    setError(null)
    setResults([])
    setDisplayedResults([])
    setCurrentIndex(0)

    try {
      const result = await runConsistencyAuditAction(0.5, 2)

      if (result.success && result.data) {
        setResults(result.data.results)
        setSummary({
          total_people: result.data.total_people,
          people_with_problems: result.data.people_with_problems,
          total_outliers: result.data.total_outliers,
          total_excluded: result.data.total_excluded || 0,
        })
      } else {
        setError(result.error || "Ошибка аудита")
      }
    } catch (e: any) {
      setError(e.message || "Ошибка соединения с сервером")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (open) {
      runAudit()
    } else {
      setResults([])
      setDisplayedResults([])
      setSummary(null)
      setCurrentIndex(0)
    }
  }, [open, runAudit])

  useEffect(() => {
    if (results.length === 0 || currentIndex >= results.length) return

    const timer = setTimeout(() => {
      setDisplayedResults((prev) => [...prev, results[currentIndex]])
      setCurrentIndex((prev) => prev + 1)
      if (scrollRef.current) {
        scrollRef.current.scrollTop = scrollRef.current.scrollHeight
      }
    }, 50)

    return () => clearTimeout(timer)
  }, [results, currentIndex])

  const handleFixOutliers = useCallback(async (personId: string) => {
    setFixingPersonId(personId)
    try {
      const result = await clearPersonOutliersAction(personId, 0.5)

      if (result.success && result.data) {
        const clearedCount = result.data.cleared_count || 0
        
        const updateResult = (r: ConsistencyAuditResult) =>
          r.person_id !== personId
            ? r
            : {
                ...r,
                outlier_count: 0,
                excluded_count: (r.excluded_count || 0) + clearedCount,
                has_problems: false,
              }

        setDisplayedResults((prev) => prev.map(updateResult))
        setResults((prev) => prev.map(updateResult))

        if (summary && clearedCount > 0) {
          setSummary((prev) =>
            prev
              ? {
                  ...prev,
                  total_outliers: Math.max(0, prev.total_outliers - clearedCount),
                  total_excluded: prev.total_excluded + clearedCount,
                  people_with_problems: Math.max(0, prev.people_with_problems - 1),
                }
              : prev
          )
        }
      } else {
        alert(`Ошибка: ${result.error}`)
      }
    } catch (e: any) {
      alert(`Ошибка: ${e.message}`)
    } finally {
      setFixingPersonId(null)
    }
  }, [summary])

  const handleFixAll = useCallback(async () => {
    setFixingAll(true)
    try {
      const result = await auditAllEmbeddingsAction(0.5, 3)
      if (result.success) {
        await runAudit()
      } else {
        alert(`Ошибка: ${result.error}`)
      }
    } catch (e: any) {
      alert(`Ошибка: ${e.message}`)
    } finally {
      setFixingAll(false)
    }
  }, [runAudit])

  const totalFixableOutliers = displayedResults.reduce(
    (sum, r) => sum + r.outlier_count,
    0
  )

  return {
    loading,
    results,
    displayedResults,
    summary,
    error,
    currentIndex,
    scrollRef,
    fixingPersonId,
    fixingAll,
    totalFixableOutliers,
    runAudit,
    handleFixOutliers,
    handleFixAll,
  }
}
