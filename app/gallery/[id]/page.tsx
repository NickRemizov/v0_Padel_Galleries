/**
 * Gallery Detail Page
 * 
 * @migrated 2025-12-27 - Uses apiFetch (FastAPI) instead of direct Supabase
 */

import { apiFetch } from "@/lib/apiClient"
import { notFound } from "next/navigation"
import { GalleryView } from "@/components/gallery-view"
import type { Gallery } from "@/lib/types"

// Force dynamic rendering - don't try to fetch during build
export const dynamic = "force-dynamic"
export const revalidate = 60

export default async function GalleryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  // Fetch gallery with images and people from FastAPI
  // full=true returns gallery_images with people array
  const result = await apiFetch(`/api/galleries/${id}?full=true`)

  if (!result.success || !result.data) {
    notFound()
  }

  return <GalleryView gallery={result.data as Gallery} />
}
