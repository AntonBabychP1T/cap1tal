/**
 * On web the native splash never shows, so the overlay that lifts it has nothing to do. The file
 * exists only so `@/components/animated-icon` resolves on both platforms.
 */
export function AnimatedSplashOverlay() {
  return null;
}
