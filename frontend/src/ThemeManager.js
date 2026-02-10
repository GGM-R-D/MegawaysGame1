/**
 * ThemeManager.js - Asset Loading and Theme Management
 * 
 * Loads game assets (symbols, textures, animations) from theme manifests.
 * Manages theme configuration and asset bundles via PixiJS Assets API.
 * 
 * Theme Structure:
 * - Manifest: /themes/{gameId}/manifest.json
 * - Assets: Symbol textures, background textures, etc.
 * 
 * Dependencies:
 * - PixiJS Assets API
 * - AssetLoader for bundle management
 */

import { Assets } from 'pixi.js';
import AssetLoader from './AssetLoader.js';

/**
 * ThemeManager - Loads and manages game theme assets
 */
export default class ThemeManager {
  /**
   * Creates a new ThemeManager instance
   * 
   * @param {Object} [options] - Configuration options
   * @param {string} [options.assetBasePath] - Base path for assets (default: empty)
   */
  constructor({ assetBasePath } = {}) {
    this.assetBasePath = assetBasePath?.replace(/\/+$/, '') ?? ''; // Remove trailing slashes
    this.manifestCache = new Map(); // Cache loaded manifests
    this.assetLoader = new AssetLoader({ assets: Assets }); // Asset bundle loader
  }

  /**
   * Loads theme assets for a game
   * 
   * Fetches theme manifest, creates asset bundle, and loads all assets.
   * Caches manifest for future use.
   * 
   * @param {string} gameId - Game identifier (e.g., 'JungleRelics')
   * @param {PIXI.Assets} [assetLoader] - PixiJS Assets API (default: Assets)
   * @returns {Promise<Object>} Theme manifest with grid config and asset definitions
   * @throws {Error} If manifest fetch fails or assets cannot be loaded
   */
  async loadTheme(gameId, assetLoader = Assets) {
    if (!gameId) {
      throw new Error('gameId is required to load theme assets.');
    }

    const manifest = await this.#fetchManifest(gameId);
    if (!manifest?.assets?.length) {
      throw new Error(`Theme manifest for ${gameId} does not define assets.`);
    }

    const bundleId = `theme-${gameId}`;
    const entries = manifest.assets.map((asset) => ({
      alias: asset.alias,
      src: this.#resolvePath(asset.path),
      loadParser: asset.loadParser
    }));

    // Inject 10 symbol from Ten.png if not already in manifest (place Ten.png in frontend/public/Ten.png)
    const has10 = manifest.assets.some((a) => a.alias === '10' || a.alias === 'TEN');
    if (gameId === 'JungleRelics' && !has10) {
      entries.push({ alias: '10', src: '/Ten.png' });
      entries.push({ alias: 'TEN', src: '/Ten.png' });
    }

    try {
      await this.assetLoader.loadBundle(bundleId, entries, assetLoader);
      return manifest;
    } catch (error) {
      console.error(`Failed to load asset bundle for ${gameId}:`, error);
      throw error;
    }
  }

  /**
   * Fetches theme manifest from server
   * 
   * Caches manifest to avoid repeated fetches.
   * 
   * @private
   * @param {string} gameId - Game identifier
   * @returns {Promise<Object>} Theme manifest JSON
   * @throws {Error} If fetch fails or response is not OK
   */
  async #fetchManifest(gameId) {
    // Check cache first
    if (this.manifestCache.has(gameId)) {
      return this.manifestCache.get(gameId);
    }

    // Fetch manifest from server
    const response = await fetch(this.#resolvePath(`/themes/${gameId}/manifest.json`));
    if (!response.ok) {
      throw new Error(`Unable to fetch theme manifest for ${gameId}.`);
    }

    const manifest = await response.json();
    this.manifestCache.set(gameId, manifest); // Cache for future use
    return manifest;
  }

  /**
   * Resolves asset path relative to base path
   * 
   * @private
   * @param {string} relativePath - Relative path (may start with /)
   * @returns {string} Resolved absolute path
   */
  #resolvePath(relativePath) {
    if (!relativePath.startsWith('/')) {
      return `${this.assetBasePath}/${relativePath}`.replace(/\/{2,}/g, '/');
    }
    return `${this.assetBasePath}${relativePath}` || relativePath;
  }

}

