/**
 * GridRenderer.js - Grid Rendering and Animation System
 * 
 * Renders the slot grid, handles spin animations, manages cascading mechanics,
 * and supports Megaways (variable reel heights).
 * 
 * Dual-Layer System:
 * - Spin Layer: Visible during reel spinning, shows animated symbols with blur
 * - Grid Layer: Visible during cascades, shows static symbols for win evaluation
 * 
 * Key Features:
 * - Reel spinning with staggered timing and blur effects
 * - Smooth transition from spin to grid mode
 * - Cascade animations (fade out winners, drop new symbols)
 * - Top reel support (horizontal scrolling above reels 2-5)
 * - Megaways support (variable reel heights per column)
 * - Turbo mode (60% faster animations)
 * 
 * Dependencies:
 * - PixiJS: WebGL rendering
 * - GSAP: Animation library
 */

import * as PIXI from 'pixi.js';
import { gsap } from 'gsap';
import SymbolRenderer from './SymbolRenderer.js';

/** Default cell size in pixels */
const DEFAULT_CELL_SIZE = 140;
/** Default padding around symbols in pixels */
const DEFAULT_SYMBOL_PADDING = 0;
/** Default gap between cells in pixels */
const DEFAULT_CELL_GAP = 5;

// Spin animation speed controls
/** Base spin duration in milliseconds (lower = faster) */
const SPIN_BASE_TIME = 1200;
/** Additional time per reel for stagger effect (milliseconds) */
const SPIN_STAGGER_TIME = 200;
/** Base number of positions to spin (higher = more rotations) */
const SPIN_BASE_TARGET = 15;
/** Additional positions per reel for stagger */
const SPIN_STAGGER_TARGET = 1;
/** Blur effect multiplier (higher = more blur at speed) */
const SPIN_BLUR_MULTIPLIER = 8;
/** Easing curve amount (0-1, affects deceleration) */
const SPIN_EASING_AMOUNT = 0.2;
/** Cascade drop duration in seconds */
const CASCADE_DROP_DURATION = 0.35;
/** Cascade fade duration in seconds */
const CASCADE_FADE_DURATION = 0.15;
/** Cascade hold duration in seconds */
const CASCADE_HOLD_DURATION = 0.4;
/** Smooth transition from spin to grid in seconds */
const SPIN_TO_GRID_TRANSITION_DURATION = 0.3;
/** Apply final textures in last 10% of spin tween to prevent flicker */
const FINAL_TEXTURE_PRELOAD_PHASE = 0.9;

/**
 * GridRenderer - Renders slot grid with spin and cascade animations
 */
export default class GridRenderer {
  /**
   * Creates a new GridRenderer instance
   * 
   * @param {Object} options - Configuration options
   * @param {PIXI.Application} options.app - PixiJS application
   * @param {number} options.columns - Number of columns (reels)
   * @param {number} options.rows - Number of rows (default, may vary for Megaways)
   * @param {PIXI.Texture} [options.textureBehindSymbols] - Background texture for grid
   * @param {number} [options.cellSize] - Cell size in pixels (default: 140)
   * @param {number} [options.symbolPadding] - Symbol padding in pixels (default: 0)
   * @param {number} [options.cellGap] - Gap between cells in pixels (default: 5)
   * @param {number} [options.tablePadding] - Table padding multiplier (default: 0.24)
   */
  constructor({
    app,
    columns,
    rows,
    textureBehindSymbols,
    cellSize = DEFAULT_CELL_SIZE,
    symbolPadding = DEFAULT_SYMBOL_PADDING,
    cellGap = DEFAULT_CELL_GAP,
    tablePadding = 0.24
  }) {
    this.app = app;
    this.columns = columns;
    this.rows = rows; // Keep for backward compatibility, but use maxRows for Megaways
    this.maxRows = rows; // Maximum possible rows for Megaways
    this.textureBehindSymbols = textureBehindSymbols;
    this.cellSize = cellSize;
    this.symbolSize = cellSize - symbolPadding * 2;
    this.reelWidth = cellSize;
    this.container = new PIXI.Container();
    this.container.visible = true;
    this.container.alpha = 1;
    this.symbolRenderer = new SymbolRenderer();
    this.reels = [];
    this.tweening = [];
    this.running = false;
    this.availableSymbols = [];
    this.currentAssets = null;
    this.tickerCallback = null;
    this.onSpinComplete = null;
    this.lastSymbolMatrix = null;
    this.resultMatrix = null;
    this.pendingWinningIndices = null;
    this.isSpinning = false;
    this.isCascading = false;
    this.isTurboMode = false;
    this.reelHeights = null; // Array of heights per reel for Megaways
    this.topReel = null; // Top reel data (final symbols from backend)
    this.topReelContainer = null; // Container for top reel
    this.topReelSpinning = false; // Boolean flag for spin state
    this.topReelPosition = 0; // Current horizontal position (for scrolling)
    this.topReelPreviousPosition = 0; // Previous position for blur calculation
    this.topReelSymbols = []; // Array of symbol sprites for the spinning reel
    this.topReelSpinLayer = null; // Container for spinning symbols
    this.topReelTargetPosition = 0; // Target position for spin animation
    this.topReelBlur = null; // Blur filter for top reel
    this.topReelTween = null; // GSAP tween for top reel animation
    this.size = {
      width: this.reelWidth * this.columns,
      height: this.symbolSize * this.maxRows
    };
    this.tableSprite = null;
    this.tablePadding = tablePadding;
  }

  /**
   * Sets reel heights for Megaways support
   * 
   * Updates variable reel heights per column. Used for Megaways games where
   * each column can have a different number of rows.
   * 
   * @param {Array<number>} reelHeights - Array of heights per column
   * @returns {void}
   */
  setReelHeights(reelHeights) {
    this.reelHeights = reelHeights;
    if (reelHeights && reelHeights.length > 0) {
      this.maxRows = Math.max(...reelHeights); // Update max rows
      this.size.height = this.symbolSize * this.maxRows; // Update grid height
      
      // Don't rebuild during spin - wait for next spin to rebuild
      // Rebuilding during spin would break the animation
      // Reels will be rebuilt on next startSpin() call
    }
  }

  /**
   * Sets top reel symbols
   * 
   * Top reel is a horizontal scrolling reel above columns 2-5 (indices 1-4).
   * Used for special game features.
   * 
   * @param {Array<string>} topReelSymbols - Array of symbol codes for top reel
   * @returns {void}
   */
  setTopReel(topReelSymbols) {
    this.topReel = topReelSymbols;
  }

  /**
   * Sets turbo mode on/off
   * 
   * Turbo mode speeds up animations by 60% (40% of normal duration).
   * 
   * @param {boolean} enabled - True to enable turbo mode
   * @returns {void}
   */
  setTurboMode(enabled) {
    this.isTurboMode = enabled;
  }

  /**
   * Initializes the grid renderer
   * 
   * Adds container to scene, draws background, and sets up ticker callback.
   * 
   * @param {PIXI.Container} sceneLayer - Scene layer container
   * @returns {void}
   */
  initialize(sceneLayer) {
    sceneLayer.addChild(this.container);
    this.drawBackground();
    this.setupTicker();
  }

  setTablePadding(padding) {
    if (Number.isFinite(padding) && padding >= 0) {
      this.tablePadding = padding;
      this._applyTableScale();
    }
  }

  /**
   * Enters spin mode
   * 
   * Shows spin layer (animated symbols) and hides grid layer (static symbols).
   * Used when reels are spinning.
   * 
   * @returns {void}
   */
  enterSpinMode() {
    this.isSpinning = true;
    this.isCascading = false;

    // Show spin layer, hide grid layer for all reels
    this.reels.forEach((reel) => {
      if (!reel) {
        return;
      }
      if (reel.spinLayer) {
        reel.spinLayer.visible = true;
      }
      if (Array.isArray(reel.symbols)) {
        reel.symbols.forEach((symbol) => {
          if (symbol) {
            symbol.visible = true;
            symbol.alpha = 1;
          }
        });
      }
      if (reel.gridLayer) {
        reel.gridLayer.visible = false;
      }
      if (Array.isArray(reel.gridSprites)) {
        reel.gridSprites.forEach((sprite) => {
          if (sprite) {
            sprite.visible = false;
          }
        });
      }
    });
    
    // Show top reel if it exists
    if (this.topReelContainer) {
      this.topReelContainer.visible = true;
    }
    if (this.topReelSpinLayer) {
      this.topReelSpinLayer.visible = true;
    }
  }

  /**
   * Enters grid mode
   * 
   * Shows grid layer (static symbols) and hides spin layer (animated symbols).
   * Used during cascades when symbols need to be evaluated for wins.
   * 
   * @returns {void}
   */
  enterGridMode() {
    this.isSpinning = false;
    this.isCascading = true;

    this.reels.forEach((reel) => {
      if (!reel) {
        return;
      }
      if (reel.spinLayer) {
        reel.spinLayer.visible = false;
      }
      if (Array.isArray(reel.symbols)) {
        reel.symbols.forEach((symbol) => {
          if (symbol) {
            symbol.visible = false;
          }
        });
      }
      if (reel.gridLayer) {
        reel.gridLayer.visible = true;
      }
      if (Array.isArray(reel.gridSprites)) {
        reel.gridSprites.forEach((sprite) => {
          if (sprite) {
            sprite.visible = true;
          }
        });
      }
    });
    
    // Keep top reel visible in grid mode to show final symbols
    // Hide spin layer but show the container with final symbols
    if (this.topReelContainer) {
      this.topReelContainer.visible = true;
    }
    if (this.topReelSpinLayer) {
      // Keep spin layer visible so we can show final symbols in it
      this.topReelSpinLayer.visible = true;
    }
  }

  drawBackground() {
    const texture = this.textureBehindSymbols ?? PIXI.Texture.WHITE;
    const sprite = new PIXI.Sprite(texture);
    sprite.anchor.set(0.5);
    this.tableSprite = sprite;
    this._applyTableScale();
    // Add table sprite first so it's behind the reels
    this.container.addChildAt(sprite, 0);
  }

