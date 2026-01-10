import type React from "react"
import type { Metadata } from "next"
import { Providers } from "@/components/providers"
import { GoogleAnalytics } from "@/components/google-analytics"

import "./globals.css"
import { Suspense } from "react"
import { Playfair_Display, Oswald as V0_Font_Oswald, Lobster } from "next/font/google"

// Initialize fonts
const oswald = V0_Font_Oswald({
  subsets: ["latin", "cyrillic"],
  weight: ["200", "300", "400", "500", "600", "700"],
  variable: "--font-oswald",
})

const playfair = Playfair_Display({
  subsets: ["latin", "cyrillic"],
  variable: "--font-playfair",
  display: "swap",
})

const lobster = Lobster({
  subsets: ["latin", "cyrillic"],
  weight: "400",
  variable: "--font-lobster",
})

export const metadata: Metadata = {
  title: "Padel in Valencia",
  description: "Photos from padel tournaments & other events",
  generator: "v0.app",
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  const googleClientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID

  return (
    <html lang="ru">
      <body className={`font-sans ${oswald.variable} ${playfair.variable} ${lobster.variable}`}>
        <GoogleAnalytics />
        <Providers googleClientId={googleClientId}>
          <Suspense fallback={null}>{children}</Suspense>
        </Providers>
      </body>
    </html>
  )
}
