"use server"

import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { logger } from "@/lib/logger"

// Get allowed admin emails from environment
function getAllowedEmails(): string[] {
  const emailsStr = process.env.ADMIN_ALLOWED_EMAILS || ""
  if (!emailsStr) return []
  return emailsStr.split(",").map(e => e.trim().toLowerCase()).filter(Boolean)
}

function isEmailAllowed(email: string): boolean {
  const allowedEmails = getAllowedEmails()
  // If no whitelist configured, allow all (backwards compatibility)
  if (allowedEmails.length === 0) return true
  return allowedEmails.includes(email.toLowerCase())
}

export async function signInAction(email: string, password: string) {
  try {
    // Check whitelist before attempting login
    if (!isEmailAllowed(email)) {
      logger.warn("actions/auth", "Login attempt with non-whitelisted email", { email })
      return { error: "Access denied. This email is not authorized for admin access." }
    }

    const supabase = await createClient()

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (error) throw error

    logger.info("actions/auth", "User signed in successfully", { email })
    redirect("/admin")
  } catch (error: any) {
    logger.error("actions/auth", "Error signing in", error)
    return { error: error.message || "Failed to sign in" }
  }
}

export async function signUpAction(email: string, password: string) {
  try {
    // Check whitelist before allowing registration
    if (!isEmailAllowed(email)) {
      logger.warn("actions/auth", "Registration attempt with non-whitelisted email", { email })
      return { error: "Registration is not allowed for this email. Contact administrator." }
    }

    const supabase = await createClient()

    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${process.env.NEXT_PUBLIC_DEV_SUPABASE_REDIRECT_URL || (typeof window !== "undefined" ? window.location.origin : "")}/admin/auth/callback`,
      },
    })

    if (error) throw error

    logger.info("actions/auth", "User signed up successfully", { email })
    return { success: true, message: "Check your email to confirm registration" }
  } catch (error: any) {
    logger.error("actions/auth", "Error signing up", error)
    return { error: error.message || "Failed to sign up" }
  }
}

export async function signOutAction() {
  try {
    const supabase = await createClient()

    const { error } = await supabase.auth.signOut()

    if (error) throw error

    logger.info("actions/auth", "User signed out successfully")
    redirect("/admin/login")
  } catch (error: any) {
    logger.error("actions/auth", "Error signing out", error)
    return { error: error.message || "Failed to sign out" }
  }
}
