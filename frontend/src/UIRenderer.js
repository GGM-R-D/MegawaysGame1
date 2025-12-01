/**
 * UIRenderer.js - UI Overlay Rendering
 * 
 * Renders UI overlays on PixiJS stage. Currently minimal as most UI is handled
 * via HTML/CSS in index.html. This class is available for future PixiJS-based UI elements.
 * 
 * Note: Most UI (buttons, modals, HUD) is implemented in HTML/CSS for better
 * accessibility and easier styling. This class can be extended for game-specific
 * UI elements that need to be part of the PixiJS scene.
 */

import * as PIXI from 'pixi.js';

/**
 * UIRenderer - Renders UI overlays on PixiJS stage
 */
export default class UIRenderer {
  /**
   * Creates a new UIRenderer instance
   * 
   * @param {Object} options - Configuration options
   * @param {PIXI.Application} options.app - PixiJS application
   */
  constructor({ app }) {
    this.app = app; // PixiJS application
    this.container = new PIXI.Container(); // Container for UI elements
    this.buttons = {}; // Object mapping button labels to button sprites
  }

  /**
   * Initializes UI renderer
   * 
   * Adds container to stage. Currently no buttons are created (UI handled by HTML).
   * 
   * @param {PIXI.Container} stage - PixiJS stage
   * @returns {void}
   */
  initialize(stage) {
    stage.addChild(this.container);
    // Buttons removed - SPIN, AUTOSPIN, TURBO (now handled by HTML)
  }

  /**
   * Creates a button sprite
   * 
   * Creates a PixiJS graphics button with text label. Currently not used
   * but available for future PixiJS-based UI elements.
   * 
   * @param {string} label - Button text label
   * @param {number} index - Button index for positioning
   * @returns {void}
   */
  createButton(label, index) {
    const button = new PIXI.Graphics();
    button.beginFill(0x7d5a2f);
    button.drawRoundedRect(0, 0, 160, 48, 12);
    button.endFill();

    const text = new PIXI.Text(label, { fill: 0xf8f5e7, fontSize: 20, fontFamily: 'Changa One' });
    text.anchor.set(0.5);
    text.x = 80;
    text.y = 24;
    button.addChild(text);

    button.x = 40 + index * 180;
    button.y = this.app.renderer.height - 80;

    button.eventMode = 'static';
    button.cursor = 'pointer';
    button.on('pointertap', () => console.debug(`${label} pressed`));

    this.container.addChild(button);
    this.buttons[label] = button;
  }
}

