/**
 * main.js - Game Entry Point
 * 
 * This is the main entry point for the Jungle Relics slot game frontend.
 * It initializes the PixiJS application, sets up all managers, handles UI events,
 * and coordinates the game flow between user interactions and backend communication.
 * 
 * Key Responsibilities:
 * - Initialize PixiJS WebGL application
 * - Create and coordinate managers (Network, Theme, Scene)
 * - Handle all UI events (spin, bet adjustment, modals)
 * - Manage game state (bet amount, bet mode, turbo mode)
 * - Start game session with backend
 * - Process spin results and update UI
 * 
 * Dependencies:
 * - PixiJS: WebGL rendering engine
 * - NetworkManager: Backend API communication
 * - ThemeManager: Asset loading
 * - SceneManager: Visual scene orchestration
 */

import * as PIXI from 'pixi.js';
import NetworkManager from './NetworkManager.js';
import ThemeManager from './ThemeManager.js';
import SceneManager from './SceneManager.js';

/**
 * Main entry point - initializes the game application
 * 
 * Flow:
 * 1. Initialize PixiJS app and attach to DOM
 * 2. Create managers (Network, Theme, Scene)
 * 3. Set up UI event listeners
 * 4. Start session with backend
 * 5. Load theme assets
 * 6. Initialize scene
 * 7. Ready for gameplay
 * 
 * @async
 * @returns {Promise<void>}
 */
