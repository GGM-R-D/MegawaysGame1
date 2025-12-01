/**
 * AudioManager.js - Sound Management
 * 
 * Manages all audio playback including background music, free spin music,
 * and sound effects. Handles volume control, muting, and autoplay restrictions.
 * 
 * Audio Files:
 * - /sounds/background-music.mp3 - Base game music (looping)
 * - /sounds/free-spins-music.mp3 - Free spin music (looping)
 * - /sounds/spin.mp3 - Reel spinning sound
 * - /sounds/stop.mp3 - Reel stop sound
 * - /sounds/win.wav - Regular win sound
 * - /sounds/big-win.wav - Big win sound (10x+ bet)
 * - /sounds/click.wav - UI click sound
 */

export default class AudioManager {
  /**
   * Creates a new AudioManager instance
   * 
   * Initializes audio objects and volume settings.
   */
  constructor() {
    this.backgroundMusic = null; // Base game background music
    this.freeSpinMusic = null; // Free spin background music
    this.soundEffects = {}; // Object mapping sound names to Audio objects
    this.isMuted = false; // Mute state
    this.musicVolume = 0.5; // Music volume (0.0 to 1.0)
    this.sfxVolume = 0.7; // Sound effects volume (0.0 to 1.0)
    this.currentMusic = null; // Currently playing music track
  }

  /**
   * Loads all audio files
   * 
   * Creates Audio objects for all sounds and preloads them.
   * Sets loop property for music tracks.
   * 
   * @returns {Promise<void>}
   */
  async load() {
    // Load background music
    this.backgroundMusic = new Audio('/sounds/background-music.mp3');
    this.backgroundMusic.loop = true;
    this.backgroundMusic.volume = this.musicVolume;
    this.backgroundMusic.preload = 'auto';

    // Load free spin music
    this.freeSpinMusic = new Audio('/sounds/free-spins-music.mp3');
    this.freeSpinMusic.loop = true;
    this.freeSpinMusic.volume = this.musicVolume;
    this.freeSpinMusic.preload = 'auto';

    // Load sound effects
    this.soundEffects = {
      spin: new Audio('/sounds/spin.mp3'),
      stop: new Audio('/sounds/stop.mp3'),
      win: new Audio('/sounds/win.wav'),
      bigWin: new Audio('/sounds/big-win.wav'),
      click: new Audio('/sounds/click.wav')
    };

    // Set sound effect properties
    Object.values(this.soundEffects).forEach(sound => {
      sound.volume = this.sfxVolume;
      sound.preload = 'auto';
    });

    // Preload all sounds
    const loadPromises = [
      this.backgroundMusic.load(),
      this.freeSpinMusic.load(),
      ...Object.values(this.soundEffects).map(sound => sound.load())
    ].map(promise => {
      if (promise && typeof promise.then === 'function') {
        return promise.catch(err => {
          console.warn('Failed to preload audio:', err);
        });
      }
      // If not a promise, return a resolved promise
      return Promise.resolve();
    });

    await Promise.all(loadPromises);
  }

  /**
   * Plays background music (base game)
   * 
   * Stops current music if playing, then starts background music loop.
   * Handles autoplay restrictions (browsers block autoplay).
   * 
   * @returns {void}
   */
  playBackgroundMusic() {
    if (this.isMuted) return;
    
    // Stop current music if playing
    if (this.currentMusic && !this.currentMusic.paused) {
      this.currentMusic.pause();
      this.currentMusic.currentTime = 0;
    }

    this.currentMusic = this.backgroundMusic;
    
    // Try to play, handle autoplay restrictions
    const playPromise = this.backgroundMusic.play();
    if (playPromise !== undefined) {
      playPromise.catch(err => {
        console.warn('Failed to play background music (autoplay may be blocked):', err);
        // If autoplay is blocked, try again on next user interaction
        document.addEventListener('click', () => {
          this.backgroundMusic.play().catch(e => {
            console.warn('Still failed to play background music:', e);
          });
        }, { once: true });
      });
    }
  }