  buildReels(assets) {
    // Clear existing reels
    this.reels.forEach(reel => {
      if (reel.container && !reel.container.destroyed) {
        reel.container.destroy({ children: true });
      }
      if (reel.mask && !reel.mask.destroyed) {
        reel.mask.destroy();
      }
    });
    this.reels = [];

    // Clear top reel container if it exists
    if (this.topReelContainer) {
      this.topReelContainer.destroy({ children: true });
      this.topReelContainer = null;
    }

    // Get available symbol textures
    const slotTextures = this.availableSymbols
      .map(alias => assets.get(alias))
      .filter(texture => texture != null);

    if (slotTextures.length === 0) {
      console.warn('No symbol textures available for reels');
      return;
    }

    // Set default reel heights if not set (for initial display)
    if (!this.reelHeights || this.reelHeights.length !== this.columns) {
      // Default to fixed height (rows) for each reel
      this.reelHeights = Array(this.columns).fill(this.rows);
    }

    // Build top reel if needed (above reels 2-5, which are indices 1-4)
    // Top reel covers reels 2-5 (indices 1-4) - 4 symbols total
    const topReelCovers = [1, 2, 3, 4];
    const topReelSymbolCount = 4; // Number of visible symbols
    
    if (topReelCovers.length > 0) {
      // Clear existing top reel
      if (this.topReelContainer) {
        this.topReelContainer.destroy({ children: true });
      }
      
      this.topReelContainer = new PIXI.Container();
      this.topReelContainer.y = -this.symbolSize; // Above main grid
      this.topReelContainer.x = 0;
      this.topReelContainer.visible = true; // Ensure visible
      
      // Create spin layer for top reel
      this.topReelSpinLayer = new PIXI.Container();
      this.topReelSpinLayer.visible = true; // Ensure visible
      this.topReelContainer.addChild(this.topReelSpinLayer);
      
      // Create blur filter for top reel (same as vertical reels)
      this.topReelBlur = new PIXI.BlurFilter();
      this.topReelBlur.blurX = 0;
      this.topReelBlur.blurY = 0;
      this.topReelContainer.filters = [this.topReelBlur];
      
      // Create multiple symbol instances for smooth horizontal scrolling (8-10 symbols)
      const topReelBufferSymbols = 6; // Extra symbols for smooth scrolling
      const totalTopReelSymbols = topReelSymbolCount + topReelBufferSymbols;
      this.topReelSymbols = [];
      
      for (let i = 0; i < totalTopReelSymbols; i++) {
        // Use random texture initially, will be updated during spin
        const texture = slotTextures[Math.floor(Math.random() * slotTextures.length)];
        const symbol = new PIXI.Sprite(texture);
        
        symbol.scale.x = symbol.scale.y = Math.min(
          this.symbolSize / symbol.texture.width,
          this.symbolSize / symbol.texture.height
        );
        
        // Position symbols horizontally (right to left scrolling)
        // Symbols are positioned from right to left, so we start from the right
        // Initial positions: symbols should fill the visible area (4 symbols above reels 2-5)
        // The visible area is above reels 2-5 (indices 1-4), so symbols should be positioned
        // starting from the right edge of reel 5 (index 4)
        const rightmostX = topReelCovers[topReelCovers.length - 1] * this.reelWidth + this.reelWidth;
        // Position symbols in a continuous strip, starting from the right
        // Symbol 0 is at the rightmost position, symbol 1 is to its left, etc.
        // Initially, first 4 symbols should be visible above reels 2-5
        symbol.x = rightmostX - (i * this.reelWidth);
        symbol.y = Math.round((this.symbolSize - symbol.height) / 2);
        symbol.visible = true; // Ensure symbols are visible
        symbol.alpha = 1;
        
        // Ensure symbols are within the visible mask area initially
        // The mask covers reels 1-4 (indices 1-4), so symbols should be positioned there
        
        this.topReelSymbols.push(symbol);
        this.topReelSpinLayer.addChild(symbol);
      }
      
      // Create mask to show only the 4 visible symbols (one per covered reel)
      // Mask must be positioned at the same Y as the container for proper alignment
      const mask = new PIXI.Graphics();
      mask.beginFill(0xffffff);
      const maskStartX = topReelCovers[0] * this.reelWidth;
      const maskWidth = topReelSymbolCount * this.reelWidth;
      mask.drawRect(maskStartX, 0, maskWidth, this.symbolSize);
      mask.endFill();
      mask.x = 0;
      mask.y = -this.symbolSize; // Align with topReelContainer Y position
      this.topReelContainer.mask = mask;
      this.container.addChild(mask);
      
      // Reset position
      this.topReelPosition = 0;
      this.topReelPreviousPosition = 0;
      this.topReelTargetPosition = 0;
      
      // Ensure container is visible and added to scene
      this.topReelContainer.visible = true;
      this.container.addChild(this.topReelContainer);
    }

    // Build reels (one per column) with masking
    for (let i = 0; i < this.columns; i++) {
      const reelContainer = new PIXI.Container();
      // Round positions to prevent sub-pixel jitter
      reelContainer.x = Math.round(i * this.reelWidth);
      reelContainer.y = 0; // Fixed Y position - never changes

      // Get reel height (variable for Megaways, fixed otherwise)
      const reelHeight = this.reelHeights && this.reelHeights[i] ? this.reelHeights[i] : this.rows;
      const hasTopReel = this.topReel && [1, 2, 3, 4].includes(i);

      // Create mask to clip symbols to visible area
      // Mask starts at symbolSize to hide the top buffer row
      // IMPORTANT: Mask must be a child of the container being masked OR in the same parent
      // We'll add it as a child of reelContainer so it's in local coordinates
      const mask = new PIXI.Graphics();
      mask.beginFill(0xffffff);
      const maskY = this.symbolSize; // Always start at symbolSize to hide buffer
      const maskHeight = this.symbolSize * reelHeight;
      mask.drawRect(0, maskY, this.reelWidth, maskHeight);
      mask.endFill();
      // Position mask in local coordinates (relative to reelContainer)
      mask.x = 0;
      mask.y = 0;
      // Add mask as child of reelContainer FIRST (before other children)
      reelContainer.addChildAt(mask, 0);
      // Set mask on reelContainer - this will clip all children (spinLayer, gridLayer)
      reelContainer.mask = mask;

      // Ensure reel containers are added after table sprite so they render on top
      this.container.addChild(reelContainer);

      const spinLayer = new PIXI.Container();
      const gridLayer = new PIXI.Container();
      gridLayer.visible = false;
      reelContainer.addChild(spinLayer);
      reelContainer.addChild(gridLayer);

      const blur = new PIXI.BlurFilter();
      blur.blurX = 0;
      blur.blurY = 0;
      reelContainer.filters = [blur];

      const reel = {
        container: reelContainer,
        symbols: [],
        gridSprites: new Array(reelHeight).fill(null),
        spinLayer,
        gridLayer,
        position: 0,
        previousPosition: 0,
        blur: blur,
        mask: mask,
        targetPosition: 0,
        index: i, // Column index for mapping to result matrix
        finalTexturesApplied: false, // Flag to track if final textures have been applied
        height: reelHeight // Store reel height
      };

      // Build symbols for this reel - reelHeight + 1 symbols (including buffer)
      const symbolCount = reelHeight + 1;
      for (let j = 0; j < symbolCount; j++) {
        const texture = slotTextures[Math.floor(Math.random() * slotTextures.length)];
        const symbol = new PIXI.Sprite(texture);
        
        symbol.scale.x = symbol.scale.y = Math.min(
          this.symbolSize / symbol.texture.width,
          this.symbolSize / symbol.texture.height
        );
        
        // Position symbols using 0-based coordinate system (row 0 at y=0)
        // Buffer symbol for looping is at j=reelHeight, which is outside the visible mask
        symbol.y = j * this.symbolSize;
        symbol.x = Math.round((this.reelWidth - symbol.width) / 2);
        
        reel.symbols.push(symbol);
        spinLayer.addChild(symbol);
      }

      this.reels.push(reel);
    }
  }

  setupTicker() {
    // Remove existing ticker if any
    if (this.tickerCallback) {
      this.app.ticker.remove(this.tickerCallback);
    }

    // Create new ticker callback
    this.tickerCallback = () => {
      // Only update if we have reels
      if (this.reels.length === 0) return;

      // Only allow spin layout updates if spinning AND no result matrix (final textures not applied yet)
      // Once resultMatrix is set, we should preserve final textures, not overwrite with random ones
      const allowSpinLayout = this.isSpinning && !this.resultMatrix;
      
      // Update top reel position (horizontal scrolling)
      if (this.topReelSpinning && this.topReelSpinLayer && this.topReelSymbols.length > 0) {
        const positionDelta = this.topReelPosition - this.topReelPreviousPosition;
        if (this.topReelBlur) {
          this.topReelBlur.blurX = allowSpinLayout ? Math.abs(positionDelta) * SPIN_BLUR_MULTIPLIER : 0;
        }
        this.topReelPreviousPosition = this.topReelPosition;
        
        // Update symbol positions horizontally (right to left)
        const topReelCovers = [1, 2, 3, 4];
        const symbolSpacing = this.reelWidth;
        const totalSymbolWidth = this.topReelSymbols.length * symbolSpacing;
        
        // Calculate symbol positions using EXACT same smooth modulo approach as vertical reels
        // Vertical reels: symbol.y = ((reel.position + j) % reel.symbols.length) * symbolSize
        // Horizontal: same pattern but for X axis (right-to-left, so inverted)
        const rightmostX = topReelCovers[topReelCovers.length - 1] * this.reelWidth + this.reelWidth;
        
        for (let i = 0; i < this.topReelSymbols.length; i++) {
          const symbol = this.topReelSymbols[i];
          if (!symbol || symbol.destroyed) continue;
          
          // Match vertical reel formula exactly: ((position + index) % length) * spacing
          // Position is negative for right-to-left, so normalize it first
          let pos = this.topReelPosition;
          // Normalize to positive range for modulo (add large multiple to ensure positive)
          pos = (pos % totalSymbolWidth + totalSymbolWidth) % totalSymbolWidth;
          
          // Use EXACT same formula as vertical: ((position + index) % length) * spacing
          // Vertical: symbol.y = ((reel.position + j) % reel.symbols.length) * symbolSize
          // Horizontal: symbol.x = rightmostX - ((pos + i * spacing) % totalSymbolWidth)
          const wrappedPos = ((pos + (i * symbolSpacing)) % totalSymbolWidth);
          
          // Position from right edge, moving left
          symbol.x = rightmostX - wrappedPos;
          
          // Update textures during spin (random symbols while spinning)
          // BUT: Don't overwrite if final textures have been applied
          if (allowSpinLayout && this.currentAssets && this.availableSymbols.length > 0 && Math.random() < 0.1 && !this.resultMatrix) {
            const slotTextures = this.availableSymbols
              .map(alias => this.currentAssets.get(alias))
              .filter(texture => texture != null);
            
            if (slotTextures.length > 0) {
              const randomTexture = slotTextures[Math.floor(Math.random() * slotTextures.length)];
              if (randomTexture) {
                symbol.texture = randomTexture;
                const scale = Math.min(
                  this.symbolSize / symbol.texture.width,
                  this.symbolSize / symbol.texture.height
                );
                symbol.scale.set(scale);
              }
            }
          } else if (this.resultMatrix && allowSpinLayout) {
            // DEBUG: Log if we're trying to update textures when resultMatrix exists
            console.warn('[GridRenderer] TICKER: Attempted to update top reel texture but resultMatrix exists!', {
              hasResultMatrix: !!this.resultMatrix,
              allowSpinLayout,
              isSpinning: this.isSpinning
            });
          }
        }
      }

      // Update the slots
      for (let i = 0; i < this.reels.length; i++) {
        const reel = this.reels[i];
        if (!reel || !reel.container || reel.container.destroyed) continue;

        const positionDelta = reel.position - reel.previousPosition;
        reel.blur.blurY = allowSpinLayout ? Math.abs(positionDelta) * SPIN_BLUR_MULTIPLIER : 0;
        reel.previousPosition = reel.position;

        for (let j = 0; j < reel.symbols.length; j++) {
          const symbol = reel.symbols[j];
          if (!symbol || symbol.destroyed) continue;

          const prevy = symbol.y;
          // Use 0-based coordinate system: row 0 at y=0, consistent with grid layer
          // The modulo loop handles the buffer symbol, which stays outside the visible mask
          // Calculate position with wrapping
          const newY = ((reel.position + j) % reel.symbols.length) * this.symbolSize;
          symbol.y = newY;
          
          // Ensure symbol stays within reasonable bounds (mask will clip, but this prevents extreme positions)
          // Symbols should be between -symbolSize (buffer above) and (reelHeight + 1) * symbolSize (buffer below)
          const maxY = (reel.height || this.rows) * this.symbolSize + this.symbolSize;
          if (symbol.y < -this.symbolSize * 2 || symbol.y > maxY) {
            // Wrap to valid range if somehow out of bounds
            symbol.y = ((symbol.y % maxY) + maxY) % maxY;
          }

          // Update textures randomly during spin, but ONLY if final textures haven't been applied
          // Once resultMatrix is set, we should use final textures, not random ones
          if (
            allowSpinLayout &&
            this.running &&
            !this.resultMatrix && // CRITICAL: Don't overwrite if result is known
            prevy >= this.rows * this.symbolSize &&
            symbol.y < this.rows * this.symbolSize &&
            this.currentAssets
          ) {
            const slotTextures = this.availableSymbols
              .map(alias => this.currentAssets.get(alias))
              .filter(texture => texture != null);

            if (slotTextures.length > 0) {
              symbol.texture = slotTextures[Math.floor(Math.random() * slotTextures.length)];
              symbol.scale.x = symbol.scale.y = Math.min(
                this.symbolSize / symbol.texture.width,
                this.symbolSize / symbol.texture.height
              );
              symbol.x = Math.round((this.reelWidth - symbol.width) / 2);
            }
          } else if (this.resultMatrix && allowSpinLayout && this.running) {
            // DEBUG: Log if we're trying to update textures when resultMatrix exists
            console.warn('[GridRenderer] TICKER: Attempted to update reel texture but resultMatrix exists!', {
              reel: i,
              symbolIndex: j,
              hasResultMatrix: !!this.resultMatrix,
              allowSpinLayout,
              isRunning: this.running,
              isSpinning: this.isSpinning
            });
          }
        }
      }

        // Update tweening
        if (this.tweening.length > 0) {
          const now = Date.now();
          const remove = [];

          for (let i = 0; i < this.tweening.length; i++) {
            const t = this.tweening[i];
            const phase = Math.min(1, (now - t.start) / t.time);

            t.object[t.property] = this.lerp(
              t.propertyBeginValue,
              t.target,
              t.easing(phase)
            );

            if (t.change) t.change(t);

            // Preload final symbols into the spin layer shortly before stop
            // NOTE: This should not be needed since we apply textures immediately in preloadSpinResult
            // But keeping it as a fallback
            if (
              this.resultMatrix &&
              t.property === 'position' &&
              typeof t.object === 'object' &&
              t.object &&
              typeof t.object.targetPosition === 'number'
            ) {
              const reel = t.object;

              if (!reel.finalTexturesApplied && phase >= FINAL_TEXTURE_PRELOAD_PHASE) {
                console.log(`[GridRenderer] TICKER: Applying textures to reel ${reel.index} at phase ${phase.toFixed(2)} (fallback)`);
                this._applyResultToReelSpinLayer(reel);
                reel.finalTexturesApplied = true;
              }
            }

          if (phase === 1) {
            t.object[t.property] = t.target;
            if (t.complete) t.complete(t);
            remove.push(t);
          }
        }

        // Remove completed tweens
        for (let i = remove.length - 1; i >= 0; i--) {
          const index = this.tweening.indexOf(remove[i]);
          if (index !== -1) {
            this.tweening.splice(index, 1);
          }
        }
      }
    };

    this.app.ticker.add(this.tickerCallback);
  }

