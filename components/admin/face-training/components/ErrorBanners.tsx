"use client"

import { AlertCircle, AlertTriangle } from "lucide-react"
import { FASTAPI_URL } from "../constants"

interface ErrorBannersProps {
  httpsRequired: boolean
  fastapiError: boolean
}

export function ErrorBanners({ httpsRequired, fastapiError }: ErrorBannersProps) {
  if (httpsRequired) {
    return (
      <div className="flex items-start gap-2 rounded-lg border border-destructive/50 bg-destructive/10 p-4">
        <AlertCircle className="h-5 w-5 text-destructive" />
        <div className="flex-1 space-y-2">
          <p className="text-sm font-medium text-destructive">FastAPI сервер требует HTTPS</p>
          <p className="text-xs text-muted-foreground">
            Сервер отклоняет HTTP запросы с сообщением "Invalid request, only https is supported"
          </p>
          <div className="mt-2 space-y-1 text-xs">
            <p className="font-medium">Решение 1: Измените переменную окружения</p>
            <p className="text-muted-foreground">
              В разделе "Vars" боковой панели измените FASTAPI_URL на https://23.88.61.20:8001
            </p>
            <p className="mt-2 font-medium">Решение 2: Настройте FastAPI сервер</p>
            <p className="text-muted-foreground">
              Отключите проверку HTTPS в настройках FastAPI сервера для разработки
            </p>
          </div>
        </div>
      </div>
    )
  }

  if (fastapiError) {
    return (
      <div className="flex items-start gap-2 rounded-lg border border-amber-500/50 bg-amber-500/10 p-4">
        <AlertTriangle className="h-5 w-5 text-amber-500" />
        <div className="flex-1 space-y-2">
          <p className="text-sm font-medium text-amber-500">FastAPI сервер недоступен</p>
          <p className="text-xs text-muted-foreground">
            Не удалось подключиться к серверу обучения. Проверьте консоль браузера (F12) для деталей.
          </p>
          <div className="mt-2 space-y-1 text-xs">
            <p className="font-medium">Возможные причины:</p>
            <ul className="list-inside list-disc text-muted-foreground">
              <li>FastAPI сервер не запущен</li>
              <li>Неверный URL в переменной FASTAPI_URL</li>
              <li>Сервер недоступен из интернета (для деплоя)</li>
              <li>Порт закрыт файрволом</li>
            </ul>
            <p className="mt-2 font-medium">Текущий URL: {FASTAPI_URL}</p>
          </div>
        </div>
      </div>
    )
  }

  return null
}