  /**
   * Plays free spin music
   * 
   * Switches from background music to free spin music track.
   * 
   * @returns {void}
   */
  playFreeSpinMusic() {
    if (this.isMuted) return;
    
    // Stop current music if playing
    if (this.currentMusic && !this.currentMusic.paused) {
      this.currentMusic.pause();
      this.currentMusic.currentTime = 0;
    }

    this.currentMusic = this.freeSpinMusic;
    const freeSpinPlayPromise = this.freeSpinMusic.play();
    if (freeSpinPlayPromise && typeof freeSpinPlayPromise.then === 'function') {
      freeSpinPlayPromise.catch(err => {
        console.warn('Failed to play free spin music:', err);
      });
    }
  }

  /**
   * Stops all music playback
   * 
   * @returns {void}
   */
  stopMusic() {
    if (this.currentMusic && !this.currentMusic.paused) {
      this.currentMusic.pause();
      this.currentMusic.currentTime = 0;
    }
    this.currentMusic = null;
  }

  /**
   * Plays a sound effect
   * 
   * @param {string} soundName - Name of sound effect ('spin', 'stop', 'win', 'bigWin', 'click')
   * @returns {void}
   */
  playSound(soundName) {
    if (this.isMuted) return;
    
    const sound = this.soundEffects[soundName];
    if (sound) {
      // Reset to start and play
      sound.currentTime = 0;
      const playPromise = sound.play();
      if (playPromise && typeof playPromise.then === 'function') {
        playPromise.catch(err => {
          console.warn(`Failed to play sound ${soundName}:`, err);
        });
      }
    } else {
      console.warn(`Sound effect not found: ${soundName}`);
    }
  }

  /**
   * Plays spin sound effect
   * @returns {void}
   */
  playSpin() {
    this.playSound('spin');
  }

  /**
   * Plays stop sound effect
   * @returns {void}
   */
  playStop() {
    this.playSound('stop');
  }

  /**
   * Plays win sound effect
   * @returns {void}
   */
  playWin() {
    this.playSound('win');
  }

  /**
   * Plays big win sound effect
   * @returns {void}
   */
  playBigWin() {
    this.playSound('bigWin');
  }

  /**
   * Plays click sound effect
   * @returns {void}
   */
  playClick() {
    this.playSound('click');
  }

  /**
   * Sets mute state
   * 
   * When muted, stops all music. When unmuted, resumes music if it was playing.
   * 
   * @param {boolean} muted - True to mute, false to unmute
   * @returns {void}
   */
  setMuted(muted) {
    this.isMuted = muted;
    if (muted) {
      this.stopMusic();
    } else {
      if (this.currentMusic) {
        const resumePromise = this.currentMusic.play();
        if (resumePromise && typeof resumePromise.then === 'function') {
          resumePromise.catch(err => {
            console.warn('Failed to resume music:', err);
          });
        }
      } else {
        this.playBackgroundMusic();
      }
    }
  }

  /**
   * Sets music volume
   * 
   * @param {number} volume - Volume level (0.0 to 1.0, clamped)
   * @returns {void}
   */
  setMusicVolume(volume) {
    this.musicVolume = Math.max(0, Math.min(1, volume)); // Clamp to 0-1
    if (this.backgroundMusic) {
      this.backgroundMusic.volume = this.musicVolume;
    }
    if (this.freeSpinMusic) {
      this.freeSpinMusic.volume = this.musicVolume;
    }
  }

  /**
   * Sets sound effects volume
   * 
   * @param {number} volume - Volume level (0.0 to 1.0, clamped)
   * @returns {void}
   */
  setSfxVolume(volume) {
    this.sfxVolume = Math.max(0, Math.min(1, volume)); // Clamp to 0-1
    Object.values(this.soundEffects).forEach(sound => {
      sound.volume = this.sfxVolume;
    });
  }

  /**
   * Cleans up audio resources
   * 
   * Stops all playback and clears references.
   * 
   * @returns {void}
   */
  destroy() {
    this.stopMusic();
    Object.values(this.soundEffects).forEach(sound => {
      sound.pause();
      sound.src = '';
    });
    this.backgroundMusic = null;
    this.freeSpinMusic = null;
    this.soundEffects = {};
  }
}

