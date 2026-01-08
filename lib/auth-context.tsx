"use client"

import { createContext, useContext, useEffect, useState, type ReactNode } from "react"
import type { User } from "./types"
import { identifyUser, resetUser, trackLogout } from "./analytics"

interface AuthContextType {
  user: User | null
  loading: boolean
  login: () => void
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    checkAuth()
  }, [])

  // Identify user in PostHog when user changes
  useEffect(() => {
    if (user) {
      identifyUser(user.id, {
        person_id: user.person_id,
        name: user.first_name,
      })
    }
  }, [user])

  async function checkAuth() {
    try {
      const response = await fetch("/api/auth/me")
      const data = await response.json()
      setUser(data.user)
    } catch (error) {
      console.error("[v0] Auth check error:", error)
    } finally {
      setLoading(false)
    }
  }

  function login() {
    // Telegram widget will handle the login
    // After successful login, we'll check auth again
    setTimeout(checkAuth, 1000)
  }

  async function logout() {
    try {
      await fetch("/api/auth/logout", { method: "POST" })
      trackLogout()
      resetUser()
      setUser(null)
    } catch (error) {
      console.error("[v0] Logout error:", error)
    }
  }

  return <AuthContext.Provider value={{ user, loading, login, logout }}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider")
  }
  return context
}
