/**
 * FreeSpinTransition.js - Free Spin Video Transition
 * 
 * Plays a full-screen MP4 video when free spins are triggered.
 * Handles video loading, playback, and completion callbacks.
 * 
 * Video File: /animations/free spin transistions/PixVerse_V5_Transition_360P.mp4
 * 
 * Usage: Called by SceneManager when free spins are triggered.
 */

import * as PIXI from 'pixi.js';

/**
 * FreeSpinTransition - Manages free spin video transition
 */
export default class FreeSpinTransition {
  /**
   * Creates a new FreeSpinTransition instance
   * 
   * @param {Object} options - Configuration options
   * @param {PIXI.Application} options.app - PixiJS application
   * @param {string} options.videoPath - Path to MP4 video file
   */
  constructor({ app, videoPath }) {
    this.app = app; // PixiJS application
    this.videoPath = videoPath; // Path to MP4 video file
    this.videoSprite = null; // PixiJS sprite displaying video
    this.videoSource = null; // HTML5 video element
    this.container = new PIXI.Container(); // Container for video sprite
    this.onComplete = null; // Completion callback
  }

  /**
   * Loads video file and creates PixiJS texture
   * 
   * Creates HTML5 video element, loads MP4 file, and creates PixiJS texture
   * from video. Sets up completion handler.
   * 
   * @returns {Promise<void>}
   */
  async load() {
    console.log('Loading free spin transition video from:', this.videoPath);
    
    try {
      // Create video element
      this.videoSource = document.createElement('video');
      this.videoSource.src = this.videoPath;
      this.videoSource.loop = false;
      this.videoSource.muted = false;
      this.videoSource.playsInline = true; // Important for mobile
      this.videoSource.preload = 'auto';
      
      // Wait for video to be ready
      await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          console.warn('Video load timeout, proceeding anyway');
          resolve();
        }, 10000); // 10 second timeout
        
        this.videoSource.oncanplaythrough = () => {
          clearTimeout(timeout);
          console.log('Free spin transition video loaded');
          resolve();
        };
        this.videoSource.onloadeddata = () => {
          clearTimeout(timeout);
          console.log('Free spin transition video data loaded');
          resolve();
        };
        this.videoSource.onerror = (err) => {
          clearTimeout(timeout);
          console.error('Failed to load free spin transition video:', err, this.videoSource.error);
          // Don't reject, just log - allow game to continue
          resolve();
        };
        this.videoSource.load();
      });

      // Create texture from video
      if (this.videoSource.readyState >= 2) { // HAVE_CURRENT_DATA
        const videoTexture = PIXI.Texture.from(this.videoSource);
        this.videoSprite = new PIXI.Sprite(videoTexture);
        this.videoSprite.anchor.set(0.5);
        this.container.addChild(this.videoSprite);
        this.container.visible = false;
        
        // Handle video end
        this.videoSource.onended = () => {
          console.log('Free spin transition video ended');
          this.stop();
          if (this.onComplete) {
            const callback = this.onComplete;
            this.onComplete = null;
            callback();
          }
        };
        
        // Update texture on video play
        this.videoSource.addEventListener('play', () => {
          if (this.videoSprite && this.videoSprite.texture) {
            this.videoSprite.texture.update();
          }
        });
      } else {
        console.warn('Video not ready, creating placeholder');
      }
    } catch (err) {
      console.error('Error loading free spin transition video:', err);
    }
  }

  /**
   * Plays the transition video
   * 
   * Shows container, resets video to start, and plays video.
   * Calls completion callback when video ends.
   * 
   * @param {Function} [onComplete] - Callback called when video ends
   * @returns {void}
   */
  play(onComplete) {
    console.log('FreeSpinTransition.play called', { 
      hasVideoSource: !!this.videoSource, 
      hasVideoSprite: !!this.videoSprite,
      videoReadyState: this.videoSource?.readyState 
    });
    
    if (!this.videoSource) {
      console.warn('Cannot play free spin transition - video source not loaded');
      if (onComplete) onComplete();
      return;
    }
    
    // Create sprite if not already created
    if (!this.videoSprite) {
      console.warn('Video sprite not created, attempting to create now');
      try {
        const videoTexture = PIXI.Texture.from(this.videoSource);
        this.videoSprite = new PIXI.Sprite(videoTexture);
        this.videoSprite.anchor.set(0.5);
        this.container.addChild(this.videoSprite);
      } catch (err) {
        console.error('Failed to create video sprite:', err);
        if (onComplete) onComplete();
        return;
      }
    }

    this.onComplete = onComplete;
    this.container.visible = true; // Show video
    this.videoSource.currentTime = 0; // Reset to start
    
    // Ensure video texture updates
    if (this.videoSprite && this.videoSprite.texture) {
      this.videoSprite.texture.update();
    }
    
    // Play video
    const playPromise = this.videoSource.play();
    if (playPromise !== undefined) {
      playPromise.then(() => {
        console.log('Free spin transition video started playing');
        // Update texture continuously while playing (required for video playback)
        if (this.videoSprite && this.videoSprite.texture) {
          const updateTexture = () => {
            if (this.videoSource && !this.videoSource.paused && !this.videoSource.ended) {
              this.videoSprite.texture.update();
              requestAnimationFrame(updateTexture); // Continue updating
            }
          };
          updateTexture();
        }
      }).catch(err => {
        console.error('Failed to play free spin transition video:', err);
        // Try to continue anyway
        if (this.onComplete) {
          const callback = this.onComplete;
          this.onComplete = null;
          callback();
        }
      });
    }
  }

  /**
   * Stops video playback
   * 
   * Pauses video and hides container.
   * 
   * @returns {void}
   */
  stop() {
    if (this.videoSource) {
      this.videoSource.pause();
      this.videoSource.currentTime = 0;
    }
    this.container.visible = false;
  }

  /**
   * Resizes video to fill screen
   * 
   * Scales video sprite to cover entire screen while maintaining aspect ratio.
   * Centers sprite on screen.
   * 
   * @param {number} width - Screen width
   * @param {number} height - Screen height
   * @returns {void}
   */
  resize(width, height) {
    if (this.videoSprite && this.videoSprite.texture) {
      // Scale to cover full screen while maintaining aspect ratio
      const scaleX = width / this.videoSprite.texture.width;
      const scaleY = height / this.videoSprite.texture.height;
      const scale = Math.max(scaleX, scaleY); // Use larger scale to cover screen
      this.videoSprite.scale.set(scale);
      this.videoSprite.x = width / 2; // Center horizontally
      this.videoSprite.y = height / 2; // Center vertically
      console.log('Free spin transition resized:', { width, height, scale, spriteX: this.videoSprite.x, spriteY: this.videoSprite.y });
    }
  }

  /**
   * Cleans up resources
   * 
   * Stops video and destroys container.
   * 
   * @returns {void}
   */
  destroy() {
    this.stop();
    if (this.videoSource) {
      this.videoSource.pause();
      this.videoSource.src = '';
    }
    if (this.container) {
      this.container.destroy({ children: true });
    }
    this.videoSprite = null;
    this.videoSource = null;
  }
}

