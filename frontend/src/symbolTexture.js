/**
 * symbolTexture.js - Symbol texture lookup with alias fallbacks
 *
 * Resolves symbol codes to textures. Handles the "10" symbol which may be
 * defined in theme manifests as "10" or "TEN".
 *
 * @param {PIXI.Assets} assets - PixiJS Assets API
 * @param {string} symbolCode - Symbol code (e.g. "10", "BUFFALO", "A")
 * @returns {PIXI.Texture|null} Texture or PLACEHOLDER fallback
 */
export function getSymbolTexture(assets, symbolCode) {
  if (!assets) return null;
  if (!symbolCode) return assets.get('PLACEHOLDER') ?? null;
  const primary = assets.get(symbolCode);
  if (primary) return primary;
  // Theme manifest may use "TEN" for the card-10 symbol; backend sends "10"
  if (symbolCode === '10') {
    const ten = assets.get('TEN');
    if (ten) return ten;
  }
  return assets.get('PLACEHOLDER') ?? null;
}