  /**
   * Starts the spin animation
   * 
   * Begins visual reel spinning with staggered timing. Each reel starts slightly
   * after the previous one for a cascading effect. Supports turbo mode.
   * 
   * Flow:
   * 1. Validate not already spinning
   * 2. Build reels if needed
   * 3. Enter spin mode
   * 4. Reset texture flags
   * 5. Start each reel with staggered timing
   * 6. Start top reel (horizontal scrolling)
   * 
   * @param {PIXI.Assets} assets - PixiJS Assets API
   * @returns {void}
   */
  startSpin(assets) {
    if (this.running) {
      console.warn('Spin already running');
      return;
    }
    
    this.running = true;
    this.currentAssets = assets;
    this.onSpinComplete = null;
    this.resultMatrix = null;

    // Build or rebuild reels if needed
    // Rebuild if reel heights have changed or reels don't exist
    const needsRebuild = this.reels.length === 0 || 
      (this.reelHeights && this.reels.some((reel, i) => {
        const expectedHeight = this.reelHeights[i] || this.rows;
        return reel.height !== expectedHeight;
      }));
    
    if (needsRebuild) {
      console.log('[GridRenderer] startSpin: Building/rebuilding reels with current heights', this.reelHeights);
      this.buildReels(assets);
    }

    this.enterSpinMode(); // Show spin layer, hide grid layer

    // Reset final texture flags for all reels
    // These flags track if final textures have been applied during spin
    for (let i = 0; i < this.reels.length; i++) {
      const reel = this.reels[i];
      if (reel) {
        reel.finalTexturesApplied = false;
      }
    }

    // Start each reel spinning with staggered timing
    // Reels start left to right with increasing delay
    for (let i = 0; i < this.reels.length; i++) {
      const reel = this.reels[i];
      if (!reel) continue;

      const extra = Math.floor(Math.random() * 3); // Random variation
      const target = reel.position + SPIN_BASE_TARGET + i * SPIN_STAGGER_TARGET + extra;
      // Turbo mode: reduce spin time by 60% (faster spins)
      const baseTime = this.isTurboMode ? SPIN_BASE_TIME * 0.4 : SPIN_BASE_TIME;
      const staggerTime = this.isTurboMode ? SPIN_STAGGER_TIME * 0.4 : SPIN_STAGGER_TIME;
      const time = baseTime + i * staggerTime + extra * staggerTime;
      reel.targetPosition = target;

      // Animate reel position with easing
      this.tweenTo(
        reel,
        'position',
        target,
        time,
        this.backout(SPIN_EASING_AMOUNT), // Easing function for smooth deceleration
        null,
        i === this.reels.length - 1 ? () => this.reelsComplete() : null // Last reel calls completion
      );
    }
    
    // Start top reel spinning (horizontal, right to left)
    if (this.topReelContainer && this.topReelSpinLayer && this.topReelSymbols.length > 0) {
      this.topReelSpinning = true;
      this.topReelPreviousPosition = this.topReelPosition;
      
      // Calculate target position for horizontal spin (right to left = negative movement)
      // Use same timing and speed as the first vertical reel (reel 0) for consistent speed
      const firstReelIndex = 0;
      const extra = Math.floor(Math.random() * 3);
      const baseTime = this.isTurboMode ? SPIN_BASE_TIME * 0.4 : SPIN_BASE_TIME;
      const staggerTime = this.isTurboMode ? SPIN_STAGGER_TIME * 0.4 : SPIN_STAGGER_TIME;
      // Use same timing as first reel to match spin speed
      const time = baseTime + firstReelIndex * staggerTime + extra * staggerTime;
      
      // Target position: spin horizontally (negative for right-to-left)
      // Use same distance as first reel to match spin speed (positions per millisecond)
      const spinDistance = SPIN_BASE_TARGET + firstReelIndex * SPIN_STAGGER_TARGET + extra;
      this.topReelTargetPosition = this.topReelPosition - spinDistance;
      
      // Create GSAP tween for top reel (horizontal animation)
      if (this.topReelTween) {
        this.topReelTween.kill();
      }
      
      this.topReelTween = gsap.to(this, {
        topReelPosition: this.topReelTargetPosition,
        duration: time / 1000, // Convert ms to seconds
        ease: this.backout(SPIN_EASING_AMOUNT),
        // GSAP will update topReelPosition smoothly, ticker will read it each frame
        onComplete: () => {
          this.topReelSpinning = false;
          this.topReelPosition = this.topReelTargetPosition;
          this.topReelPreviousPosition = this.topReelTargetPosition;
          if (this.topReelBlur) {
            this.topReelBlur.blurX = 0;
          }
        }
      });
    }
  }

  /**
   * Stops the spin animation immediately
   * 
   * Used for error recovery or when spin needs to be stopped.
   * Removes all blur effects and notifies completion.
   * 
   * @returns {void}
   */
  stopSpin() {
    if (!this.running && !this.onSpinComplete) {
      return;
    }

    // Stop all tweens immediately
    this.tweening = [];
    this.running = false;
    this.isSpinning = false;
    this.isCascading = false;

    // Remove blur from all reels
    for (let i = 0; i < this.reels.length; i++) {
      const reel = this.reels[i];
      if (reel) {
        reel.blur.blurY = 0;
      }
    }
    
    // Stop top reel animation
    if (this.topReelTween) {
      this.topReelTween.kill();
      this.topReelTween = null;
    }
    this.topReelSpinning = false;
    if (this.topReelBlur) {
      this.topReelBlur.blurX = 0;
    }

    this._notifySpinComplete();
  }

