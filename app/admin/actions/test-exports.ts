"use server"

// Тестовый файл для проверки экспортов
console.log("[v0 TEST] test-exports.ts loaded")

export async function testExportsAction() {
  // Импортируем функцию напрямую из galleries
  const { getGalleryFaceRecognitionStatsAction } = await import("./galleries")

  console.log("[v0 TEST] getGalleryFaceRecognitionStatsAction type:", typeof getGalleryFaceRecognitionStatsAction)
  console.log(
    "[v0 TEST] getGalleryFaceRecognitionStatsAction is function:",
    typeof getGalleryFaceRecognitionStatsAction === "function",
  )

  return {
    success: true,
    functionExists: typeof getGalleryFaceRecognitionStatsAction === "function",
    functionType: typeof getGalleryFaceRecognitionStatsAction,
  }
}