async function main() {
  // Get the container element for the game canvas
  const canvasParent = document.getElementById('game-root');
  if (!canvasParent) {
    console.error('game-root element not found');
    return;
  }
  
  // Initialize PixiJS WebGL application
  // Use window size for canvas, scaling will be handled by SceneManager
  const app = new PIXI.Application();
  await app.init({
    resolution: window.devicePixelRatio || 1,
    autoDensity: true,
    background: 0x030604, // Dark background color as fallback
    backgroundAlpha: 1,
    resizeTo: window, // Automatically resize canvas to window size (handles responsive scaling)
    antialias: true // Enable anti-aliasing for smoother graphics
  });
  canvasParent.appendChild(app.canvas);
  
  console.log('PixiJS app initialized, canvas size:', app.renderer.width, 'x', app.renderer.height);

  // Create managers - these handle different aspects of the game
  const network = new NetworkManager(); // Handles backend API communication
  const themeManager = new ThemeManager(); // Loads game assets (symbols, textures)
  const sceneManager = new SceneManager({ app, assets: PIXI.Assets }); // Manages visual scene

  // Game state variables
  let sessionInfo = null; // Session data from backend (sessionId, gameId, balance, etc.)
  let activeBetMode = 'standard'; // Bet mode: 'standard' or 'ante'
  // Bet levels from backend (Buffalo King Megaways style); fallback until session returns game.bet.levels
  const betLevelsFallback = [0.20, 0.40, 0.60, 0.80, 1.00, 1.20, 1.40, 1.60, 1.80, 2.00, 2.40, 2.80, 3.00, 3.20, 3.60, 4.00, 5.00, 6.00, 7.00, 8.00, 9.00, 10.00, 12, 14, 16, 18, 20, 24, 28, 30, 32, 36, 40, 50, 60, 70, 80, 90, 100];
  let betLevels = [...betLevelsFallback];
  let currentBetIndex = 0; // Index into betLevels
  let currentBaseBet = betLevels[0]; // Current bet amount in currency units
  let isTurboMode = false; // Turbo mode flag (speeds up animations)

  // Get references to UI elements from index.html
  const spinButton = document.getElementById('btn-spin');
  const buyButton = document.getElementById('btn-buy');
  const betModeInputs = document.querySelectorAll('input[name="bet-mode"]');
  const turboButton = document.getElementById('btn-turbo');
  // ROUND and CURRENT WIN elements removed - no longer needed
  // const roundLabel = document.getElementById('round-label');
  // const roundWinLabel = document.getElementById('round-win');
  const betAmountLabel = document.getElementById('bet-amount');
  const totalWinLabel = document.getElementById('win-amount');
  const balanceLabel = document.getElementById('balance-amount');
  const freeSpinsCard = document.getElementById('free-spins-card');
  const freeSpinsLeftEl = document.getElementById('free-spins-left');
  let freeSpinsLeft = 0; // from last play response (data.freeSpins.left)
  const timestampBox = document.getElementById('timestamp-box');
  const infoButton = document.getElementById('btn-info');
  const soundButton = document.getElementById('btn-sound');
  // Audio is now handled by AudioManager in SceneManager

  /**
   * Extracts money amount from various value formats
   * 
   * Handles different backend response formats:
   * - Number: returns as-is
   * - String: parses to number
   * - Object with .amount: recursively extracts
   * - Null/undefined: returns 0
   * 
   * @param {any} value - Money value in various formats
   * @returns {number} - Extracted money amount (0 if invalid)
   */
  const getMoneyAmount = (value) => {
    if (value == null) {
      return 0;
    }

    if (typeof value === 'number') {
      return value;
    }

    if (typeof value === 'string') {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : 0;
    }

    if (typeof value === 'object' && value.amount != null) {
      return getMoneyAmount(value.amount);
    }

    return 0;
  };

  // Set up bet mode radio button listeners
  // Bet mode can be 'standard' or 'ante' (ante has higher volatility, 1.25x total bet)
  betModeInputs.forEach((input) => {
    input.addEventListener('change', (event) => {
      if (event.target.checked) {
        activeBetMode = event.target.value;
        updateControlStates(); // Update button states (buy button disabled in ante mode)
        updateBetDisplay(); // Show new total (base vs base * 1.25 for ante)
      }
    });
  });

  /**
   * Starts background music on first user interaction
   * 
   * Browsers block autoplay of audio, so we need to wait for user interaction.
   * This function is called once on first click/touch, then removes itself.
   */
  const startMusicOnInteraction = () => {
    if (sceneManager.audioManager && sceneManager.audioManager.currentMusic === null) {
      sceneManager.audioManager.playBackgroundMusic();
    }
    document.removeEventListener('click', startMusicOnInteraction);
    document.removeEventListener('touchstart', startMusicOnInteraction);
  };
  document.addEventListener('click', startMusicOnInteraction, { once: true });
  document.addEventListener('touchstart', startMusicOnInteraction, { once: true });

  // Spin button - main game action
  spinButton.addEventListener('click', () => {
    console.log('Spin button clicked, sessionInfo:', sessionInfo);
    sceneManager.audioManager?.playClick(); // Play click sound
    startMusicOnInteraction(); // Ensure music starts (if not already)
    startSpin(); // Start the spin process
  });
  
  // Buy Free Spins button - show confirmation popup (cost 100× bet), then send play with isFeatureBuy
  const buyConfirmModal = document.getElementById('buy-confirm-modal');
  const buyConfirmCostEl = document.getElementById('buy-confirm-cost');
  const buyConfirmYes = document.getElementById('buy-confirm-yes');
  const buyConfirmNo = document.getElementById('buy-confirm-no');
  const closeBuyConfirm = document.getElementById('close-buy-confirm-modal');

  buyButton.addEventListener('click', () => {
    sceneManager.audioManager?.playClick();
    startMusicOnInteraction();
    if (!sessionInfo || activeBetMode !== 'standard') return;
    const cost = Math.round(currentBaseBet * 100 * 100) / 100;
    buyConfirmCostEl.textContent = formatBetAmount(cost);
    buyConfirmModal.classList.add('active');
  });

  function closeBuyConfirmModal() {
    buyConfirmModal.classList.remove('active');
  }
  closeBuyConfirm?.addEventListener('click', () => { sceneManager.audioManager?.playClick(); closeBuyConfirmModal(); });
  buyConfirmNo?.addEventListener('click', () => { sceneManager.audioManager?.playClick(); closeBuyConfirmModal(); });
  buyConfirmYes?.addEventListener('click', () => {
    sceneManager.audioManager?.playClick();
    closeBuyConfirmModal();
    executePlay(true); // isFeatureBuy = true
  });
  
  // Initialize UI with default values (updateBetDisplay defined below)
  updateControlStates(); // Set initial button states

  /** Format bet for display (e.g. 0.2 -> "0.20", 12 -> "12.00") */
  function formatBetAmount(amount) {
    const n = Number(amount);
    return Number.isFinite(n) ? n.toFixed(2) : '0.00';
  }

  /** Ante mode multiplies total bet by 1.25 (backend uses same multiplier) */
  const ANTE_BET_MULTIPLIER = 1.25;
  /** Amount shown in TOTAL BET: base stake, or base * 1.25 in ante mode */
  function getDisplayBetAmount() {
    const base = Number(currentBaseBet);
    if (activeBetMode === 'ante') {
      return Math.round(base * ANTE_BET_MULTIPLIER * 100) / 100;
    }
    return base;
  }
  function updateBetDisplay() {
    if (freeSpinsLeft > 0) {
      betAmountLabel.textContent = 'FREE';
    } else {
      betAmountLabel.textContent = formatBetAmount(getDisplayBetAmount());
    }
  }

  function updateFreeSpinsDisplay() {
    if (freeSpinsLeftEl) freeSpinsLeftEl.textContent = String(freeSpinsLeft);
    if (freeSpinsCard) freeSpinsCard.style.display = freeSpinsLeft > 0 ? '' : 'none';
    updateBetDisplay();
  }

  // Bet adjustment buttons (up/down) - step through backend bet levels
  const betUpButton = document.getElementById('bet-up');
  const betDownButton = document.getElementById('bet-down');

  // Increase bet (next level)
  betUpButton.addEventListener('click', () => {
    sceneManager.audioManager?.playClick();
    if (currentBetIndex < betLevels.length - 1) {
      currentBetIndex += 1;
      currentBaseBet = betLevels[currentBetIndex];
      updateBetDisplay();
    }
  });

  // Decrease bet (previous level)
  betDownButton.addEventListener('click', () => {
    sceneManager.audioManager?.playClick();
    if (currentBetIndex > 0) {
      currentBetIndex -= 1;
      currentBaseBet = betLevels[currentBetIndex];
      updateBetDisplay();
    }
  });

  updateBetDisplay(); // Initial TOTAL BET label (standard = base, ante = base * 1.25)

  // Turbo mode button - speeds up all animations by 60%
  if (turboButton) {
    turboButton.disabled = false;
    turboButton.addEventListener('click', () => {
      sceneManager.audioManager?.playClick();
      isTurboMode = !isTurboMode;
      turboButton.textContent = isTurboMode ? 'Turbo ON' : 'Turbo';
      turboButton.style.background = isTurboMode 
        ? 'rgba(255, 215, 0, 0.4)' 
        : 'rgba(0, 0, 0, 0.6)';
      
      // Apply turbo mode to scene manager (speeds up all animations)
      sceneManager.setTurboMode(isTurboMode);
    });
  }

  /**
   * Updates the timestamp display in the top-right HUD
   * Called every second to show current time
   */
  function updateTimestamp() {
    const now = new Date();
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');
    timestampBox.textContent = `${hours}:${minutes}:${seconds}`;
  }
  updateTimestamp(); // Initial update
  setInterval(updateTimestamp, 1000); // Update every second

  // Bet adjustment modal - bet levels from backend (all levels shown as quick buttons)
  const betModal = document.getElementById('bet-modal');
  const betInput = document.getElementById('bet-input');
  const applyBetButton = document.getElementById('apply-bet');
  const closeBetModal = document.getElementById('close-bet-modal');
  const betButtonsContainer = document.querySelector('.bet-buttons');

  /** Build quick bet buttons from current betLevels (called after session load and when levels change) */
  function buildBetQuickButtons() {
    if (!betButtonsContainer) return;
    betButtonsContainer.innerHTML = '';
    betLevels.forEach((level) => {
      const btn = document.createElement('button');
      btn.className = 'bet-quick-button';
      btn.dataset.bet = String(level);
      btn.textContent = formatBetAmount(level);
      btn.addEventListener('click', () => {
        sceneManager.audioManager?.playClick();
        const betValue = parseFloat(btn.dataset.bet);
        betInput.value = formatBetAmount(betValue);
        updateBetQuickButtonsHighlight();
      });
      betButtonsContainer.appendChild(btn);
    });
  }

  /** Highlight the quick button that matches current input value */
  function updateBetQuickButtonsHighlight() {
    const currentBet = parseFloat(betInput.value) || 0;
    betButtonsContainer.querySelectorAll('.bet-quick-button').forEach(btn => {
      const btnBet = parseFloat(btn.dataset.bet);
      btn.classList.toggle('active', Math.abs(btnBet - currentBet) < 0.01);
    });
  }

  // Build quick buttons on load (uses fallback betLevels until session returns)
  buildBetQuickButtons();

  // Clicking bet amount label opens modal
  betAmountLabel.addEventListener('click', () => {
    sceneManager.audioManager?.playClick();
    betInput.value = formatBetAmount(currentBaseBet);
    betInput.min = betLevels[0];
    betInput.max = betLevels[betLevels.length - 1];
    updateBetQuickButtonsHighlight();
    betModal.classList.add('active');
  });

  // Close modal button
  closeBetModal.addEventListener('click', () => {
    sceneManager.audioManager?.playClick();
    betModal.classList.remove('active');
  });

  // Apply button - snap to nearest bet level and close modal
  applyBetButton.addEventListener('click', () => {
    sceneManager.audioManager?.playClick();
    const raw = parseFloat(betInput.value);
    if (!Number.isFinite(raw) || raw <= 0) return;
    // Find nearest bet level
    let bestIdx = 0;
    let bestDiff = Math.abs(betLevels[0] - raw);
    for (let i = 1; i < betLevels.length; i++) {
      const d = Math.abs(betLevels[i] - raw);
      if (d < bestDiff) {
        bestDiff = d;
        bestIdx = i;
      }
    }
    currentBetIndex = bestIdx;
    currentBaseBet = betLevels[currentBetIndex];
    updateBetDisplay();
    betModal.classList.remove('active');
  });

  // Update quick button highlight as user types
  betInput.addEventListener('input', updateBetQuickButtonsHighlight);

  // Info modal - displays game rules and paytable
  const infoModal = document.getElementById('info-modal');
  const closeInfoModal = document.getElementById('close-info-modal');

  infoButton.addEventListener('click', () => {
    sceneManager.audioManager?.playClick();
    infoModal.classList.add('active');
  });

  closeInfoModal.addEventListener('click', () => {
    sceneManager.audioManager?.playClick();
    infoModal.classList.remove('active');
  });

  // Sound settings modal - controls music and SFX volumes
  const soundModal = document.getElementById('sound-modal');
  const closeSoundModal = document.getElementById('close-sound-modal');
  const musicVolumeSlider = document.getElementById('music-volume');
  const sfxVolumeSlider = document.getElementById('sfx-volume');
  const musicVolumeValue = document.getElementById('music-volume-value');
  const sfxVolumeValue = document.getElementById('sfx-volume-value');
  const muteAllButton = document.getElementById('mute-all');

  soundButton.addEventListener('click', () => {
    sceneManager.audioManager?.playClick();
    soundModal.classList.add('active');
  });

  closeSoundModal.addEventListener('click', () => {
    sceneManager.audioManager?.playClick();
    soundModal.classList.remove('active');
  });

  // Music volume slider - controls background music volume (0-100%)
  musicVolumeSlider.addEventListener('input', (e) => {
    const volume = parseInt(e.target.value) / 100; // Convert 0-100 to 0.0-1.0
    sceneManager.audioManager?.setMusicVolume(volume);
    musicVolumeValue.textContent = `${e.target.value}%`; // Update display
  });

  // SFX volume slider - controls sound effects volume (0-100%)
  sfxVolumeSlider.addEventListener('input', (e) => {
    const volume = parseInt(e.target.value) / 100; // Convert 0-100 to 0.0-1.0
    sceneManager.audioManager?.setSfxVolume(volume);
    sfxVolumeValue.textContent = `${e.target.value}%`; // Update display
  });

  // Mute/Unmute all button - toggles all audio on/off
  muteAllButton.addEventListener('click', () => {
    sceneManager.audioManager?.playClick();
    const isMuted = sceneManager.audioManager?.isMuted || false;
    sceneManager.audioManager?.setMuted(!isMuted);
    muteAllButton.textContent = !isMuted ? 'Unmute All' : 'Mute All';
  });

  // Close modals when clicking outside the modal content
  [betModal, infoModal, soundModal, buyConfirmModal].filter(Boolean).forEach(modal => {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        modal.classList.remove('active');
      }
    });
  });

  // Initialize game - connect to backend, load assets, set up scene
  try {
    console.log('Attempting to start session with backend at:', network.baseUrl);
    
    // Step 1: Start game session with backend (RGS service)
    // This creates a new session and returns session info (sessionId, gameId, balance, etc.)
    const operatorId = 'operatorX';
    // For real money mode (funMode=0), playerToken is required
    // For development/testing, use a test token
    const playerToken = 'test-player-token-12345';
    const startResponse = await network.startSession(operatorId, 'JungleRelics', {
      lang: 'en',
      funMode: 0, // Real money mode
      playerToken: playerToken
    });

    sessionInfo = { ...startResponse, operatorId }; // Store session info including operatorId for subsequent API calls
    console.log('Session started, gameId:', startResponse.gameId);

    // Use bet levels from backend (game.bet.levels) so frontend shows same levels as config
    const levels = startResponse.game?.bet?.levels;
    if (Array.isArray(levels) && levels.length > 0) {
      betLevels = levels.map((v) => Number(v));
      const defaultIdx = Math.max(0, Math.min(
        Number(startResponse.game?.bet?.default ?? 0),
        betLevels.length - 1
      ));
      currentBetIndex = defaultIdx;
      currentBaseBet = betLevels[currentBetIndex];
      updateBetDisplay();
      buildBetQuickButtons();
    }

    // Step 2: Load theme assets (symbols, textures, animations)
    console.log('Loading theme...');
    const themeManifest = await themeManager.loadTheme(startResponse.gameId, PIXI.Assets);
    console.log('Theme loaded, manifest:', themeManifest);
    
    // Step 3: Initialize scene (grid, backgrounds, animations)
    console.log('Initializing scene...');
    await sceneManager.initialize(themeManifest);
    console.log('Game initialized successfully');
    
    // Step 4: Initialize UI with balance from session
    const initialBalance = getMoneyAmount(startResponse.balance ?? startResponse.initialBalance);
    if (initialBalance > 0) {
      balanceLabel.textContent = initialBalance.toFixed(2);
    }
  } catch (error) {
    console.error('Failed to initialize game:', error);
    console.error('Error details:', {
      message: error.message,
      stack: error.stack,
      baseUrl: network.baseUrl
    });
    
    // Backend connection is required - show error and stop initialization
    const gameRoot = document.getElementById('game-root');
    if (gameRoot) {
      const errorMessage = error?.message || 'Unknown error';
      gameRoot.innerHTML = `<div style="color: white; padding: 40px; text-align: center; background: rgba(0,0,0,0.9); height: 100vh; display: flex; flex-direction: column; justify-content: center; align-items: center;">
        <h2 style="color: #ff6b6b; margin-bottom: 20px;">Backend Connection Failed</h2>
        <p style="margin: 10px 0;"><strong>Error:</strong></p>
        <p style="margin: 10px 0; color: #ffd93d;">${errorMessage}</p>
        <p style="margin: 20px 0; font-size: 14px;">Please ensure the backend services are running:</p>
        <ul style="text-align: left; display: inline-block; margin: 20px 0;">
          <li>RGS service on port 5100</li>
          <li>Game Engine on port 5101</li>
          <li>RNG Host on port 5102</li>
        </ul>
        <p style="margin-top: 20px; font-size: 12px; color: #888;">Check the browser console (F12) for more details.</p>
      </div>`;
    }
  }
  // ROUND and CURRENT WIN elements removed - no longer needed
  // roundLabel and roundWinLabel are null, so skip updates
  
  // Balance will be initialized from sessionInfo after successful initialization

  /**
   * Refreshes the game session (e.g. after RGS restart). Updates sessionInfo, bet levels, and balance.
   * @returns {Promise<boolean>} true if refresh succeeded
   */
  async function refreshSession() {
    const operatorId = sessionInfo?.operatorId || 'operatorX';
    try {
      const startResponse = await network.startSession(operatorId, 'JungleRelics', {
        lang: 'en',
        funMode: 0,
        playerToken: 'test-player-token-12345'
      });
      sessionInfo = { ...startResponse, operatorId };
      const levels = startResponse.game?.bet?.levels;
      if (Array.isArray(levels) && levels.length > 0) {
        betLevels = levels.map((v) => Number(v));
        const defaultIdx = Math.max(0, Math.min(Number(startResponse.game?.bet?.default ?? 0), betLevels.length - 1));
        currentBetIndex = defaultIdx;
        currentBaseBet = betLevels[currentBetIndex];
        updateBetDisplay();
        buildBetQuickButtons();
      }
      const balance = getMoneyAmount(startResponse.balance ?? startResponse.initialBalance);
      if (balance > 0) balanceLabel.textContent = balance.toFixed(2);
      console.log('[main] Session refreshed, new sessionId:', sessionInfo.sessionId ? 'ok' : 'missing');
      return !!sessionInfo.sessionId;
    } catch (e) {
      console.error('[main] Session refresh failed:', e);
      return false;
    }
  }

  /**
   * Handles spin button click - main game action
   * 
   * Flow:
   * 1. Validate session exists
   * 2. Disable UI controls
   * 3. Start visual spin animation
   * 4. Send spin request to backend
   * 5. Render results (cascades, wins, etc.)
   * 6. Update UI (balance, win amount, round ID)
   * 7. Re-enable UI controls
   * 
   * @async
   * @returns {Promise<void>}
   */
  async function startSpin() {
    // Validate session exists
    if (!sessionInfo) {
      console.error('Cannot spin: sessionInfo is not set. Initialization may have failed.');
      console.log('sessionInfo:', sessionInfo);
      return;
    }
    if (!sessionInfo.sessionId) {
      console.error('Cannot spin: sessionId is missing. RGS may have returned an unexpected format.');
      return;
    }
    console.log('Starting spin with sessionInfo:', sessionInfo);
    executePlay(false);
  }

  /**
   * Sends a play request (normal spin or feature buy), then runs animation and renders results.
   * @param {boolean} isFeatureBuy - If true, backend treats as buy free spins (100× bet), uses free spins reels and awards free spins.
   */
  async function executePlay(isFeatureBuy) {
    setControlsDisabled(true);
    totalWinLabel.textContent = '0.00';

    const doPlay = () => {
      const playPayload = {
        sessionId: sessionInfo.sessionId,
        baseBet: currentBaseBet,
        betMode: activeBetMode,
        bets: [{ betType: 'BASE', amount: currentBaseBet }],
        userPayload: { lang: 'en' },
        isFeatureBuy: !!isFeatureBuy
      };
      return network.play(sessionInfo.operatorId || 'operatorX', sessionInfo.gameId, playPayload);
    };

    try {
      let playResponse;
      try {
        console.log('[main] Sending play request...', isFeatureBuy ? '(feature buy)' : '');
        playResponse = await doPlay();
      } catch (playErr) {
        const is401 = (playErr?.message?.includes('401') || playErr?.message?.includes('Invalid session'));
        if (is401) {
          console.warn('[main] Invalid session. Refreshing and retrying...');
          const refreshed = await refreshSession();
          if (refreshed) {
            playResponse = await doPlay();
          } else {
            throw playErr;
          }
        } else {
          throw playErr;
        }
      }

      // Preload result, then start visual spin and render results
      sceneManager.preloadSpinResult(playResponse.results);
      sceneManager.startSpinAnimation();
      sceneManager.renderResults(playResponse.results, playResponse, {
        onCascadeWin: (stepIndex, stepWin, runningTotal) => {
          totalWinLabel.textContent = runningTotal.toFixed(2);
        }
      });

      const winAmount = getMoneyAmount(playResponse.win);
      const balance = getMoneyAmount(playResponse.balance ?? playResponse.balanceAfter);
      totalWinLabel.textContent = winAmount.toFixed(2);
      if (balance > 0) {
        balanceLabel.textContent = balance.toFixed(2);
      }
      // Update free spins left from response (data.freeSpins.left)
      freeSpinsLeft = playResponse.freeSpins?.left ?? playResponse.freeSpins?.Left ?? 0;
      updateFreeSpinsDisplay();
    } catch (err) {
      console.error('Play failed', err);
      sceneManager.stopSpinAnimation();
    } finally {
      setControlsDisabled(false);
    }
  }

  /**
   * Enables or disables UI controls
   * 
   * Used during spins to prevent multiple simultaneous actions.
   * Buy button is also disabled in 'ante' mode.
   * 
   * @param {boolean} disabled - True to disable, false to enable
   */
  function setControlsDisabled(disabled) {
    spinButton.disabled = disabled;
    buyButton.disabled = disabled || activeBetMode === 'ante'; // Also disabled in ante mode
    if (turboButton) {
      turboButton.disabled = true; // Always disabled during spin
    }
    betModeInputs.forEach((input) => {
      input.disabled = disabled;
    });
  }

  /**
   * Updates control states based on current game state
   * 
   * Called when bet mode changes or after spin completes.
   * Ensures buy button is disabled in ante mode.
   */
  function updateControlStates() {
    setControlsDisabled(false);
    buyButton.disabled = activeBetMode === 'ante'; // Buy not available in ante mode
  }
}

// Start the game - catch any initialization errors
main().catch((err) => {
  // Log detailed error information
  console.error('Bootstrap failed', err);
  console.error('Bootstrap error details:', {
    message: err?.message,
    stack: err?.stack,
    name: err?.name
  });
  
  // Show error message to user
  const gameRoot = document.getElementById('game-root');
  if (gameRoot && !gameRoot.querySelector('div[style*="Initialization Error"]')) {
    gameRoot.innerHTML = `<div style="color: white; padding: 40px; text-align: center; background: rgba(0,0,0,0.9); height: 100vh; display: flex; flex-direction: column; justify-content: center; align-items: center;">
      <h2 style="color: #ff6b6b; margin-bottom: 20px;">Bootstrap Error</h2>
      <p style="margin: 10px 0; color: #ffd93d;">${err?.message || 'Unknown error'}</p>
      <p style="margin-top: 20px; font-size: 12px; color: #888;">Check the browser console (F12) for more details.</p>
    </div>`;
  }
  
  // ROUND element removed - no longer update it
});

