"use server"

import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { logger } from "@/lib/logger"

export async function signInAction(email: string, password: string) {
  try {
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
