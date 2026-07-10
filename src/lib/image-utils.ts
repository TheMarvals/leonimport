/**
 * Utility to optimize and upgrade image URLs, particularly from MercadoLibre.
 * MercadoLibre thumbnails typically end in '-I.jpg', '-V.jpg', '-D.jpg', which are low resolution (100x100).
 * Replacing these suffixes with '-O.jpg' returns the original, high-resolution image.
 */
export function getHighResImageUrl(url: string | null | undefined): string | null {
  if (!url) return null;

  // Forzar HTTPS para evitar bloqueos de Mixed Content en producción
  let secureUrl = url.replace(/^http:\/\//i, 'https://');

  // Check if it's a MercadoLibre static URL
  if (
    secureUrl.includes('mlstatic.com') ||
    secureUrl.includes('mercadolibre.com') ||
    secureUrl.includes('mlstatic.com/D_NQ_NP_')
  ) {
    // Suffixes: -I, -V, -D followed by extension (.jpg, .jpeg, .png, .webp)
    // Replace with -O of the same extension
    return secureUrl.replace(/-[IVD]\.(jpg|jpeg|png|webp)/i, '-O.$1');
  }

  return secureUrl;
}
