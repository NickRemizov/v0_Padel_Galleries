"use client"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { AlertCircle, CheckCircle2, Loader2, RefreshCw, Info } from "lucide-react"
import type { IntegrityRunControlsProps } from "../types"

export function IntegrityRunControls({ isChecking, onCheck, report }: IntegrityRunControlsProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Проверка целостности базы данных</CardTitle>
        <CardDescription>
          Проверка и исправление нарушений целостности данных в системе распознавания лиц.
          Проверка может занять до 60 секунд при большом объёме данных.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Button onClick={onCheck} disabled={isChecking} className="w-full">
          {isChecking ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Проверка... (может занять до 60 сек)
            </>
          ) : (
            <>
              <RefreshCw className="mr-2 h-4 w-4" />
              Запустить проверку
            </>
          )}
        </Button>
        
        {!report && !isChecking && (
          <Alert>
            <Info className="h-4 w-4" />
            <AlertTitle>Нажмите кнопку для начала проверки</AlertTitle>
            <AlertDescription>
              Проверка анализирует всю базу данных и может занять некоторое время
            </AlertDescription>
          </Alert>
        )}
        
        {report && (
          <Alert variant={report.totalIssues > 0 ? "destructive" : "default"}>
            {report.totalIssues > 0 ? (
              <>
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>Обнаружено проблем: {report.totalIssues}</AlertTitle>
                <AlertDescription>
                  Рекомендуется исправить проблемы для корректной работы системы распознавания
                </AlertDescription>
              </>
            ) : (
              <>
                <CheckCircle2 className="h-4 w-4" />
                <AlertTitle>Проблем не обнаружено</AlertTitle>
                <AlertDescription>База данных в порядке</AlertDescription>
              </>
            )}
          </Alert>
        )}
      </CardContent>
    </Card>
  )
}
