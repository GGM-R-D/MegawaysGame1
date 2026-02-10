/**
 * NetworkManager.js - Backend API Communication
 * 
 * Handles all HTTP communication with the RGS (Remote Game Server) backend.
 * Provides methods for starting sessions, sending spin requests, and buying free spins.
 * 
 * Base URL: http://localhost:5100 (configurable via VITE_RGS_BASE_URL env var)
 * 
 * API Endpoints:
 * - POST /{operatorId}/{gameId}/start - Start new game session
 * - POST /{operatorId}/{gameId}/play - Execute a spin
 * - POST /{operatorId}/{gameId}/buy-free-spins - Purchase free spins feature
 */

const DEFAULT_BASE_URL = 'http://localhost:5100';

/**
 * NetworkManager - Handles backend API communication
 */
export default class NetworkManager {
  /**
   * Creates a new NetworkManager instance
   * 
   * @param {Object} [options] - Configuration options
   * @param {string} [options.baseUrl] - Backend base URL (overrides env var)
   * @param {Function} [options.fetchImpl] - Fetch implementation (for testing)
   */
  constructor({ baseUrl, fetchImpl } = {}) {
    // Resolve base URL: explicit param > env var > default
    const resolvedBaseUrl = baseUrl ?? import.meta.env.VITE_RGS_BASE_URL ?? DEFAULT_BASE_URL;
    this.baseUrl = resolvedBaseUrl.replace(/\/+$/, ''); // Remove trailing slashes
    this.fetch = fetchImpl ?? window.fetch.bind(window); // Use provided fetch or default
  }

  /**
   * Starts a new game session with the backend
   * 
   * Creates a new session and returns session information including sessionId,
   * gameId, and initial balance.
   * 
   * @param {string} operatorId - Operator identifier
   * @param {string} gameId - Game identifier (e.g., 'JungleRelics')
   * @param {Object} [payload] - Additional session parameters
   * @param {string} [payload.lang] - Language code (e.g., 'en')
   * @param {number} [payload.funMode] - Fun mode flag (0 = real money, 1 = demo mode)
   * @param {string} [payload.playerToken] - Player token (required when funMode=0)
   * @returns {Promise<Object>} Session information (sessionId, gameId, balance, etc.)
   * @throws {Error} If request fails or response is invalid
   */
  async startSession(operatorId, gameId, payload) {
    if (!operatorId || !gameId) {
      throw new Error('operatorId and gameId are mandatory.');
    }

    const url = `${this.baseUrl}/${encodeURIComponent(operatorId)}/${encodeURIComponent(gameId)}/start`;
    const response = await this.fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload ?? {})
    });

    const data = await this.#handleResponse(response);
    
    // Transform RGS response to match frontend expectations
    // RGS returns: { player: { sessionId, id, balance }, game: {...}, ... } (camelCase or PascalCase)
    const player = data.player ?? {};
    const sessionId = player.sessionId ?? player.SessionId;
    return {
      sessionId,
      gameId: gameId, // Use the gameId from the request
      balance: player.balance ?? player.Balance,
      initialBalance: player.balance ?? player.Balance,
      playerId: player.id ?? player.Id,
      operatorId: operatorId,
      // Include full response for any other fields needed
      ...data
    };
  }

  /**
   * Sends a spin request to the backend
   * 
   * Executes a game spin and returns results including cascades, wins, balance, etc.
   * 
   * @param {string} operatorId - Operator identifier
   * @param {string} gameId - Game identifier
   * @param {Object} requestBody - Spin request payload
   * @param {string} requestBody.sessionId - Current session ID
   * @param {number} requestBody.baseBet - Base bet amount
   * @param {string} requestBody.betMode - Bet mode ('standard' or 'ante')
   * @param {Array} requestBody.bets - Bet array (e.g., [{ betType: 'BASE', amount: 0.2 }])
   * @param {Object} [requestBody.userPayload] - Additional user data
   * @returns {Promise<Object>} Play response (results, win, balance, cascades, etc.)
   * @throws {Error} If request fails or response is invalid
   */
  async play(operatorId, gameId, requestBody) {
    if (!operatorId || !gameId) {
      throw new Error('operatorId and gameId are required for /play.');
    }

    const url = `${this.baseUrl}/${encodeURIComponent(operatorId)}/${encodeURIComponent(gameId)}/play`;
    const response = await this.fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestBody)
    });

    const data = await this.#handleResponse(response);
    
    // Transform RGS response to match frontend expectations
    // RGS returns: { player: { sessionId, roundId, balance, win, bet }, game: { results }, ... }
    // Frontend expects: { results, win, balance, ... }
    return {
      results: data.game?.results,
      win: data.player?.win ?? 0,
      balance: data.player?.balance,
      balanceAfter: data.player?.balance,
      roundId: data.player?.roundId,
      freeSpins: data.freeSpins,
      feature: data.feature,
      // Include full response for any other fields needed
      ...data
    };
  }

  /**
   * Purchases free spins feature
   * 
   * Buys free spins directly (costs 100x base bet). Only available in 'standard' mode.
   * 
   * @param {string} operatorId - Operator identifier
   * @param {string} gameId - Game identifier
   * @param {Object} requestBody - Buy request payload
   * @param {string} requestBody.sessionId - Current session ID
   * @param {number} requestBody.baseBet - Base bet amount
   * @param {string} requestBody.betMode - Must be 'standard'
   * @returns {Promise<Object>} Play response (same format as play(), includes freeSpinsAwarded)
   * @throws {Error} If request fails or response is invalid
   */
  async buyFreeSpins(operatorId, gameId, requestBody) {
    if (!operatorId || !gameId) {
      throw new Error('operatorId and gameId are required for /buy-free-spins.');
    }

    const url = `${this.baseUrl}/${encodeURIComponent(operatorId)}/${encodeURIComponent(gameId)}/buy-free-spins`;
    const response = await this.fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestBody)
    });

    const data = await this.#handleResponse(response);
    
    // Transform RGS response to match frontend expectations (same as play)
    return {
      results: data.game?.results,
      win: data.player?.win ?? 0,
      balance: data.player?.balance,
      balanceAfter: data.player?.balance,
      roundId: data.player?.roundId,
      freeSpins: data.freeSpins,
      feature: data.feature,
      // Include full response for any other fields needed
      ...data
    };
  }

  /**
   * Handles HTTP response and converts to JSON
   * 
   * Checks response status and parses JSON body.
   * Extracts data from RGS API response wrapper.
   * Throws error if response is not OK.
   * 
   * @private
   * @param {Response} response - Fetch Response object
   * @returns {Promise<Object>} Parsed JSON response (extracted from data field)
   * @throws {Error} If response is not OK or JSON is invalid
   */
  async #handleResponse(response) {
    if (!response.ok) {
      const details = await response.text();
      throw new Error(`Network error ${response.status}: ${details}`);
    }

    const payload = await response.json();
    if (!payload || typeof payload !== 'object') {
      throw new Error('Unexpected response shape.');
    }

    // RGS API returns { statusCode, message, data }
    // Extract the data field, or return payload if it's already flat
    if (payload.data !== undefined) {
      return payload.data;
    }
    return payload;
  }
}