  reelsComplete() {
    console.log('[GridRenderer] reelsComplete: All reels finished spinning', {
      hasResultMatrix: !!this.resultMatrix,
      finalTexturesApplied: this.reels.map((r, i) => ({ reel: i, applied: r?.finalTexturesApplied }))
    });
    
    this.running = false;
    this.isSpinning = false;
    // Ensure all reels are at their exact target positions to prevent misalignment
    for (let i = 0; i < this.reels.length; i++) {
      const reel = this.reels[i];
      if (reel) {
        if (reel.blur) {
          reel.blur.blurY = 0;
        }
        // Snap to exact target position to prevent any sub-pixel misalignment
        if (Number.isFinite(reel.targetPosition)) {
          reel.position = reel.targetPosition;
          reel.previousPosition = reel.targetPosition;
        }
          // Force update symbol positions to exact final positions
          if (reel.symbols) {
            // Log what symbols are visible in this reel after stopping
            const visibleSymbols = [];
            const reelHeight = reel.height || (this.reelHeights && this.reelHeights[i]) || this.rows;
            const availableHeight = this.symbolSize * reelHeight;
            const symbolSpacing = availableHeight / reelHeight;
            const visibleStart = this.symbolSize; // Mask starts here
            const visibleEnd = visibleStart + availableHeight;
            
            for (let j = 0; j < reel.symbols.length; j++) {
              const symbol = reel.symbols[j];
              if (symbol && !symbol.destroyed) {
                // For spinning symbols, use fixed spacing for smooth animation
                symbol.y = ((reel.position + j) % reel.symbols.length) * this.symbolSize;
                // Check if this symbol is in the visible area
                if (symbol.y >= visibleStart && symbol.y < visibleEnd) {
                  const textureUrl = symbol.texture?.baseTexture?.resource?.url || 'unknown';
                  const symbolAlias = this.availableSymbols.find(alias => {
                    const tex = this.currentAssets?.get(alias);
                    return tex?.baseTexture?.resource?.url === textureUrl;
                  }) || 'UNKNOWN';
                  // Calculate which logical row this symbol represents
                  const relativeY = symbol.y - visibleStart;
                  const row = Math.floor(relativeY / symbolSpacing);
                  visibleSymbols.push({ row, symbol: symbolAlias });
                }
              }
            }
          if (visibleSymbols.length > 0) {
            const symbolsList = visibleSymbols.sort((a, b) => a.row - b.row).map(v => v.symbol).join(', ');
            console.log(`[GridRenderer] reelsComplete: Reel ${i} visible symbols after stop (bottom to top):`, symbolsList);
            
            // Compare with expected symbols from resultMatrix
            if (this.resultMatrix) {
              const expectedSymbols = [];
              const gridRows = Math.ceil(this.resultMatrix.length / this.columns);
              const maxHeight = gridRows - 1;
              for (let row = 0; row < reelHeight; row++) {
                const matrixRow = row;
                // Use correct index calculation: (maxHeight - matrixRow) * columns + col
                const matrixIndex = (maxHeight - matrixRow) * this.columns + i;
                if (matrixIndex < this.resultMatrix.length) {
                  expectedSymbols.push(this.resultMatrix[matrixIndex] || 'NULL');
                } else {
                  expectedSymbols.push('OUT_OF_BOUNDS');
                }
              }
              console.log(`[GridRenderer] reelsComplete: Reel ${i} expected symbols (from backend, bottom to top):`, expectedSymbols.join(', '));
              
              // Check if they match
              const visibleList = visibleSymbols.sort((a, b) => a.row - b.row).map(v => v.symbol);
              const match = visibleList.length === expectedSymbols.length && 
                           visibleList.every((sym, idx) => sym === expectedSymbols[idx]);
              if (!match) {
                console.error(`[GridRenderer] reelsComplete: MISMATCH in reel ${i}!`, {
                  visible: visibleList,
                  expected: expectedSymbols
                });
              } else {
                console.log(`[GridRenderer] reelsComplete: Reel ${i} symbols MATCH backend results ✓`);
              }
            }
          }
        }
      }
    }
    
    // Ensure top reel is at exact target position and apply final textures
    if (this.topReelSpinLayer && this.topReelSymbols.length > 0) {
      this.topReelSpinning = false;
      if (Number.isFinite(this.topReelTargetPosition)) {
        this.topReelPosition = this.topReelTargetPosition;
        this.topReelPreviousPosition = this.topReelTargetPosition;
      }
      if (this.topReelBlur) {
        this.topReelBlur.blurX = 0;
      }
      
      // Update top reel symbols to final positions
      // Textures should already be applied by _applyResultToTopReelSpinLayer in preloadSpinResult
      // Just ensure positions are correct
      const topReelCovers = [1, 2, 3, 4];
      const symbolSpacing = this.reelWidth;
      const totalSymbolWidth = this.topReelSymbols.length * symbolSpacing;
      
      // Base X position: rightmost edge of the visible area (end of reel 5)
      const rightmostX = topReelCovers[topReelCovers.length - 1] * this.reelWidth + this.reelWidth;
      
      // Normalize position for wrapping
      let normalizedPos = this.topReelPosition;
      if (normalizedPos < 0) {
        normalizedPos = (normalizedPos % totalSymbolWidth + totalSymbolWidth) % totalSymbolWidth;
      } else {
        normalizedPos = normalizedPos % totalSymbolWidth;
      }
      
      for (let i = 0; i < this.topReelSymbols.length; i++) {
        const symbol = this.topReelSymbols[i];
        if (!symbol || symbol.destroyed) continue;
        
        // Position symbols horizontally with wrapping (same logic as ticker)
        const wrappedPos = ((normalizedPos + (i * symbolSpacing)) % totalSymbolWidth);
        let symbolX = rightmostX - wrappedPos;
        
        // Wrap symbols around for continuous scrolling
        if (symbolX < topReelCovers[0] * this.reelWidth - totalSymbolWidth) {
          symbolX += totalSymbolWidth;
        } else if (symbolX > rightmostX + symbolSpacing) {
          symbolX -= totalSymbolWidth;
        }
        
        symbol.x = symbolX;
      }
      
      // Final textures should already be applied by preloadSpinResult
      // Just ensure the visible symbols (first 4) are positioned correctly above their reels
      for (let i = 0; i < topReelCovers.length && i < this.topReelSymbols.length; i++) {
        const symbol = this.topReelSymbols[i];
        if (symbol && !symbol.destroyed) {
          // Position symbol centered above its reel
          const col = topReelCovers[i];
          symbol.x = col * this.reelWidth + (this.reelWidth / 2) - (symbol.width / 2);
          symbol.y = Math.round((this.symbolSize - symbol.height) / 2);
        }
      }
    }
    
    this._notifySpinComplete();
  }

  tweenTo(object, property, target, time, easing, onchange, oncomplete) {
    const tween = {
      object,
      property,
      propertyBeginValue: object[property],
      target,
      easing,
      time,
      change: onchange,
      complete: oncomplete,
      start: Date.now()
    };

    this.tweening.push(tween);
    return tween;
  }

  lerp(a1, a2, t) {
    return a1 * (1 - t) + a2 * t;
  }

  backout(amount) {
    return (t) => --t * t * ((amount + 1) * t + amount) + 1;
  }

  setAvailableSymbols(symbols) {
    this.availableSymbols = symbols;
  }

  renderSymbols(symbolMatrix, assets) {
    this.renderGridFromMatrix(symbolMatrix, assets);
  }

