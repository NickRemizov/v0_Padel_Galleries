"use client"

import { useAuth } from "@/lib/auth-context"
import { TelegramLoginButton } from "./telegram-login-button"
import { GoogleLoginButton } from "./google-login-button"
import { UserMenu } from "./user-menu"
import { useState } from "react"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "./ui/dialog"

export function AuthButton() {
  const { user, loading, login } = useAuth()
  const [showLoginDialog, setShowLoginDialog] = useState(false)

  const botName = process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME
  const googleClientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID

  if (loading) {
    return <div className="h-10 w-10 animate-pulse rounded-full bg-muted" />
  }

  if (user) {
    return <UserMenu />
  }

  // Need at least one auth method configured
  if (!botName && !googleClientId) {
    return null
  }

  return (
    <>
      <button
        onClick={() => setShowLoginDialog(true)}
        title="Войти"
        className="p-1 rounded-full hover:bg-[#0088cc]/10 transition-colors"
      >
        <svg
          width="48"
          height="48"
          viewBox="0 0 24 24"
          fill="#0088cc"
        >
          <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/>
        </svg>
      </button>

      <Dialog open={showLoginDialog} onOpenChange={setShowLoginDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Вход</DialogTitle>
            <DialogDescription>
              Войдите, чтобы оставлять комментарии и лайки
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col items-center gap-4 py-4">
            {botName && (
              <TelegramLoginButton
                botName={botName}
                onAuth={() => {
                  login()
                  setShowLoginDialog(false)
                }}
                requestAccess={false}
              />
            )}

            {botName && googleClientId && (
              <div className="flex items-center gap-3 w-full">
                <div className="flex-1 h-px bg-border" />
                <span className="text-sm text-muted-foreground">или</span>
                <div className="flex-1 h-px bg-border" />
              </div>
            )}

            {googleClientId && (
              <GoogleLoginButton
                onAuth={() => {
                  login()
                  setShowLoginDialog(false)
                }}
              />
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
