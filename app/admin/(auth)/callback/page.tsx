import { Suspense } from "react"
import { OAuthCallbackHandler } from "@/components/admin/oauth-callback-handler"

export default function CallbackPage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <OAuthCallbackHandler />
    </Suspense>
  )
}
