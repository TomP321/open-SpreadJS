/** Shared decode cache for image sources (data URLs stay cached across repaints). */
const cache = new Map<string, HTMLImageElement>();

export function cachedImage(src: string, onLoaded: () => void): HTMLImageElement | null {
  const existing = cache.get(src);
  if (existing) return existing.complete ? existing : null;
  if (typeof Image === 'undefined') return null;
  const image = new Image();
  image.onload = onLoaded;
  image.onerror = onLoaded;
  image.src = src;
  cache.set(src, image);
  return null;
}
