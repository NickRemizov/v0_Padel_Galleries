/**
 * Unified logging system for the application
 * Replaces mixed console.log patterns with consistent logger
 */

const isDevelopment = process.env.NODE_ENV === "development"

export const logger = {
  debug: (component: string, message: string, data?: any) => {
    if (isDevelopment) {
      console.log(`[DEBUG][${component}] ${message}`, data !== undefined ? data : "")
    }
  },
  info: (component: string, message: string, data?: any) => {
    console.log(`[INFO][${component}] ${message}`, data !== undefined ? data : "")
  },
  warn: (component: string, message: string, data?: any) => {
    console.warn(`[WARN][${component}] ${message}`, data !== undefined ? data : "")
  },
  error: (component: string, message: string, data?: any) => {
    console.error(`[ERROR][${component}] ${message}`, data !== undefined ? data : "")
  },
  production: (component: string, message: string, data?: any) => {
    console.log(`[PROD][${component}] ${message}`, data !== undefined ? data : "")
  },
}