  renderGridFromMatrix(symbolMatrix, assets) {
    // For Megaways, grid matrix may have variable structure
    // Calculate expected size: maxRows * columns (may include nulls)
    const expectedSize = this.maxRows * this.columns;
    if (!symbolMatrix || symbolMatrix.length < this.columns) {
      return;
    }

    this.currentAssets = assets;

    if (this.reels.length === 0) {
      this.buildReels(assets);
    }

    // Reconstruct grid structure from flat matrix
    // Backend creates matrix row-major: rows from maxHeight down to 0
    // Row maxHeight = top reel (for columns with top reel)
    // Rows maxHeight-1 to 0 = main reel symbols
    const gridRows = Math.ceil(symbolMatrix.length / this.columns);
    const maxHeight = gridRows - 1; // Backend uses maxHeight as top row
    
    // Debug: Log matrix structure
    console.log(`[GridRenderer] renderGridFromMatrix: matrixLength=${symbolMatrix.length}, columns=${this.columns}, gridRows=${gridRows}, maxHeight=${maxHeight}`);
    if (symbolMatrix.length > 0) {
      console.log(`[GridRenderer] First 12 symbols: ${symbolMatrix.slice(0, 12).join(', ')}`);
      if (symbolMatrix.length > 12) {
        console.log(`[GridRenderer] Last 12 symbols: ${symbolMatrix.slice(-12).join(', ')}`);
      }
    }

    for (let col = 0; col < this.columns; col++) {
      const reel = this.reels[col];
      if (!reel) continue;

      const reelHeight = reel.height || (this.reelHeights && this.reelHeights[col]) || this.rows;
      if (!reel.gridSprites) {
        reel.gridSprites = new Array(reelHeight).fill(null);
      }

      // Determine which rows belong to this reel
      // Top reel is at row maxHeight, main reel symbols below
      const hasTopReel = this.topReel && [1, 2, 3, 4].includes(col);

      for (let row = 0; row < reelHeight; row++) {
        // Map reel row to grid matrix row
        // Backend: row maxHeight = top reel, rows maxHeight-1 to 0 = main symbols
        // Frontend: row 0 = bottom of reel, row h-1 = top of reel
        // 
        // Backend logic:
        //   - For matrix row r (where r < maxHeight), it uses mainRow = r to index ReelColumn
        //   - It only adds a symbol if mainRow < reelHeight
        //   - So for a reel with height h, symbols are at matrix rows where r < h
        //   - This means: matrix rows 0, 1, 2, ..., h-1 contain symbols
        //   - But the matrix has maxHeight rows (0 to maxHeight-1), so rows h to maxHeight-1 are null
        // 
        // However, the backend iterates from maxHeight down to 0, so:
        //   - Matrix row maxHeight-1 maps to ReelColumn[maxHeight-1] (if maxHeight-1 < h)
        //   - Matrix row maxHeight-2 maps to ReelColumn[maxHeight-2] (if maxHeight-2 < h)
        //   - ...
        //   - Matrix row h-1 maps to ReelColumn[h-1] (if h-1 < h) ✓
        //   - Matrix row h maps to ReelColumn[h] (if h < h) ✗ null
        //   - Matrix row 0 maps to ReelColumn[0] ✓
        // 
        // So for a reel with height h, symbols are at matrix rows: 0, 1, 2, ..., h-1
        // The topmost symbol (ReelColumn[h-1]) is at matrix row h-1
        // 
        // Frontend mapping should be: matrixRow = reelHeight - 1 - row
        // For row = h-1 (top): matrixRow = h-1 ✓
        // For row = 0 (bottom): matrixRow = h-1 ✓ Wait, that's wrong!
        // 
        // Actually, let me re-think this. The backend puts:
        //   - ReelColumn[0] (bottom) at matrix row maxHeight-1
        //   - ReelColumn[1] at matrix row maxHeight-2
        //   - ...
        //   - ReelColumn[h-1] (top) at matrix row maxHeight-h
        // 
        // But only if mainRow < h. So:
        //   - Matrix row maxHeight-1 has ReelColumn[maxHeight-1] only if maxHeight-1 < h
        //   - This is only true if maxHeight <= h, which is not always the case
        // 
        // I think the issue is that the backend's logic is: for matrix row r, use ReelColumn[r]
        // But only if r < reelHeight. So symbols are at matrix rows 0 to h-1.
        // 
        // But wait, the backend iterates from maxHeight down to 0, so row values go from maxHeight to 0.
        // For row = maxHeight-1, mainRow = maxHeight-1, and we check if maxHeight-1 < h.
        // If maxHeight > h, then maxHeight-1 >= h, so we add null.
        // 
        // So for a reel with height h where maxHeight > h:
        //   - Matrix rows maxHeight-1 down to h are null
        //   - Matrix rows h-1 down to 0 have symbols
        // 
        // The topmost symbol (ReelColumn[h-1]) is at matrix row h-1
        // The bottommost symbol (ReelColumn[0]) is at matrix row 0
        // 
        // Frontend mapping: matrixRow = h - 1 - row
        // For row = h-1 (top): matrixRow = 0 ✗ Should be h-1
        // 
        // Actually, I think the correct mapping is: matrixRow = reelHeight - 1 - row
        // But this gives: for row = h-1, matrixRow = 0, which is wrong.
        // 
        // Let me check the backend again. The backend does:
        //   for (var row = maxHeight; row >= 0; row--)
        //     if (row == maxHeight && hasTopReel) -> top reel
        //     else if (row < maxHeight)
        //       mainRow = row (for reels with top reel)
        //       if (mainRow < reelHeight) -> ReelColumn[mainRow]
        // 
        // So for row = maxHeight-1, mainRow = maxHeight-1, check if maxHeight-1 < h
        // For row = h-1, mainRow = h-1, check if h-1 < h ✓, so ReelColumn[h-1]
        // For row = 0, mainRow = 0, check if 0 < h ✓, so ReelColumn[0]
        // 
        // So symbols are at matrix rows: h-1, h-2, ..., 1, 0 (if maxHeight > h)
        // Or: maxHeight-1, maxHeight-2, ..., h, h-1, ..., 0 (but rows h to maxHeight-1 are null if maxHeight > h)
        // 
        // Actually, I think the symbols are at matrix rows: min(maxHeight-1, h-1), min(maxHeight-2, h-2), ..., 0
        // But only the ones where the row value < h have symbols.
        // 
        // So for a reel with height h:
        //   - If maxHeight <= h: symbols at rows maxHeight-1 down to 0
        //   - If maxHeight > h: symbols at rows h-1 down to 0, rows h to maxHeight-1 are null
        // 
        // The topmost symbol is always at matrix row h-1 (if h > 0)
        // The bottommost symbol is always at matrix row 0
        // 
        // Frontend mapping should be: matrixRow = reelHeight - 1 - row
        // For row = h-1 (top): matrixRow = 0 ✗ Should be h-1
        // 
        // I think the correct mapping is: matrixRow = reelHeight - 1 - row, but we need to handle the case where maxHeight > h.
        // Actually, I think: matrixRow = (reelHeight - 1) - row, which gives:
        //   row = h-1 -> matrixRow = 0
        //   row = 0 -> matrixRow = h-1
        // 
        // But we want:
        //   row = h-1 -> matrixRow = h-1
        //   row = 0 -> matrixRow = 0
        // 
        // So the mapping should be: matrixRow = row? No, that doesn't work either.
        // 
        // Let me think differently. The backend puts ReelColumn[i] at matrix row i (if i < h).
        // So ReelColumn[0] is at matrix row 0, ReelColumn[h-1] is at matrix row h-1.
        // 
        // Frontend: row 0 is bottom, row h-1 is top.
        // So: frontend row 0 should map to matrix row 0 (ReelColumn[0])
        //     frontend row h-1 should map to matrix row h-1 (ReelColumn[h-1])
        // 
        // Backend builds matrix by iterating from maxHeight down to 0
        // For each row r, it places ReelColumn[r] at matrix row r (if r < reelHeight)
        // So ReelColumn[0] is at matrix row 0, ReelColumn[h-1] is at matrix row h-1
        // Frontend row 0 (bottom) should map to ReelColumn[0] which is at matrix row 0
        // Frontend row h-1 (top) should map to ReelColumn[h-1] which is at matrix row h-1
        // Therefore: matrixRow = row (direct mapping)
        let matrixRow = row;

        // Skip top reel row (maxHeight) - we handle that separately
        if (matrixRow >= maxHeight) {
          continue;
        }
        
        // Backend only places symbols at matrix rows where row < reelHeight
        // So if matrixRow >= reelHeight, this position will be null for this reel
        // But we're iterating row from 0 to reelHeight-1, so matrixRow = row will always be < reelHeight

        if (matrixRow < 0 || matrixRow >= gridRows) continue;

        // Calculate matrix index: backend builds matrix row-major from maxHeight down to 0
        // Backend iterates: for (row = maxHeight; row >= 0; row--)
        //   - Row maxHeight is added first at array indices 0 to columns-1
        //   - Row maxHeight-1 is added next at array indices columns to 2*columns-1
        //   - ...
        //   - Row 0 is added last at array indices maxHeight*columns to (maxHeight+1)*columns-1
        // So matrix row r is at array position: (maxHeight - r) * columns
        // For column c: idx = (maxHeight - r) * columns + c
        // 
        // Backend logic for main reels (row < maxHeight):
        //   - Uses mainRow = row to index ReelColumn[mainRow]
        //   - Only adds symbol if mainRow < reelHeight
        //   - So for reel with height h: symbols are at matrix rows 0 to h-1
        //   - Matrix rows h to maxHeight-1 are null for this reel
        // 
        // IMPORTANT: matrixRow here is the backend matrix row (0 to maxHeight-1 for main reels)
        // Frontend row 0 (bottom) maps to backend matrix row 0 (ReelColumn[0])
        // Frontend row h-1 (top) maps to backend matrix row h-1 (ReelColumn[h-1])
        const idx = (maxHeight - matrixRow) * this.columns + col;
        if (idx >= symbolMatrix.length) continue;

        const symbolCode = symbolMatrix[idx];
        
        // Debug: Log symbols to understand matrix structure (especially for reels 2-5 which have top reel)
        // Log all rows for reels 2-3 to see the pattern
        if (col >= 1 && col <= 2 && row < 3) {
          console.log(`[GridRenderer] reel=${col}, frontendRow=${row}, matrixRow=${matrixRow}, idx=${idx}, reelHeight=${reelHeight}, maxHeight=${maxHeight}, symbol=${symbolCode || 'null'}, matrixLength=${symbolMatrix.length}`);
          // Also log what's at adjacent indices to understand the structure
          if (idx > 0 && idx < symbolMatrix.length - 1) {
            console.log(`  [GridRenderer] Adjacent: idx-1=${symbolMatrix[idx-1]}, idx+1=${symbolMatrix[idx+1]}`);
          }
        }

        if (symbolCode == null || symbolCode === '') {
          if (reel.gridSprites[row]) {
            reel.gridSprites[row].visible = false;
            reel.gridSprites[row] = null;
          }
          continue;
        }

        let sprite = reel.gridSprites[row];
        if (!sprite || sprite.destroyed) {
          sprite = new PIXI.Sprite();
          reel.gridSprites[row] = sprite;
          if (reel.gridLayer) {
            reel.gridLayer.addChild(sprite);
          } else {
            reel.container.addChild(sprite);
          }
        }

        const texture = assets.get(symbolCode) ?? assets.get('PLACEHOLDER');
        if (!texture) {
          continue;
        }

        const scale = Math.min(this.symbolSize / texture.width, this.symbolSize / texture.height);
        sprite.texture = texture;
        sprite.scale.set(scale);
        sprite.x = Math.round((this.reelWidth - sprite.width) / 2);
        sprite.y = this._rowToY(row, col);
        sprite.visible = true;
        sprite.alpha = 1;
      }
    }

    // Update top reel if present - show final symbols from matrix
    if (this.topReelContainer && this.topReelSpinLayer && this.topReelSymbols && this.topReelSymbols.length > 0 && gridRows > 0) {
      const maxHeight = gridRows - 1; // Backend uses maxHeight as top row
      const topReelRow = maxHeight; // Top reel is at row maxHeight
      const topReelCovers = [1, 2, 3, 4];
      
      // Ensure top reel is visible
      this.topReelContainer.visible = true;
      this.topReelSpinLayer.visible = true;
      
      // Update the 4 visible symbols in the top reel (first 4 symbols in array)
      for (let i = 0; i < topReelCovers.length; i++) {
        const col = topReelCovers[i];
        if (col >= this.columns) continue;
        
        const idx = topReelRow * this.columns + col;
        if (idx < symbolMatrix.length && symbolMatrix[idx]) {
          const symbolCode = symbolMatrix[idx];
          const texture = assets.get(symbolCode);
          
          if (texture && i < this.topReelSymbols.length) {
            const symbol = this.topReelSymbols[i];
            if (symbol && !symbol.destroyed) {
              symbol.texture = texture;
              const scale = Math.min(
                this.symbolSize / texture.width,
                this.symbolSize / texture.height
              );
              symbol.scale.set(scale);
              // Position symbol correctly above the reel (centered in reel column)
              symbol.x = col * this.reelWidth + (this.reelWidth / 2) - (symbol.width / 2);
              symbol.y = Math.round((this.symbolSize - symbol.height) / 2);
              symbol.visible = true;
              symbol.alpha = 1;
            }
          }
        }
      }
    }

    this.setLogicalMatrix(symbolMatrix);
    this.resultMatrix = [...symbolMatrix];
  }

