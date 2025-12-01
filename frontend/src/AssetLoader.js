/**
 * AssetLoader.js - Asset Bundle Loading
 * 
 * Wraps PixiJS Assets API for loading asset bundles. Handles bundle definition
 * and loading with error handling.
 * 
 * Used by ThemeManager to load theme asset bundles.
 */

/**
 * AssetLoader - Wraps PixiJS Assets API for bundle loading
 */
export default class AssetLoader {
  /**
   * Creates a new AssetLoader instance
   * 
   * @param {Object} options - Configuration options
   * @param {PIXI.Assets} options.assets - PixiJS Assets API
   */
  constructor({ assets }) {
    this.assets = assets; // PixiJS Assets API
  }

  /**
   * Loads an asset bundle
   * 
   * Adds bundle definition to PixiJS Assets and loads all assets in the bundle.
   * 
   * @param {string} bundleId - Bundle identifier (e.g., 'theme-JungleRelics')
   * @param {Array} manifestEntries - Array of asset definitions
   * @param {PIXI.Assets} assetLoader - PixiJS Assets API (for loading)
   * @returns {Promise<void>}
   * @throws {Error} If bundle cannot be added or loaded
   */
  async loadBundle(bundleId, manifestEntries, assetLoader) {
    try {
      if (!assetLoader) {
        throw new Error('assetLoader is undefined');
      }
      
      if (typeof assetLoader.addBundle !== 'function') {
        throw new Error('assetLoader.addBundle is not a function');
      }
      
      if (typeof assetLoader.loadBundle !== 'function') {
        throw new Error('assetLoader.loadBundle is not a function');
      }
      
      // Add bundle definition
      assetLoader.addBundle(bundleId, manifestEntries);
      
      // Load bundle - PixiJS Assets.loadBundle returns a promise
      const loadPromise = assetLoader.loadBundle(bundleId);
      
      // Ensure we have a valid promise
      if (loadPromise === undefined || loadPromise === null) {
        throw new Error(`loadBundle returned ${loadPromise} for bundle ${bundleId}`);
      }
      
      if (typeof loadPromise.then !== 'function') {
        throw new Error(`loadBundle did not return a promise for bundle ${bundleId}, got: ${typeof loadPromise}`);
      }
      
      await loadPromise;
      return;
    } catch (error) {
      console.error(`Failed to load bundle ${bundleId}:`, error);
      console.error('Error details:', {
        bundleId,
        assetLoaderType: typeof assetLoader,
        hasAddBundle: typeof assetLoader?.addBundle,
        hasLoadBundle: typeof assetLoader?.loadBundle
      });
      throw error;
    }
  }
}

