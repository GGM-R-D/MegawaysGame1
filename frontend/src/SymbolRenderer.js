/**
 * SymbolRenderer.js - Symbol Rendering Utilities
 * 
 * Utility class for creating symbol sprites with proper scaling and positioning.
 * Currently minimal but can be extended for symbol-specific rendering logic.
 */

import * as PIXI from 'pixi.js';
import { getSymbolTexture } from './symbolTexture.js';

/**
 * SymbolRenderer - Utility class for symbol sprite creation
 */
export default class SymbolRenderer {
  /**
   * Creates a symbol sprite from symbol code
   * 
   * Gets texture from assets by symbol code, falls back to PLACEHOLDER if not found.
   * Supports "10" symbol (uses "TEN" texture if "10" not in manifest).
   * Creates PixiJS sprite with center anchor.
   * 
   * @param {string} symbolCode - Symbol alias (e.g., 'BIRD', 'SCARAB', '10')
   * @param {PIXI.Assets} assets - PixiJS Assets API
   * @returns {PIXI.Sprite} Symbol sprite with texture applied
   */
  createSymbolSprite(symbolCode, assets) {
    const texture = getSymbolTexture(assets, symbolCode) ?? assets.get('PLACEHOLDER');
    const sprite = new PIXI.Sprite(texture);
    sprite.anchor.set(0.5);
    return sprite;
  }
}