  /**
   * Transitions from spin mode to grid mode
   * 
   * Smoothly switches from spinning reels to static grid showing final symbols.
   * Preloads textures during spin to prevent flicker.
   * 
   * Flow:
   * 1. Preload result textures
   * 2. Stop position updates
   * 3. Hide grid layer
   * 4. Create grid sprites with final symbols
   * 5. Update top reel
   * 6. Switch layers (hide spin, show grid)
   * 
   * @param {Array<string>} symbolMatrix - Flat array of symbol codes
   * @param {PIXI.Assets} assets - PixiJS Assets API
   * @returns {Promise<void>} Resolves when transition completes
   */
  transitionSpinToGrid(symbolMatrix, assets) {
    // For Megaways, matrix size is variable (maxRows * columns, may include top reel)
    const expectedSize = this.maxRows * this.columns;
    if (!symbolMatrix || symbolMatrix.length < this.columns) {
      console.warn('[GridRenderer] transitionSpinToGrid: Invalid symbol matrix', { length: symbolMatrix?.length, columns: this.columns });
      return Promise.resolve();
    }

    console.log('[GridRenderer] transitionSpinToGrid: Starting transition', {
      matrixLength: symbolMatrix.length,
      isSpinning: this.isSpinning,
      isRunning: this.running,
      resultMatrixExists: !!this.resultMatrix
    });
    console.log('[GridRenderer] transitionSpinToGrid: Symbol matrix (first 30):', symbolMatrix.slice(0, 30));

    // Preload the result to ensure spinning symbols have correct textures
    // This prevents texture flicker when reels stop
    // NOTE: This may have already been called in preloadSpinResult, but calling again to be safe
    if (!this.resultMatrix) {
      console.log('[GridRenderer] transitionSpinToGrid: resultMatrix not set, calling preloadSpinResult');
      this.preloadSpinResult(symbolMatrix, assets);
    } else {
      console.log('[GridRenderer] transitionSpinToGrid: resultMatrix already set, textures should already be applied');
    }

    // Stop any further position updates by ensuring isSpinning is false
    this.isSpinning = false;
    
    // Ensure grid layer is hidden during transition to prevent duplicate symbols
    for (let col = 0; col < this.columns; col++) {
      const reel = this.reels[col];
      if (!reel) continue;
      if (reel.gridLayer) {
        reel.gridLayer.visible = false;
      }
      if (Array.isArray(reel.gridSprites)) {
        reel.gridSprites.forEach((sprite) => {
          if (sprite) {
            sprite.visible = false;
          }
        });
      }
    }

    // Wait a frame to ensure textures are updated and positions are stable
    return new Promise((resolve) => {
      requestAnimationFrame(() => {
        this.currentAssets = assets;
        if (this.reels.length === 0) {
          this.buildReels(assets);
        }

        // Reconstruct grid structure from flat matrix (same logic as renderGridFromMatrix)
        // Backend creates matrix row-major: rows from maxHeight down to 0
        const gridRows = Math.ceil(symbolMatrix.length / this.columns);
        const maxHeight = gridRows - 1; // Backend uses maxHeight as top row

        // Create and position grid sprites FIRST (while spin layer is still visible)
        // This ensures they're ready and positioned before we switch
        for (let col = 0; col < this.columns; col++) {
          const reel = this.reels[col];
          if (!reel) continue;

          // Get actual reel height for this column (variable for Megaways)
          const reelHeight = reel.height || (this.reelHeights && this.reelHeights[col]) || this.rows;
          
          if (!reel.gridSprites) {
            reel.gridSprites = new Array(reelHeight).fill(null);
          }

          // Determine which rows belong to this reel
          const hasTopReel = this.topReel && [1, 2, 3, 4].includes(col);

          for (let row = 0; row < reelHeight; row++) {
            // Map reel row to grid matrix row
            // Backend: symbols are at matrix rows where r < reelHeight
            // So: matrixRow = row (direct mapping)
            let matrixRow = row;

            if (matrixRow < 0 || matrixRow >= gridRows) continue;

            // Calculate matrix index: backend builds from maxHeight down to 0
            // Backend iterates: for (row = maxHeight; row >= 0; row--)
            //   - Row maxHeight is at array indices 0 to columns-1
            //   - Row maxHeight-1 is at array indices columns to 2*columns-1
            //   - ...
            //   - Row 0 is at array indices maxHeight*columns to (maxHeight+1)*columns-1
            // So matrix row r is at array position: (maxHeight - r) * columns + col
            const idx = (maxHeight - matrixRow) * this.columns + col;
            if (idx >= symbolMatrix.length) continue;

            const symbolCode = symbolMatrix[idx];

            if (symbolCode == null || symbolCode === '') {
              if (reel.gridSprites[row]) {
                reel.gridSprites[row].visible = false;
                reel.gridSprites[row] = null;
              }
              continue;
            }

            let sprite = reel.gridSprites[row];
            if (!sprite || sprite.destroyed) {
              sprite = new PIXI.Sprite();
              reel.gridSprites[row] = sprite;
              // Always add to gridLayer if it exists, never directly to container
              if (reel.gridLayer) {
                reel.gridLayer.addChild(sprite);
              } else {
                reel.container.addChild(sprite);
              }
              // Start hidden - will be shown when we enter grid mode
              sprite.visible = false;
            }

            const texture = assets.get(symbolCode) ?? assets.get('PLACEHOLDER');
            if (!texture) {
              continue;
            }

            const scale = Math.min(this.symbolSize / texture.width, this.symbolSize / texture.height);
            sprite.texture = texture;
            sprite.scale.set(scale);
            sprite.x = Math.round((this.reelWidth - sprite.width) / 2);
            sprite.y = this._rowToY(row, col);
            sprite.visible = false; // Keep hidden until we switch to grid mode
            sprite.alpha = 1;
          }
        }
        
        // Update top reel if present - show final symbols from matrix
        if (this.topReelContainer && this.topReelSpinLayer && this.topReelSymbols && this.topReelSymbols.length > 0 && gridRows > 0) {
          const maxHeight = gridRows - 1; // Backend uses maxHeight as top row
          const topReelRow = maxHeight; // Top reel is at row maxHeight
          const topReelCovers = [1, 2, 3, 4];
          
          // Ensure top reel is visible
          this.topReelContainer.visible = true;
          this.topReelSpinLayer.visible = true;
          
          // Update the 4 visible symbols in the top reel (first 4 symbols in array)
          for (let i = 0; i < topReelCovers.length; i++) {
            const col = topReelCovers[i];
            if (col >= this.columns) continue;
            
            const idx = topReelRow * this.columns + col;
            if (idx < symbolMatrix.length && symbolMatrix[idx]) {
              const symbolCode = symbolMatrix[idx];
              const texture = assets.get(symbolCode);
              
              if (texture && i < this.topReelSymbols.length) {
                const symbol = this.topReelSymbols[i];
                if (symbol && !symbol.destroyed) {
                  symbol.texture = texture;
                  const scale = Math.min(
                    this.symbolSize / texture.width,
                    this.symbolSize / texture.height
                  );
                  symbol.scale.set(scale);
                  // Position symbol correctly above the reel (centered in reel column)
                  symbol.x = col * this.reelWidth + (this.reelWidth / 2) - (symbol.width / 2);
                  symbol.y = Math.round((this.symbolSize - symbol.height) / 2);
                  symbol.visible = true;
                  symbol.alpha = 1;
                }
              }
            }
          }
        }

        // Now instantly switch layers - grid sprites are already positioned correctly
        // The switch happens synchronously to avoid any visual gap
        // First ensure spin layer is hidden, then show grid layer
        this.reels.forEach((reel) => {
          if (!reel) return;
          // Hide spin layer first
          if (reel.spinLayer) {
            reel.spinLayer.visible = false;
          }
          if (Array.isArray(reel.symbols)) {
            reel.symbols.forEach((symbol) => {
              if (symbol) {
                symbol.visible = false;
              }
            });
          }
        });
        
        // Then show grid layer
        this.enterGridMode();
        this.setLogicalMatrix(symbolMatrix);
        this.resultMatrix = [...symbolMatrix];
        this.isCascading = true;
        
        resolve();
      });
    });
  }

  setLogicalMatrix(matrix) {
    if (Array.isArray(matrix) && matrix.length === this.columns * this.rows) {
      this.lastSymbolMatrix = [...matrix];
    }
  }

  applyResultDuringSpin(symbolMatrix, assets) {
    if (!symbolMatrix || symbolMatrix.length !== this.columns * this.rows) {
      console.warn('applyResultDuringSpin: invalid symbol matrix');
      return;
    }

    this.preloadSpinResult(symbolMatrix, assets);
  }

  initializeReels(assets) {
    this.currentAssets = assets;
    if (this.reels.length === 0) {
      this.buildReels(assets);
      // Show the spin layer initially so reels are visible
      this.enterSpinMode();
    }
  }

  /**
   * Preloads spin result textures
   * 
   * Applies final textures to spinning reels before they stop. This prevents
   * texture flicker and ensures smooth visual transition.
   * 
   * Called during spin (before reels stop) to apply final symbols.
   * 
   * @param {Array<string>} symbolMatrix - Flat array of symbol codes
   * @param {PIXI.Assets} assets - PixiJS Assets API
   * @returns {void}
   */
  preloadSpinResult(symbolMatrix, assets) {
    // For Megaways, matrix size is variable (maxRows * columns, may include top reel)
    if (!symbolMatrix || symbolMatrix.length < this.columns) {
      console.warn('[GridRenderer] preloadSpinResult: Invalid symbol matrix', { length: symbolMatrix?.length, columns: this.columns });
      return;
    }

    console.log('[GridRenderer] preloadSpinResult: Starting to apply final textures', {
      matrixLength: symbolMatrix.length,
      columns: this.columns,
      rows: this.rows,
      maxRows: this.maxRows,
      isSpinning: this.isSpinning,
      isRunning: this.running,
      resultMatrixExists: !!this.resultMatrix
    });
    console.log('[GridRenderer] preloadSpinResult: Backend symbol matrix (first 30):', symbolMatrix.slice(0, 30));

    if (!this.reels || this.reels.length === 0) {
      this.buildReels(assets);
    }

    if (!this.reels || this.reels.length === 0) {
      console.error('[GridRenderer] preloadSpinResult: No reels available');
      return;
    }

    this.currentAssets = assets;
    this.setLogicalMatrix(symbolMatrix);
    
    // CRITICAL: Set resultMatrix IMMEDIATELY to prevent ticker from overwriting with random textures
    // This must be set BEFORE applying textures so the ticker knows to stop random updates
    this.resultMatrix = [...symbolMatrix];
    console.log('[GridRenderer] preloadSpinResult: resultMatrix set, ticker should stop random updates');

    // Ensure grid layer is hidden during spin to prevent duplicate symbols
    for (let col = 0; col < this.columns; col += 1) {
      const reel = this.reels[col];
      if (!reel) continue;
      
      // Hide grid layer and sprites while spinning
      if (reel.gridLayer) {
        reel.gridLayer.visible = false;
      }
      if (Array.isArray(reel.gridSprites)) {
        reel.gridSprites.forEach((sprite) => {
          if (sprite) {
            sprite.visible = false;
          }
        });
      }
    }

    // Apply final textures immediately to all reels when result is known
    // This ensures symbols are visible before the reels stop
    // resultMatrix is already set above, so ticker won't overwrite these textures
    console.log('[GridRenderer] preloadSpinResult: Applying textures to', this.columns, 'reels');
    for (let col = 0; col < this.columns; col += 1) {
      const reel = this.reels[col];
      if (!reel || !Array.isArray(reel.symbols) || reel.symbols.length === 0) {
        console.warn(`[GridRenderer] preloadSpinResult: Reel ${col} is invalid or has no symbols`);
        continue;
      }

      // Apply textures immediately - don't wait for phase 0.9
      console.log(`[GridRenderer] preloadSpinResult: Applying textures to reel ${col}`);
      this._applyResultToReelSpinLayer(reel);
      reel.finalTexturesApplied = true;
      
      // Log what symbols were applied to this reel (for debugging)
      const reelSymbols = [];
      const reelHeightForLog = reel.height || (this.reelHeights && this.reelHeights[col]) || this.rows;
      const gridRowsForLog = Math.ceil(symbolMatrix.length / this.columns);
      const maxHeightForLog = gridRowsForLog - 1;
      for (let row = 0; row < reelHeightForLog; row++) {
        const matrixRow = row;
        // Use correct index calculation: (maxHeight - matrixRow) * columns + col
        const matrixIndex = (maxHeightForLog - matrixRow) * this.columns + col;
        if (matrixIndex < symbolMatrix.length) {
          reelSymbols.push(symbolMatrix[matrixIndex] || 'NULL');
        } else {
          reelSymbols.push('OUT_OF_BOUNDS');
        }
      }
      console.log(`[GridRenderer] preloadSpinResult: Reel ${col} (height ${reelHeightForLog}) should show (bottom to top):`, reelSymbols);
    }
    
    // Apply final textures to top reel symbols immediately
    console.log('[GridRenderer] preloadSpinResult: Applying textures to top reel');
    this._applyResultToTopReelSpinLayer(symbolMatrix, assets);
    console.log('[GridRenderer] preloadSpinResult: All textures applied');
  }
  
  _applyResultToTopReelSpinLayer(symbolMatrix, assets) {
    if (!this.topReelSpinLayer || !this.topReelSymbols || this.topReelSymbols.length === 0) {
      console.log('[GridRenderer] _applyResultToTopReelSpinLayer: Top reel not available');
      return;
    }
    
    if (!symbolMatrix || symbolMatrix.length < this.columns) {
      console.warn('[GridRenderer] _applyResultToTopReelSpinLayer: Invalid symbol matrix');
      return;
    }
    
    // Calculate grid structure
    const gridRows = Math.ceil(symbolMatrix.length / this.columns);
    const maxHeight = gridRows - 1; // Backend uses maxHeight as top row
    const topReelRow = maxHeight; // Top reel is at row maxHeight
    const topReelCovers = [1, 2, 3, 4];
    
    const appliedTopReelSymbols = [];
    
    // Apply final textures to the visible symbols in the top reel
    // The visible symbols are the first 4 symbols in the array
    for (let i = 0; i < topReelCovers.length; i++) {
      const col = topReelCovers[i];
      if (col >= this.columns) continue;
      
      const idx = topReelRow * this.columns + col;
      if (idx < symbolMatrix.length && symbolMatrix[idx]) {
        const symbolCode = symbolMatrix[idx];
        const texture = assets.get(symbolCode);
        
        if (texture && i < this.topReelSymbols.length) {
          const symbol = this.topReelSymbols[i];
          if (symbol && !symbol.destroyed) {
            const oldTexture = symbol.texture?.baseTexture?.resource?.url || 'unknown';
            // Apply texture smoothly - don't change position, just texture
            symbol.texture = texture;
            const scale = Math.min(
              this.symbolSize / texture.width,
              this.symbolSize / texture.height
            );
            symbol.scale.set(scale);
            // Keep current position - don't reposition here
            
            appliedTopReelSymbols.push(symbolCode);
            
            const newTexture = symbol.texture?.baseTexture?.resource?.url || 'unknown';
            if (oldTexture !== newTexture && oldTexture !== 'unknown') {
              console.log(`[GridRenderer] _applyResultToTopReelSpinLayer: Top reel symbol ${i} (col ${col}): Changed from ${oldTexture} to ${symbolCode}`);
            }
          }
        } else {
          appliedTopReelSymbols.push('MISSING');
        }
      } else {
        appliedTopReelSymbols.push('NULL');
      }
    }
    
    console.log('[GridRenderer] _applyResultToTopReelSpinLayer: Top reel symbols applied:', appliedTopReelSymbols);
  }

