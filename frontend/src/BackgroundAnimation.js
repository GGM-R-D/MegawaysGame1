/**
 * BackgroundAnimation.js - Animated Background Sequences
 * 
 * Manages animated background sequences using frame-by-frame WebP images.
 * Plays animation at 30fps using PixiJS ticker.
 * 
 * Frame Sequences:
 * - Background1: 105 frames (base game)
 * - Background2: 151 frames (free spins)
 * 
 * Animation Speed: 30fps (33.33ms per frame)
 */

import * as PIXI from 'pixi.js';

/**
 * BackgroundAnimation - Manages animated background frame sequences
 */
export default class BackgroundAnimation {
  /**
   * Creates a new BackgroundAnimation instance
   * 
   * @param {Object} options - Configuration options
   * @param {PIXI.Application} options.app - PixiJS application
   * @param {string} options.basePath - Base path for frame images
   * @param {number} options.frameCount - Number of frames in sequence
   * @param {string} [options.framePrefix] - Frame filename prefix (default: 'background1_')
   * @param {string} [options.frameExtension] - Frame file extension (default: '.webp')
   */
  constructor({ app, basePath, frameCount, framePrefix = 'background1_', frameExtension = '.webp' }) {
    this.app = app; // PixiJS application
    this.basePath = basePath; // Base path for frames (e.g., '/animations/Background1')
    this.frameCount = frameCount; // Total number of frames
    this.framePrefix = framePrefix; // Frame filename prefix (e.g., 'background1_')
    this.frameExtension = frameExtension; // File extension (e.g., '.webp')
    
    // Animation state
    this.sprite = null; // PixiJS sprite displaying current frame
    this.textures = []; // Array of loaded frame textures
    this.currentFrame = 0; // Current frame index
    this.isPlaying = false; // Playback state
    this.fps = 30; // Frames per second - matches the source WebP sequence
    this.frameInterval = 1000 / this.fps; // Milliseconds per frame (33.33ms)
    this.lastFrameTime = 0; // Timestamp of last frame update
    
    // Container for sprite
    this.container = new PIXI.Container();
    this.container.visible = true;
    this.container.alpha = 1;
    this.tickerCallback = null; // Ticker callback reference (for cleanup)
  }

  /**
   * Loads all frame textures
   * 
   * Loads frames numbered 1 to frameCount (e.g., background1_1.webp to background1_105.webp).
   * Creates sprite with first frame.
   * 
   * @returns {Promise<void>}
   */
  async load() {
    // Load all frame textures (frames are numbered 1 to frameCount)
    const texturePromises = [];
    for (let i = 1; i <= this.frameCount; i++) {
      const path = `${this.basePath}/${this.framePrefix}${i}${this.frameExtension}`;
      const loadPromise = PIXI.Assets.load(path);
      if (loadPromise && typeof loadPromise.then === 'function') {
        texturePromises.push(loadPromise.catch(err => {
          console.warn(`Failed to load background frame ${i}:`, err);
          return null;
        }));
      } else {
        console.warn(`PIXI.Assets.load returned invalid promise for ${path}`);
        texturePromises.push(Promise.resolve(null));
      }
    }

    const loadedTextures = await Promise.all(texturePromises);
    this.textures = loadedTextures.filter(t => t !== null);
    
    if (this.textures.length === 0) {
      console.warn('No background textures loaded');
      return;
    }

    // Create sprite with first frame
    if (this.textures.length > 0 && this.textures[0]) {
      this.sprite = new PIXI.Sprite(this.textures[0]);
      this.sprite.anchor.set(0.5);
      // Ensure texture is ready
      if (this.sprite.texture.baseTexture) {
        this.sprite.texture.baseTexture.update();
      }
      this.container.addChild(this.sprite);
    }
  }

  /**
   * Starts animation playback
   * 
   * Resets to first frame and adds ticker callback for frame updates.
   * 
   * @returns {void}
   */
  play() {
    if (this.textures.length === 0 || !this.sprite) {
      return;
    }

    this.isPlaying = true;
    this.currentFrame = 0; // Reset to first frame
    this.lastFrameTime = performance.now(); // Initialize timer
    
    // Add to ticker if not already added
    if (!this.tickerCallback) {
      this.tickerCallback = () => this.update();
      this.app.ticker.add(this.tickerCallback);
    }
  }

  /**
   * Stops animation playback
   * 
   * Removes ticker callback to stop frame updates.
   * 
   * @returns {void}
   */
  stop() {
    this.isPlaying = false;
    if (this.tickerCallback) {
      this.app.ticker.remove(this.tickerCallback);
      this.tickerCallback = null;
    }
  }

  /**
   * Updates animation frame
   * 
   * Called every frame by PixiJS ticker. Advances to next frame based on
   * elapsed time at exactly 30fps.
   * 
   * @returns {void}
   */
  update() {
    if (!this.isPlaying || this.textures.length === 0 || !this.sprite) {
      return;
    }

    const now = performance.now();
    const deltaTime = now - this.lastFrameTime;
    
    // Advance frame based on elapsed time at exactly 30fps
    if (deltaTime >= this.frameInterval) {
      // Advance by exactly one frame per interval (no skipping)
      this.currentFrame = (this.currentFrame + 1) % this.textures.length;
      
      if (this.textures[this.currentFrame]) {
        // Direct texture swap - no stretching
        this.sprite.texture = this.textures[this.currentFrame];
      }
      
      // Reset timer, accounting for any slight overage
      this.lastFrameTime = now;
    }
  }

  /**
   * Resizes background to fill screen
   * 
   * Scales sprite to cover entire screen while maintaining aspect ratio.
   * Centers sprite on screen.
   * 
   * @param {number} width - Screen width
   * @param {number} height - Screen height
   * @returns {void}
   */
  resize(width, height) {
    if (this.sprite) {
      // ===== BACKGROUND ZOOM ADJUSTMENT =====
      // Increase this value to zoom out (make background smaller), decrease to zoom in
      // 1.0 = normal size, 1.2 = 20% zoomed out, 1.5 = 50% zoomed out, 0.8 = 20% zoomed in
      const BACKGROUND_SCALE = 1;
      
      const scaleX = (width / this.sprite.texture.width) * BACKGROUND_SCALE;
      const scaleY = (height / this.sprite.texture.height) * BACKGROUND_SCALE;
      const scale = Math.max(scaleX, scaleY); // Maintain aspect ratio, cover screen
      
      this.sprite.scale.set(scale);
      this.sprite.x = width / 2.; // Center horizontally
      this.sprite.y = height / 1.59; // Position vertically
    }
  }

  /**
   * Cleans up resources
   * 
   * Stops animation and destroys container.
   * 
   * @returns {void}
   */
  destroy() {
    this.stop();
    if (this.container) {
      this.container.destroy({ children: true });
    }
    this.textures = [];
    this.sprite = null;
  }
}

