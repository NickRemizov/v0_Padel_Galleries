"use client"

import { useEffect, useState } from "react"
import ReactMarkdown from "react-markdown"
import { useAuth } from "@/lib/auth-context"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"

interface WelcomeData {
  show: boolean
  title?: string
  content?: string
  version?: number
  reason?: string
}

export function WelcomeDialog() {
  const { user } = useAuth()
  const [open, setOpen] = useState(false)
  const [welcomeData, setWelcomeData] = useState<WelcomeData | null>(null)
  const [loading, setLoading] = useState(false)

  // Check for welcome message when user logs in
  useEffect(() => {
    if (!user) {
      setOpen(false)
      return
    }

    checkWelcome()
  }, [user])

  async function checkWelcome() {
    try {
      const response = await fetch("/api/user/welcome")
      const data = await response.json()

      if (data.success && data.data?.show) {
        setWelcomeData(data.data)
        setOpen(true)
      }
    } catch (error) {
      console.error("Error checking welcome:", error)
    }
  }

  async function handleClose() {
    if (!welcomeData?.version) {
      setOpen(false)
      return
    }

    setLoading(true)
    try {
      await fetch("/api/user/welcome/seen", { method: "POST" })
    } catch (error) {
      console.error("Error marking welcome as seen:", error)
    } finally {
      setLoading(false)
      setOpen(false)
    }
  }

  if (!welcomeData?.show) {
    return null
  }

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && handleClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{welcomeData.title || "Welcome!"}</DialogTitle>
        </DialogHeader>
        <div className="prose prose-sm max-w-none text-foreground prose-headings:text-foreground prose-strong:text-foreground prose-li:text-foreground">
          <ReactMarkdown>{welcomeData.content || ""}</ReactMarkdown>
        </div>
        <DialogFooter>
          <Button onClick={handleClose} disabled={loading}>
            {loading ? "..." : "OK"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