  _applyResultToReelSpinLayer(reel) {
    if (!reel || !Array.isArray(reel.symbols) || reel.symbols.length === 0) {
      return;
    }

    // For Megaways, resultMatrix size is variable (maxRows * columns)
    if (!this.resultMatrix || this.resultMatrix.length < this.columns) {
      console.warn('[GridRenderer] _applyResultToReelSpinLayer: No resultMatrix available');
      return;
    }

    const assets = this.currentAssets;
    if (!assets) {
      console.warn('[GridRenderer] _applyResultToReelSpinLayer: No assets available');
      return;
    }

    const symbolCount = reel.symbols.length;
    const col = reel.index; // Column index from reel object

    if (!Number.isFinite(col) || col < 0 || col >= this.columns) {
      console.warn(`[GridRenderer] _applyResultToReelSpinLayer: Invalid column index ${col}`);
      return;
    }

    // Get actual reel height for this column (variable for Megaways)
    const reelHeight = reel.height || (this.reelHeights && this.reelHeights[col]) || this.rows;
    
    // Calculate grid structure
    const gridRows = Math.ceil(this.resultMatrix.length / this.columns);
    const maxHeight = gridRows - 1;

    // Use the *target* position for mapping, not the current animated position
    const targetPos = Number.isFinite(reel.targetPosition)
      ? reel.targetPosition
      : reel.position;

    const appliedSymbols = []; // Track what we're applying for logging

    // Apply textures for each row in this reel
    // Frontend: row 0 = bottom, row h-1 = top
    // Backend: matrix row 0 = ReelColumn[0] (bottom), matrix row h-1 = ReelColumn[h-1] (top)
    // Backend builds matrix from maxHeight down to 0, so:
    //   - Matrix row r is at array index: (maxHeight - r) * columns + col
    // So: matrixRow = row (direct mapping)
    for (let row = 0; row < reelHeight; row += 1) {
      const matrixRow = row; // Direct mapping: frontend row = backend matrix row
      // Backend builds matrix from maxHeight down to 0, so row r is at index (maxHeight - r) * columns + col
      const matrixIndex = (maxHeight - matrixRow) * this.columns + col;
      
      if (matrixIndex >= this.resultMatrix.length) {
        continue;
      }
      
      const symbolCode = this.resultMatrix[matrixIndex];

      if (symbolCode == null || symbolCode === '') {
        appliedSymbols.push(null);
        continue;
      }

      const texture = assets.get(symbolCode) ?? assets.get('PLACEHOLDER');

      if (!texture) {
        console.warn(`[GridRenderer] _applyResultToReelSpinLayer: Texture not found for symbol ${symbolCode} in reel ${col}, row ${row}`);
        appliedSymbols.push('MISSING');
        continue;
      }

      const spriteIndex = this._getSpriteIndexForRowAtPosition(reel, row, targetPos);
      if (spriteIndex < 0 || spriteIndex >= symbolCount) {
        console.warn(`[GridRenderer] _applyResultToReelSpinLayer: Invalid sprite index ${spriteIndex} for reel ${col}, row ${row}`);
        appliedSymbols.push('INVALID_INDEX');
        continue;
      }

      const sprite = reel.symbols[spriteIndex];
      if (!sprite || sprite.destroyed) {
        console.warn(`[GridRenderer] _applyResultToReelSpinLayer: Sprite ${spriteIndex} is invalid in reel ${col}`);
        appliedSymbols.push('INVALID_SPRITE');
        continue;
      }

      const scale = Math.min(
        this.symbolSize / texture.width,
        this.symbolSize / texture.height
      );

      // Log before applying
      const oldTexture = sprite.texture?.baseTexture?.resource?.url || 'unknown';
      sprite.texture = texture;
      sprite.scale.set(scale);
      sprite.x = Math.round((this.reelWidth - sprite.width) / 2);
      
      appliedSymbols.push(symbolCode);
      
      // Log if texture changed
      const newTexture = sprite.texture?.baseTexture?.resource?.url || 'unknown';
      if (oldTexture !== newTexture && oldTexture !== 'unknown') {
        console.log(`[GridRenderer] _applyResultToReelSpinLayer: Reel ${col}, Row ${row}, Sprite ${spriteIndex}: Changed texture from ${oldTexture} to ${symbolCode}`);
      }
    }
    
    console.log(`[GridRenderer] _applyResultToReelSpinLayer: Reel ${col} (height ${reelHeight}) applied symbols:`, appliedSymbols);
  }

  getSize() {
    return { ...this.size };
  }

  destroy() {
    // Clean up ticker
    if (this.tickerCallback) {
      this.app.ticker.remove(this.tickerCallback);
      this.tickerCallback = null;
    }
    
    // Clean up reels
    this.reels.forEach(reel => {
      if (reel.mask && !reel.mask.destroyed) {
        reel.mask.destroy();
      }
      if (reel.container && !reel.container.destroyed) {
        reel.container.destroy({ children: true });
      }
    });
    this.reels = [];
    this.tweening = [];
  }

  setVisible(isVisible) {
    this.container.visible = !!isVisible;
  }

  fadeOut(duration = 150) {
    this.container.visible = true;
    return this._fadeTo(0, duration);
  }

  fadeIn(duration = 150) {
    this.container.visible = true;
    return this._fadeTo(1, duration);
  }

  _fadeTo(targetAlpha, duration) {
    if (this.container.alpha === targetAlpha) {
      return Promise.resolve();
    }

    return new Promise((resolve) => {
      this.tweenTo(
        this.container,
        'alpha',
        targetAlpha,
        duration,
        (t) => t,
        null,
        resolve
      );
    });
  }

  /**
   * Checks if spin is currently running
   * 
   * @returns {boolean} True if spin is running, false otherwise
   */
  isRunning() {
    return this.running;
  }

  /**
   * Plays a single cascade step animation
   * 
   * Animates the cascade process:
   * 1. Fades out winning symbols
   * 2. Drops remaining symbols down to fill gaps
   * 3. Spawns new symbols from top
   * 
   * Handles variable reel heights for Megaways support.
   * 
   * @param {Array<string>} nextMatrix - Next grid state after cascade
   * @param {PIXI.Assets} assets - PixiJS Assets API
   * @param {Object} [options] - Animation options
   * @param {number} [options.fadeDuration] - Fade duration in seconds
   * @param {number} [options.dropDuration] - Drop duration in seconds
   * @returns {Promise<void>} Resolves when cascade step completes
   */
  playCascadeStep(
    nextMatrix,
    assets,
    { fadeDuration = CASCADE_FADE_DURATION, dropDuration = CASCADE_DROP_DURATION } = {}
  ) {
    // For Megaways, matrix may have variable size (maxRows * columns)
    const expectedSize = this.maxRows * this.columns;
    if (!nextMatrix || nextMatrix.length < this.columns) {
      return Promise.resolve();
    }

    if (!this.lastSymbolMatrix || this.lastSymbolMatrix.length !== nextMatrix.length) {
      this.renderGridFromMatrix(nextMatrix, assets);
      return Promise.resolve();
    }

    this.enterGridMode();
    this.currentAssets = assets;

    const prevMatrix = this.lastSymbolMatrix.slice();
    const removedIndices = new Set(
      Array.isArray(this.pendingWinningIndices) ? this.pendingWinningIndices : []
    );

    if (removedIndices.size === 0) {
      for (let idx = 0; idx < prevMatrix.length; idx += 1) {
        if (prevMatrix[idx] !== nextMatrix[idx]) {
          removedIndices.add(idx);
        }
      }
    }

    const fadePromises = [];
    removedIndices.forEach((idx) => {
      const row = Math.floor(idx / this.columns);
      const col = idx % this.columns;
      const sprite = this._getGridSpriteAt(row, col);
      if (!sprite) {
        return;
      }

      const reel = this.reels[col];
      if (reel && reel.gridSprites) {
        reel.gridSprites[row] = null;
      }

      fadePromises.push(
        new Promise((resolve) => {
          this.tweenTo(
            sprite,
            'alpha',
            0,
            fadeDuration * 1000,
            (t) => t,
            null,
            () => {
              sprite.visible = false;
              sprite.alpha = 0;
              resolve();
            }
          );
        })
      );
    });

    return Promise.all(fadePromises)
      .catch((err) => {
        console.error('Cascade fade error', err);
      })
      .then(() => {
        const dropPromises = [];

        for (let col = 0; col < this.columns; col++) {
          const reel = this.reels[col];
          if (!reel) {
            continue;
          }
          
          // Get actual reel height for this column (variable for Megaways)
          const reelHeight = reel.height || (this.reelHeights && this.reelHeights[col]) || this.rows;
          
          if (!reel.gridSprites) {
            reel.gridSprites = new Array(reelHeight).fill(null);
          }

          const prevCol = [];
          const nextCol = [];

          // Use variable reel height instead of fixed this.rows
          for (let row = 0; row < reelHeight; row++) {
            // Calculate index in the flat matrix - need to account for variable structure
            // For Megaways, the matrix might be structured differently
            // Try to find the correct index for this row/col combination
            let idx = -1;
            
            // Try row-major order first (standard approach)
            const rowMajorIdx = row * this.columns + col;
            if (rowMajorIdx < prevMatrix.length && rowMajorIdx < nextMatrix.length) {
              idx = rowMajorIdx;
            } else {
              // If that doesn't work, we need to calculate based on cumulative heights
              // For now, use a simpler approach: calculate based on maxRows
              const maxRows = this.maxRows || this.rows;
              idx = row * this.columns + col;
              if (idx >= prevMatrix.length) {
                continue; // Skip if index is out of bounds
              }
            }
            
            prevCol.push({
              row,
              idx,
              symbolCode: prevMatrix[idx],
              sprite: reel.gridSprites[row],
              isRemoved: removedIndices.has(idx)
            });
            nextCol.push({
              row,
              idx,
              symbolCode: nextMatrix[idx]
            });
          }

          const survivors = [];
          for (let row = reelHeight - 1; row >= 0; row--) {
            const cell = prevCol[row];
            if (!cell || !cell.sprite || cell.isRemoved) {
              continue;
            }
            survivors.unshift(cell);
          }

          const targetRows = nextCol.filter((c) => c.symbolCode != null).map((c) => c.row);
          const survivorTargets = [];

          for (let i = 0; i < survivors.length; i++) {
            const targetRow = targetRows[targetRows.length - survivors.length + i];
            if (targetRow === undefined) {
              continue;
            }
            survivorTargets.push({ cell: survivors[i], targetRow });
          }

          const occupiedRows = new Set();

          survivorTargets.forEach(({ cell, targetRow }) => {
            const sprite = cell.sprite;
            if (!sprite) {
              return;
            }

            const targetY = this._rowToY(targetRow, col);
            occupiedRows.add(targetRow);
            reel.gridSprites[targetRow] = sprite;
            if (cell.row !== targetRow) {
              reel.gridSprites[cell.row] = null;
            }

            dropPromises.push(
              new Promise((resolve) => {
                this.tweenTo(
                  sprite,
                  'y',
                  targetY,
                  dropDuration * 1000,
                  this.backout(0.8),
                  null,
                  resolve
                );
              })
            );
          });

          const rowsNeedingNew = targetRows.filter((row) => !occupiedRows.has(row) && row < reelHeight);

          rowsNeedingNew.forEach((row) => {
            // Calculate index based on variable reel structure
            // For Megaways, we need to handle variable heights per column
            let idx = -1;
            if (row < reelHeight) {
              // Use row-major order, but only for valid rows within this reel's height
              const maxRows = this.maxRows || this.rows;
              idx = row * this.columns + col;
              // Ensure index is within bounds
              if (idx >= nextMatrix.length) {
                return; // Skip if out of bounds
              }
            } else {
              return; // Skip rows beyond this reel's height
            }
            
            const symbolCode = nextMatrix[idx];
            if (!symbolCode) {
              return;
            }

            // Ensure gridSprites array is large enough
            if (!reel.gridSprites) {
              reel.gridSprites = new Array(reelHeight).fill(null);
            }
            while (reel.gridSprites.length <= row) {
              reel.gridSprites.push(null);
            }

            let sprite = reel.gridSprites[row];
            if (!sprite || sprite.destroyed) {
              sprite = new PIXI.Sprite();
              reel.gridSprites[row] = sprite;
              if (reel.gridLayer) {
                reel.gridLayer.addChild(sprite);
              } else {
                reel.container.addChild(sprite);
              }
            }

            const texture = assets.get(symbolCode) ?? assets.get('PLACEHOLDER');
            if (!texture) {
              return;
            }

            const scale = Math.min(this.symbolSize / texture.width, this.symbolSize / texture.height);
            sprite.texture = texture;
            sprite.scale.set(scale);
            sprite.x = Math.round((this.reelWidth - sprite.width) / 2);
            const targetY = this._rowToY(row, col);
            sprite.y = targetY - this.symbolSize * 1.1;
            sprite.alpha = 1;
            sprite.visible = true;

            dropPromises.push(
              new Promise((resolve) => {
                this.tweenTo(
                  sprite,
                  'y',
                  targetY,
                  dropDuration * 1000,
                  this.backout(0.8),
                  null,
                  resolve
                );
              })
            );
          });

          for (let row = 0; row < this.rows; row++) {
            const idx = row * this.columns + col;
            if (nextMatrix[idx] == null && reel.gridSprites[row]) {
              reel.gridSprites[row].visible = false;
              reel.gridSprites[row] = null;
            }
          }
        }

        return Promise.all(dropPromises).then(() => {
          this.lastSymbolMatrix = [...nextMatrix];
          this.resultMatrix = [...nextMatrix];
          this.pendingWinningIndices = null;
        });
      });
  }

