"use client"

import { Suspense, useEffect } from "react"
import posthog from "posthog-js"
import { PostHogProvider as PHProvider } from "posthog-js/react"
import { usePathname, useSearchParams } from "next/navigation"

// Initialize PostHog
if (typeof window !== "undefined" && process.env.NEXT_PUBLIC_POSTHOG_KEY) {
  posthog.init(process.env.NEXT_PUBLIC_POSTHOG_KEY, {
    api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST || "https://eu.i.posthog.com",
    person_profiles: "identified_only",
    capture_pageview: false, // We capture manually for better control
    capture_pageleave: true,
  })
}

// Track page views (uses useSearchParams which requires Suspense)
function PostHogPageViewInner() {
  const pathname = usePathname()
  const searchParams = useSearchParams()

  useEffect(() => {
    if (pathname && posthog) {
      let url = window.origin + pathname
      if (searchParams?.toString()) {
        url = url + "?" + searchParams.toString()
      }
      posthog.capture("$pageview", { $current_url: url })
    }
  }, [pathname, searchParams])

  return null
}

function PostHogPageView() {
  return (
    <Suspense fallback={null}>
      <PostHogPageViewInner />
    </Suspense>
  )
}

export function PostHogProvider({ children }: { children: React.ReactNode }) {
  // Don't render provider if no key configured
  if (!process.env.NEXT_PUBLIC_POSTHOG_KEY) {
    return <>{children}</>
  }

  return (
    <PHProvider client={posthog}>
      <PostHogPageView />
      {children}
    </PHProvider>
  )
}

// Export posthog instance for custom events
export { posthog }
