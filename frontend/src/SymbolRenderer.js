/**
 * SymbolRenderer.js - Symbol Rendering Utilities
 * 
 * Utility class for creating symbol sprites with proper scaling and positioning.
 * Currently minimal but can be extended for symbol-specific rendering logic.
 */

import * as PIXI from 'pixi.js';

/**
 * SymbolRenderer - Utility class for symbol sprite creation
 */
export default class SymbolRenderer {
  /**
   * Creates a symbol sprite from symbol code
   * 
   * Gets texture from assets by symbol code, falls back to PLACEHOLDER if not found.
   * Creates PixiJS sprite with center anchor.
   * 
   * @param {string} symbolCode - Symbol alias (e.g., 'BIRD', 'SCARAB')
   * @param {PIXI.Assets} assets - PixiJS Assets API
   * @returns {PIXI.Sprite} Symbol sprite with texture applied
   */
  createSymbolSprite(symbolCode, assets) {
    const texture = assets.get(symbolCode) ?? assets.get('PLACEHOLDER');
    const sprite = new PIXI.Sprite(texture);
    sprite.anchor.set(0.5);
    return sprite;
  }
}

