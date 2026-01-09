"use client"

/**
 * People Links
 *
 * Displays links to people on the photo (verified and recognized)
 *
 * Privacy: hasGallery=false means name is shown but not clickable
 */

import Link from "next/link"
import { cn } from "@/lib/utils"
import type { VerifiedPerson } from "../types"

interface PeopleLinksProps {
  verifiedPeople: VerifiedPerson[]
  currentPlayerId?: string
  hideUI: boolean
}

export function PeopleLinks({ verifiedPeople, currentPlayerId, hideUI }: PeopleLinksProps) {
  if (verifiedPeople.length === 0) return null

  return (
    <div
      className={cn(
        "absolute md:top-4 md:left-4 bottom-4 left-4 md:bottom-auto flex flex-col gap-1 z-20 transition-opacity duration-200",
        hideUI && "opacity-0 pointer-events-none"
      )}
    >
      {verifiedPeople.map((person) => {
        const isCurrentPlayer = person.id === currentPlayerId
        const hasGallery = person.hasGallery !== false  // Default true
        const personSlug = person.slug || person.id

        // No link if: current player OR no gallery
        if (isCurrentPlayer || !hasGallery) {
          return (
            <div
              key={person.id}
              className={cn(
                "bg-black/70 px-3 py-1.5 rounded-full text-sm cursor-default",
                isCurrentPlayer ? "text-white/50" : "text-white"
              )}
            >
              {person.name}
            </div>
          )
        }

        return (
          <Link
            key={person.id}
            href={`/players/${personSlug}`}
            className="bg-black/70 hover:bg-black/80 text-white px-3 py-1.5 rounded-full text-sm transition-colors"
            onClick={(e) => e.stopPropagation()}
          >
            {person.name}
          </Link>
        )
      })}
    </div>
  )
}
