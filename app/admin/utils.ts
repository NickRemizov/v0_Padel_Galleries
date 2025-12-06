import { env } from "@/lib/env"

export { apiFetch } from "@/lib/apiClient"
export { revalidatePath } from "next/cache"

export function getApiBaseUrl(): string {
  if (!env.FASTAPI_URL) {
    throw new Error("FASTAPI_URL environment variable is not set")
  }
  return env.FASTAPI_URL
}
