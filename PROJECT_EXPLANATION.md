# Jungle Relics Slot Game - Complete Project Explanation

## 📋 Table of Contents
1. [Project Overview](#project-overview)
2. [Architecture](#architecture)
3. [Backend Services](#backend-services)
4. [Frontend Components](#frontend-components)
5. [Game Mechanics](#game-mechanics)
6. [Data Flow](#data-flow)
7. [Configuration System](#configuration-system)
8. [Key Technologies](#key-technologies)
9. [File Structure](#file-structure)
10. [Modification Guide](#modification-guide)

---

## 🎮 Project Overview

**Jungle Relics** is a cascading slot game built with a microservices architecture. The game features:
- **6x5 grid** (6 columns, 5 rows)
- **Cascading mechanics** - winning symbols disappear and new ones fall into place
- **Free spins** with multipliers
- **Two bet modes**: Standard and Ante (higher volatility)
- **Buy feature** - purchase free spins directly
- **Multiplier symbols** that enhance wins
- **Scatter symbols** that trigger free spins

### Game Flow
1. Player places a bet and spins
2. Reels spin and stop to reveal symbols
3. Winning combinations are evaluated (8+ matching symbols)
4. Winning symbols cascade (disappear and fall)
5. New symbols drop into place
6. Process repeats until no more wins
7. Scatter symbols can trigger free spins
8. Multipliers accumulate during free spins

---

## 🏗️ Architecture

The project uses a **3-tier microservices architecture**:

```
┌─────────────┐
│  Frontend   │  (PixiJS + Vite)
│  Port 3010  │
└──────┬──────┘
       │ HTTP
       ▼
┌─────────────┐
│     RGS     │  (Game Session Manager)
│  Port 5100  │
└──────┬──────┘
       │ HTTP
       ▼
┌─────────────┐
│ Game Engine │  (Core Game Logic)
│  Port 5101  │
└──────┬──────┘
       │ HTTP
       ▼
┌─────────────┐
│   RNG Host  │  (Random Number Generator)
│  Port 5102  │
└─────────────┘
```

### Service Responsibilities

1. **RGS (Remote Game Server)** - Session management, bet validation, API gateway
2. **Game Engine Host** - Core game logic, cascading mechanics, win evaluation
3. **RNG Host** - Provides cryptographically secure random numbers
4. **Frontend** - Visual rendering, animations, user interaction

---

## 🔧 Backend Services

### 1. RGS (Remote Game Server)
**Location**: `backend/RGS/RGS/`

**Purpose**: Manages game sessions and acts as API gateway between frontend and game engine.

**Key Files**:
- `Program.cs` - Main entry point, defines API endpoints
- `Services/SessionManager.cs` - Tracks active game sessions
- `Services/EngineHttpClient.cs` - HTTP client for game engine communication
- `configs/JungleRelics.json` - Game configuration
- `configs/JungleRelicsReelsets.json` - Reel strip definitions

**API Endpoints**:
- `POST /{operatorId}/{gameId}/start` - Start new game session
- `POST /{gameId}/play` - Execute a spin
- `POST /{gameId}/buy-free-spins` - Purchase free spins feature

**Key Features**:
- Session state management
- Bet validation and calculation
- CORS support for frontend
- Converts client requests to engine format

### 2. Game Engine Host
**Location**: `backend/GameEngineHost/`

**Purpose**: Core game logic engine that processes spins and calculates outcomes.

**Key Components**:

#### SpinHandler.cs
The heart of the game engine. Handles:
- Reel strip selection based on bet mode
- Random number generation via RNG service
- Board creation and symbol placement
- **Cascading loop**:
  1. Evaluate wins
  2. Apply multipliers
  3. Remove winning symbols
  4. Refill board
  5. Repeat until no wins
- Scatter evaluation
- Free spin state management

#### WinEvaluator.cs
- Evaluates winning combinations
- Requires **8+ matching symbols** (not traditional paylines)
- Calculates payouts based on symbol count and paytable
- Returns list of all symbol wins

#### EngineState.cs
Manages game state:
- `EngineSessionState` - Overall session state
- `FreeSpinState` - Free spin tracking (spins remaining, total multiplier, feature win)
- State cloning for immutability

**Key Classes**:
- `ReelBoard` - Internal board representation with columns
- `ReelColumn` - Individual reel with symbol instances
- `SymbolInstance` - Symbol with multiplier value
- `RandomContext` - Manages RNG seeds for reels and multipliers

### 3. RNG Host
**Location**: `backend/RngHost/`

**Purpose**: Provides random number generation service.

**Features**:
- Simple HTTP endpoint: `POST /pools`
- Returns random numbers for reel starts and multiplier seeds
- Uses `Random.Shared` (can be replaced with cryptographic RNG)

---

## 🎨 Frontend Components

**Location**: `frontend/`

**Tech Stack**:
- **PixiJS 8.1.0** - 2D WebGL rendering
- **GSAP 3.12.5** - Animation library
- **Howler 2.2.4** - Audio management
- **Vite 7.2.4** - Build tool and dev server

### Core Modules

#### 1. main.js
**Entry point** that:
- Initializes PixiJS application
- Sets up UI event handlers (spin, bet adjustment, modals)
- Manages game state (bet amount, bet mode, turbo mode)
- Coordinates between NetworkManager, ThemeManager, and SceneManager
- Handles user interactions

**Key State Variables**:
- `sessionInfo` - Current game session
- `activeBetMode` - 'standard' or 'ante'
- `currentBaseBet` - Current bet amount
- `isTurboMode` - Animation speed toggle

#### 2. SceneManager.js
**Orchestrates visual presentation**:
- Manages layers (background, scene, transition)
- Handles free spin transitions
- Coordinates grid rendering and animations
- Manages background animations (Background1/Background2)
- Audio integration

**Key Methods**:
- `initialize()` - Sets up game scene
- `renderResults()` - Processes game results and triggers animations
- `startSpinAnimation()` - Begins reel spinning
- `playFreeSpinTransition()` - Plays free spin intro video

#### 3. GridRenderer.js
**Renders the slot grid** (6x5):
- Dual-layer system: **spin layer** (during spin) and **grid layer** (cascading)
- Manages reel columns with masking
- Handles symbol positioning and transitions
- Implements cascading animations (fade out, drop down)

**Key Features**:
- **Spin Mode**: Reels spin with blur effect, random symbols
- **Grid Mode**: Static symbols for cascade evaluation
- **Smooth transitions** between modes
- **Turbo mode** support (60% faster animations)

**Important Constants** (modifiable):
- `SPIN_BASE_TIME` - Base spin duration (1200ms)
- `CASCADE_DROP_DURATION` - Symbol drop time (0.35s)
- `CASCADE_FADE_DURATION` - Win fade time (0.15s)
- `SLOT_SCALE` - Grid size multiplier (1.15)
- `SLOT_Y_OFFSET` - Vertical position (-160px)

#### 4. AnimationManager.js
**Manages cascade sequence animations**:
- Highlights winning symbols
- Fades out winning symbols
- Animates symbol drops
- Plays win sounds
- Supports turbo mode (40% duration)

**Animation Timeline**:
1. Hold (0.25s) - Show grid
2. Highlight (0.60s) - Scale winning symbols
3. Post-delay (0.50s) - Pause
4. Fade (0.50s) - Remove winners
5. Drop (0.55s) - New symbols fall

#### 5. NetworkManager.js
**Handles API communication**:
- `startSession()` - Initialize game session
- `play()` - Send spin request
- `buyFreeSpins()` - Purchase feature
- Base URL: `http://localhost:5100` (configurable via env)

#### 6. ThemeManager.js
**Loads game assets**:
- Fetches theme manifest from `/themes/{gameId}/manifest.json`
- Loads symbol textures, animations, sounds
- Uses PixiJS Assets API

#### 7. AudioManager.js
**Sound management**:
- Background music (looping)
- Free spin music (different track)
- Sound effects (spin, stop, win, big win, click)
- Volume controls (music/SFX separate)
- Mute functionality

#### 8. SymbolRenderer.js
**Renders individual symbols** with proper scaling and positioning.

#### 9. BackgroundAnimation.js
**Animated background** using frame sequences:
- Background1: 105 frames (base game)
- Background2: 151 frames (free spins)

#### 10. FreeSpinTransition.js
**Video transition** when free spins trigger (MP4 file).

---

## 🎲 Game Mechanics

### Cascading System

The core mechanic is **cascading wins**:

1. **Initial Spin**: Reels stop, grid is evaluated
2. **Win Detection**: 8+ matching symbols = win
3. **Multiplier Application**: Sum all multiplier symbols on board
4. **Symbol Removal**: Winning symbols disappear
5. **Gravity**: Remaining symbols fall down
6. **Refill**: New symbols drop from top
7. **Repeat**: Process continues until no wins
8. **Scatter Check**: After cascades, check for scatter triggers

### Win Evaluation

**No traditional paylines!** Instead:
- Count all instances of each symbol on the grid
- Minimum **8 symbols** required for a win
- Payout tiers based on symbol count:
  - 8 symbols = base payout
  - 10 symbols = higher payout
  - 12+ symbols = highest payout

**Example Paytable** (from config):
```json
{
  "symbolCode": "BIRD",
  "multipliers": [
    { "count": 8, "multiplier": 10.0 },
    { "count": 10, "multiplier": 25.0 },
    { "count": 12, "multiplier": 50.0 },
    { "count": 15, "multiplier": 100.0 }
  ]
}
```

### Multiplier System

**Multiplier Symbols**:
- Appear on the grid randomly
- Values: 2x, 3x, 4x, 5x, 6x, 8x, 10x, 12x, 15x, 20x, 25x, 50x, 100x, 250x, 500x
- **Base Game**: Sum all multipliers, apply to win
- **Free Spins**: Accumulate multipliers across all cascades

**Multiplier Weights**:
- Different probability distributions for:
  - Standard mode
  - Ante mode
  - Free spins (high/low based on accumulated multiplier)

### Free Spins

**Trigger Conditions**:
- 4+ scatter symbols (FACE) in base game
- Or purchase via "Buy Free Spins" button

**Free Spin Features**:
- **15 initial spins**
- **5 retrigger spins** for 3+ scatters
- **Accumulating multipliers** - multipliers add to total, applied to all wins
- **Separate reel set** - different symbol distribution
- **Background change** - switches to Background2 animation

**Free Spin State**:
- Tracks spins remaining
- Accumulates total multiplier
- Tracks feature win (all wins during free spins)
- Persists across spins until exhausted

### Bet Modes

#### Standard Mode
- Base bet multiplier: 20x
- Reel weights: 860 low / 140 high (more low-value symbols)
- Lower volatility

#### Ante Mode
- Base bet multiplier: 25x (25% higher)
- Reel weights: 160 low / 840 high (more high-value symbols)
- Higher volatility
- Cannot buy free spins

### Buy Feature

- **Cost**: 100x base bet
- **Available**: Standard mode only
- **Guarantees**: Entry into free spins
- **Uses**: Special "buy" reel set

---

## 🔄 Data Flow

### Spin Request Flow

```
1. User clicks SPIN
   ↓
2. Frontend (main.js)
   - Calls NetworkManager.play()
   - Sends: sessionId, baseBet, betMode, bets[]
   ↓
3. RGS (Program.cs)
   - Validates session
   - Calculates total bet
   - Converts to PlayRequest
   ↓
4. Game Engine (SpinHandler.cs)
   - Selects reel strips
   - Requests RNG seeds
   - Creates board
   - Runs cascade loop
   - Evaluates scatters
   - Returns PlayResponse
   ↓
5. RGS
   - Updates session state
   - Returns response to frontend
   ↓
6. Frontend (SceneManager.js)
   - Receives results
   - Renders cascades
   - Plays animations
   - Updates UI
```

### Cascade Data Structure

```javascript
{
  cascades: [
    {
      index: 0,
      gridBefore: ["BIRD", "SCARAB", ...],  // 30 symbols (6x5)
      gridAfter: ["GREEN", "RED", ...],     // After cascade
      winsAfterCascade: [
        {
          symbolCode: "BIRD",
          count: 10,
          multiplier: 25.0,
          amount: 50.00,
          indices: [0, 1, 2, ...]  // Grid positions
        }
      ],
      baseWin: 50.00,
      appliedMultiplier: 2.0,
      totalWin: 100.00
    },
    // ... more cascade steps
  ],
  finalGridSymbols: [...],
  wins: [...],  // All wins across all cascades
  scatter: {
    symbolCount: 4,
    win: 3.00,
    freeSpinsAwarded: 15
  },
  freeSpins: {
    spinsRemaining: 14,
    totalMultiplier: 5.0,
    featureWin: 250.00,
    triggeredThisSpin: false
  }
}
```

---

## ⚙️ Configuration System

### Game Configuration
**File**: `backend/RGS/RGS/configs/JungleRelics.json`

**Key Sections**:

```json
{
  "board": { "columns": 6, "rows": 5 },
  "symbolCatalog": [...],  // All symbols with types
  "betLedger": {
    "baseBetMultiplier": 20,
    "anteBetMultiplier": 25,
    "buyFreeSpinsCostMultiplier": 100
  },
  "betModes": {
    "standard": { "reelWeights": { "low": 860, "high": 140 } },
    "ante": { "reelWeights": { "low": 160, "high": 840 } }
  },
  "paytable": [...],  // Symbol payouts
  "multiplier": {
    "values": [2, 3, 4, ...],
    "weights": { ... }  // Probability distributions
  },
  "scatter": {
    "rewards": [
      { "count": 4, "payoutMultiplier": 3.0, "freeSpinsAwarded": 15 }
    ]
  },
  "freeSpins": {
    "initialSpins": 15,
    "retriggerSpins": 5,
    "retriggerScatterCount": 3
  },
  "maxWinMultiplier": 39221
}
```

### Reel Sets
**File**: `backend/RGS/RGS/configs/JungleRelicsReelsets.json`

Defines symbol strips for each reel column:
- `reelsetHigh` - High-value symbol distribution
- `reelsetLow` - Low-value symbol distribution
- `reelsetBB` - Buy feature reel set
- `reelsetFreeSpins` - Free spin reel set

Each reel is an array of symbol codes (e.g., `["BIRD", "SCARAB", "GREEN", ...]`).

### Theme Manifest
**File**: `frontend/public/themes/JungleRelics/manifest.json`

Defines visual assets:
```json
{
  "grid": { "columns": 6, "rows": 5 },
  "assets": [
    { "alias": "BIRD", "path": "/images/symbols/bird.webp" },
    { "alias": "SCARAB", "path": "/images/symbols/scarab.webp" },
    ...
  ]
}
```

---

## 🛠️ Key Technologies

### Backend
- **.NET 9.0** - Latest .NET framework
- **ASP.NET Core** - Web API framework
- **Minimal APIs** - Lightweight endpoint definitions
- **Swagger/OpenAPI** - API documentation

### Frontend
- **PixiJS 8.1.0** - WebGL rendering engine
- **GSAP 3.12.5** - Animation library
- **Howler 2.2.4** - Audio library
- **Vite 7.2.4** - Build tool
- **Vanilla JavaScript** - No framework (ES6 modules)

### Development
- **Visual Studio / VS Code** - IDE
- **npm** - Package management
- **Batch scripts** - Service startup (`scripts/`)

---

## 📁 File Structure

```
cascading-game-example-jungle-relics-main/
│
├── backend/
│   ├── GameEngineHost/          # Core game engine
│   │   ├── Controllers/
│   │   │   └── PlayController.cs
│   │   ├── GameEngine/
│   │   │   ├── Play/
│   │   │   │   ├── SpinHandler.cs      # Main game logic
│   │   │   │   ├── WinEvaluator.cs     # Win calculation
│   │   │   │   ├── EngineState.cs      # State management
│   │   │   │   └── GameEngineService.cs
│   │   │   ├── Configuration/
│   │   │   └── Services/
│   │   └── Program.cs
│   │
│   ├── RGS/                      # Session manager
│   │   └── RGS/
│   │       ├── Program.cs
│   │       ├── Services/
│   │       └── configs/
│   │           ├── JungleRelics.json
│   │           └── JungleRelicsReelsets.json
│   │
│   └── RngHost/                  # Random number service
│       └── Program.cs
│
├── frontend/
│   ├── src/
│   │   ├── main.js               # Entry point
│   │   ├── SceneManager.js       # Scene orchestration
│   │   ├── GridRenderer.js       # Grid rendering
│   │   ├── AnimationManager.js   # Cascade animations
│   │   ├── NetworkManager.js     # API communication
│   │   ├── ThemeManager.js       # Asset loading
│   │   ├── AudioManager.js       # Sound management
│   │   └── ...
│   ├── public/
│   │   ├── animations/           # Background animations
│   │   ├── images/               # Symbol textures
│   │   ├── sounds/               # Audio files
│   │   └── themes/               # Theme manifests
│   ├── index.html
│   └── package.json
│
└── scripts/                      # Startup scripts
    ├── run-engine.bat
    ├── run-rgs-dev.bat
    └── run-rng.bat
```

---

## 🔨 Modification Guide

### Common Modifications

#### 1. Change Grid Size
**Backend**: `JungleRelics.json`
```json
"board": { "columns": 7, "rows": 6 }  // Change from 6x5
```

**Frontend**: `GridRenderer.js` - Update `columns` and `rows` in constructor

#### 2. Adjust Win Requirements
**Backend**: `WinEvaluator.cs` - Change minimum symbol count (currently 8)

#### 3. Modify Payouts
**Backend**: `JungleRelics.json` - Edit `paytable` array

#### 4. Change Animation Speed
**Frontend**: `GridRenderer.js`
- `SPIN_BASE_TIME` - Spin duration
- `CASCADE_DROP_DURATION` - Drop speed
- `CASCADE_FADE_DURATION` - Fade speed

#### 5. Adjust Grid Position/Size
**Frontend**: `SceneManager.js`
- `SLOT_SCALE` - Grid size multiplier
- `SLOT_Y_OFFSET` - Vertical position

#### 6. Change Bet Multipliers
**Backend**: `JungleRelics.json`
```json
"betLedger": {
  "baseBetMultiplier": 25,  // Change from 20
  "anteBetMultiplier": 30   // Change from 25
}
```

#### 7. Modify Free Spin Rules
**Backend**: `JungleRelics.json`
```json
"freeSpins": {
  "initialSpins": 20,        // Change from 15
  "retriggerSpins": 10,      // Change from 5
  "retriggerScatterCount": 4 // Change from 3
}
```

#### 8. Add New Symbols
1. Add to `symbolCatalog` in `JungleRelics.json`
2. Add to reel sets in `JungleRelicsReelsets.json`
3. Add texture to `frontend/public/images/symbols/`
4. Add entry to theme manifest

#### 9. Change Multiplier Values
**Backend**: `JungleRelics.json` - Edit `multiplier.values` and `multiplier.weights`

#### 10. Modify Reel Distributions
**Backend**: `JungleRelicsReelsets.json` - Edit symbol arrays in reel strips

---

## 🚀 Running the Project

### Prerequisites
- .NET 9.0 SDK
- Node.js 18+
- npm

### Startup Order
1. **RNG Host** (Port 5102)
   ```bash
   scripts/run-rng.bat
   ```

2. **Game Engine** (Port 5101)
   ```bash
   scripts/run-engine.bat
   ```

3. **RGS** (Port 5100)
   ```bash
   scripts/run-rgs-dev.bat
   ```

4. **Frontend** (Port 3010)
   ```bash
   cd frontend
   npm install
   npm run dev
   ```

### Access
- Frontend: http://localhost:3010
- RGS Swagger: http://localhost:5100/swagger
- Engine Swagger: http://localhost:5101/swagger

---

## 📝 Important Notes

### State Management
- Game state is stored server-side in `SessionManager`
- Each spin updates `EngineSessionState`
- Free spin state persists across spins until exhausted

### Randomness
- Uses RNG service for reel starts and multiplier seeds
- Falls back to local PRNG if RNG service unavailable
- All randomness is deterministic based on seeds

### Money Handling
- Uses `Money` type (decimal) for all currency
- Supports precision to 2 decimal places
- Bet multipliers applied to base bet

### Cascading Logic
- Cascades continue until no wins found
- Each cascade step is evaluated independently
- Multipliers are applied per cascade in base game
- Multipliers accumulate in free spins

### Performance
- Frontend uses WebGL (PixiJS) for hardware acceleration
- Animations use GSAP for smooth 60fps
- Turbo mode reduces animation durations by 60%

---

## 🎯 Summary

This is a **production-ready cascading slot game** with:
- ✅ Full backend game engine
- ✅ Professional frontend with animations
- ✅ Session management
- ✅ Free spins with multipliers
- ✅ Buy feature
- ✅ Multiple bet modes
- ✅ Comprehensive configuration system

The codebase is **well-structured** and **modular**, making it easy to:
- Modify game rules
- Change visual appearance
- Adjust payouts
- Add new features
- Customize animations

All game logic is **server-side** for security, while the frontend handles **presentation and user interaction**.

