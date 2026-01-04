"use client"

import { useEffect, useState, useCallback } from "react"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"

type BackendStatus = "connected" | "auth_error" | "unavailable" | "checking"

const STATUS_CONFIG = {
  connected: {
    color: "bg-green-500",
    label: "FastAPI: подключено",
  },
  auth_error: {
    color: "bg-yellow-500",
    label: "FastAPI: ошибка авторизации",
  },
  unavailable: {
    color: "bg-red-500",
    label: "FastAPI: недоступен",
  },
  checking: {
    color: "bg-gray-400 animate-pulse",
    label: "Проверка...",
  },
}

const CHECK_INTERVAL = 30000 // 30 seconds

export function BackendStatusIndicator() {
  const [status, setStatus] = useState<BackendStatus>("checking")

  const checkStatus = useCallback(async () => {
    try {
      const response = await fetch("/api/admin/training/config", {
        method: "GET",
        credentials: "include",
      })

      if (response.ok) {
        setStatus("connected")
      } else if (response.status === 401 || response.status === 403) {
        setStatus("auth_error")
      } else {
        setStatus("unavailable")
      }
    } catch {
      setStatus("unavailable")
    }
  }, [])

  useEffect(() => {
    // Initial check
    checkStatus()

    // Periodic check
    const interval = setInterval(checkStatus, CHECK_INTERVAL)

    return () => clearInterval(interval)
  }, [checkStatus])

  const config = STATUS_CONFIG[status]

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            onClick={checkStatus}
            className="focus:outline-none"
            aria-label={config.label}
          >
            <div
              className={cn(
                "h-2 w-2 rounded-full transition-colors",
                config.color
              )}
            />
          </button>
        </TooltipTrigger>
        <TooltipContent>
          <p>{config.label}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