  _rowToY(row, col = -1) {
    // Offset by symbolSize to account for mask starting at y=symbolSize
    // This hides the top buffer row and aligns visible rows correctly
    // For reels with top reel (cols 1-4), add extra offset
    const hasTopReel = col >= 0 && this.topReel && [1, 2, 3, 4].includes(col);
    const topReelOffset = hasTopReel ? this.symbolSize : 0;
    
    // Use fixed spacing to match spinning symbols
    // The mask already clips to the correct height for each reel
    // This ensures grid sprites align with spinning symbols
    return (row + 1) * this.symbolSize + topReelOffset;
  }

  _applyTableScale() {
    if (!this.tableSprite || !this.tableSprite.texture || !this.tableSprite.texture.width || !this.tableSprite.texture.height) {
      return;
    }

    const textureWidth = this.tableSprite.texture.width;
    const textureHeight = this.tableSprite.texture.height;
    const baseScaleX = this.size.width / textureWidth;
    const baseScaleY = this.size.height / textureHeight;
    
    // ===== TABLE SCALE ADJUSTMENT =====
    // Increase this value to make the table bigger (e.g., 1.5 = 50% bigger, 2.0 = 100% bigger)
    const TABLE_SCALE_MULTIPLIER = 1.0;
    
    // ===== TABLE POSITION ADJUSTMENT =====
    // Y position offset - positive values move down, negative values move up
    const TABLE_Y_OFFSET = 0;
    
    const uniformScale = Math.max(baseScaleX, baseScaleY) * (1 + (Number.isFinite(this.tablePadding) ? this.tablePadding : 0)) * TABLE_SCALE_MULTIPLIER;

    this.tableSprite.scale.set(uniformScale);
    this.tableSprite.x = this.size.width / 2.0;  // Horizontal center
    this.tableSprite.y = (this.size.height / 1.35) + TABLE_Y_OFFSET; // Vertical position with offset
  }

  _notifySpinComplete() {
    if (typeof this.onSpinComplete === 'function') {
      const cb = this.onSpinComplete;
      this.onSpinComplete = null;
      // Handle both sync and async callbacks
      const result = cb();
      if (result && typeof result.then === 'function') {
        // Async callback - errors are handled by the caller
        result.catch((err) => {
          console.error('Spin complete callback error:', err);
        });
      }
    }
  }

  _getVisibleSprite(column, row) {
    const reel = this.reels[column];
    if (!reel || !reel.symbols.length) {
      return null;
    }

    const index = this._getVisibleSpriteIndex(reel, row);
    if (index < 0 || index >= reel.symbols.length) {
      return null;
    }
    return reel.symbols[index];
  }

  _getVisibleSpriteIndex(reel, row) {
    const symbolCount = reel.symbols.length;
    if (symbolCount === 0) {
      return -1;
    }
    const startIndex = symbolCount - this.rows;
    return (startIndex + row) % symbolCount;
  }

  _getSpriteIndexForRowAtPosition(reel, row, position) {
    const symbolCount = reel.symbols.length;
    if (symbolCount === 0) {
      return -1;
    }
    // Normalize position to [0, symbolCount) range
    const normalized = ((Math.round(position) % symbolCount) + symbolCount) % symbolCount;
    // Map logical row to sprite index j such that (position + j) % symbolCount === row + 1
    // The +1 accounts for the mask offset: visible row 0 is at y=symbolSize (k=1), not y=0 (k=0)
    // Solving: (position + j) % symbolCount = row + 1
    // => j = (row + 1 - position) mod symbolCount
    // This matches the spin layout: symbol.y = ((position + j) % symbolCount) * symbolSize
    // where visible row 0 corresponds to k=1 (y=symbolSize), hidden buffer is k=0 (y=0)
    return (row + 1 - normalized + symbolCount) % symbolCount;
  }

  getSpriteAt(row, col) {
    if (
      typeof row !== 'number' ||
      typeof col !== 'number' ||
      row < 0 ||
      col < 0 ||
      row >= this.rows ||
      col >= this.columns
    ) {
      return null;
    }

    const reel = this.reels[col];
    if (!reel) {
      return null;
    }

    if (!this.isSpinning || this.isCascading || (reel.gridLayer && reel.gridLayer.visible)) {
      const gridSprite = this._getGridSpriteAt(row, col);
      if (gridSprite) {
        return gridSprite;
      }
    }

    if (!reel.symbols.length) {
      return null;
    }

    const symbolIndex = this._getVisibleSpriteIndex(reel, row);
    if (symbolIndex < 0 || symbolIndex >= reel.symbols.length) {
      return null;
    }

    const sprite = reel.symbols[symbolIndex];
    if (!sprite || sprite.destroyed) {
      return null;
    }

    return sprite;
  }

  _getGridSpriteAt(row, col) {
    const reel = this.reels[col];
    if (!reel || !reel.gridSprites) {
      return null;
    }
    const sprite = reel.gridSprites[row];
    if (!sprite || sprite.destroyed) {
      return null;
    }
    return sprite;
  }

  getChangedCells(nextMatrix) {
    if (
      !this.lastSymbolMatrix ||
      !nextMatrix ||
      nextMatrix.length !== this.lastSymbolMatrix.length
    ) {
      return [];
    }

    const cells = [];
    for (let idx = 0; idx < nextMatrix.length; idx += 1) {
      if (this.lastSymbolMatrix[idx] === nextMatrix[idx]) {
        continue;
      }
      const row = Math.floor(idx / this.columns);
      const col = idx % this.columns;
      cells.push({ row, col });
    }
    return cells;
  }

  /**
   * Highlights winning cells with scale animation
   * 
   * Scales up winning symbols, then scales back down with bounce effect.
   * Uses GSAP timeline for smooth animation.
   * 
   * @param {Array<Object>} cells - Array of {row, col} positions
   * @param {Object} [options] - Animation options
   * @param {number} [options.scaleAmount] - Scale multiplier (default: 1.18 = 18% larger)
   * @param {number} [options.duration] - Animation duration in seconds (default: 0.22)
   * @returns {Promise<void>} Resolves when highlight animation completes
   */
  highlightWinningCells(cells, { scaleAmount = 1.18, duration = 0.22 } = {}) {
    if (!cells || cells.length === 0) {
      return Promise.resolve();
    }

    const deduped = [];
    const seen = new Set();
    cells.forEach((cell) => {
      if (!cell) {
        return;
      }
      const row = Number(cell.row);
      const col = Number(cell.col);
      if (!Number.isFinite(row) || !Number.isFinite(col)) {
        return;
      }
      const key = `${row}-${col}`;
      if (!seen.has(key)) {
        seen.add(key);
        deduped.push({ row, col });
      }
    });

    if (deduped.length === 0) {
      return Promise.resolve();
    }

    const sprites = deduped
      .map((cell) => this.getSpriteAt(cell.row, cell.col))
      .filter((sprite) => sprite && !sprite.destroyed);

    if (sprites.length === 0) {
      return Promise.resolve();
    }

    return new Promise((resolve) => {
      const baseScales = sprites.map((sprite) => ({ x: sprite.scale.x, y: sprite.scale.y }));
      const tl = gsap.timeline({
        onComplete: () => {
          sprites.forEach((sprite, index) => {
            const base = baseScales[index];
            sprite.scale.set(base.x, base.y);
            sprite.alpha = 1;
          });
          resolve();
        }
      });

      sprites.forEach((sprite, index) => {
        const base = baseScales[index];
        tl.to(
          sprite.scale,
          {
            x: base.x * scaleAmount,
            y: base.y * scaleAmount,
            duration,
            ease: 'back.out(2)'
          },
          0
        );
        tl.to(
          sprite.scale,
          {
            x: base.x,
            y: base.y,
            duration,
            ease: 'back.in(1.2)'
          },
          duration
        );
      });
    });
  }
}
