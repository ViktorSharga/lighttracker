# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

LightTracker is a power outage schedule tracker for Lviv, Ukraine. It monitors https://poweron.loe.lviv.ua/ (React-based website) for schedule changes, stores historical data, provides a web interface, and sends Telegram notifications to subscribers. The source website publishes hourly power outage schedules for 12 groups (1.1-6.2).

## Development Commands

**CRITICAL: ALWAYS use Docker for ALL development tasks.** Never run npm/node commands directly on the host machine. This includes building, testing, type checking, and running the application.

### Docker Commands (MANDATORY)

```bash
docker compose up -d --build      # Build and run (use this for testing ANY changes)
docker compose logs -f            # View logs
docker compose logs --tail=50     # View recent logs
docker compose down               # Stop
docker compose build --no-cache   # Rebuild from scratch (if caching issues)
```

### Data Management (via Docker)

```bash
docker compose exec lighttracker node scripts/import-data.js <base-url> [data-file]  # Import from another instance
docker compose exec lighttracker node scripts/backup-data.js                          # Backup current data
docker compose exec lighttracker node scripts/migrate-to-iso.js                       # Migrate timestamps to ISO format
```

### Frontend Type Checking (via Docker)

```bash
# Type check runs during Docker build, but to check manually:
docker compose exec lighttracker sh -c "cd /app/frontend && npm run typecheck"
docker compose exec lighttracker sh -c "cd /app/frontend && npm run build:check"  # typecheck + build
```

### QA Testing (via Docker)

```bash
docker compose exec lighttracker node scripts/qa-test.js [url]  # Visual/functional tests with screenshots
```

Output: `screenshots/qa-{timestamp}/` with screenshots for desktop/tablet/mobile viewports and `qa-report.json`.

### Debugging

```bash
docker compose logs -f                          # Real-time application logs
docker compose ps                               # Check container health status
docker compose exec lighttracker sh             # Access container shell
docker compose exec lighttracker chromium --version  # Verify Chromium installation
```

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              PERIODIC SCHEDULER                              │
│                         (every 5 min, configurable)                         │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                           fetcher.js (Puppeteer)                            │
│  • Launches headless Chromium                                               │
│  • Navigates to SOURCE_URL                                                  │
│  • Waits for React app to render (#root with "Група")                       │
│  • Blocks images/stylesheets/fonts for performance                          │
│  • Returns page text content                                                │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                            parser.js (Regex)                                │
│  • Parses Ukrainian text for schedule headers                               │
│  • Extracts multiple schedules (today + tomorrow possible)                  │
│  • Parses 12 groups with time intervals                                     │
│  • Calculates totalMinutesOff per group                                     │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                          storage.js (JSON Files)                            │
│  • Compares with previous version (intervalsText equality)                  │
│  • Only stores if changed (duplicate prevention)                            │
│  • Organizes by date key (YYYY-MM-DD)                                       │
│  • Maintains version history per day                                        │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                    ┌─────────────────┴─────────────────┐
                    ▼                                   ▼
┌─────────────────────────────────┐   ┌─────────────────────────────────────┐
│       telegram.js (Bot)         │   │       comparator.js (Analysis)      │
│  • Notifies per-group changes   │   │  • Compares two schedule versions   │
│  • Two message types:           │   │  • Calculates per-group diff        │
│    - New day schedule           │   │  • Builds daily summaries           │
│    - Update to existing day     │   │  • Generates statistics             │
│  • Removes inactive subscribers │   │  • Human-readable Ukrainian text    │
└─────────────────────────────────┘   └─────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                        server.js (Express API)                              │
│  • REST API endpoints                                                       │
│  • Static file serving (frontend/dist/)                                     │
│  • Periodic fetch coordination                                              │
│  • Status tracking (lastFetchTime, isFetching, errors)                      │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                     Vue 3 Frontend (frontend/)                              │
│  • Vue 3 + TypeScript + Vite + Tailwind CSS                                 │
│  • Three tabs: Current, History, Statistics                                 │
│  • Dark glassmorphism theme                                                 │
│  • "My Group" feature with localStorage                                     │
│  • Real-time countdown to next outage                                       │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Vue 3 Frontend Architecture

The `frontend/` directory contains a Vue 3 + TypeScript SPA with glass-morphism dark theme.

**Tech Stack:** Vue 3.5 • TypeScript 5.6 • Vite 5.4 • Tailwind CSS 3.4 • Radix Vue • Pinia • GSAP • Chart.js • VueUse • Lucide Icons

**Structure:**
```
frontend/src/
├── components/{current,history,statistics,layout,ui}/  # Feature-based organization
├── composables/     # Shared logic (useSchedule, useCountdown, useMyGroup, etc.)
├── stores/          # Pinia stores (schedule, statistics, history, ui, preferences)
├── views/           # Tab views (CurrentTab, HistoryTab, StatisticsTab)
├── services/        # api.ts client and types.ts (source of truth for all API types)
└── lib/             # Utilities (cn() for Tailwind class merging)
```

**Key patterns:**
- Pinia stores with composition API (`stores/`)
- Radix Vue components wrapped in `components/ui/` with Tailwind styling
- GSAP for tab indicator animation (not CSS transitions)
- Composables for shared logic (`composables/`)
- Separate date range filters for chart vs group comparison table
- All user-facing text in Ukrainian
- Import UI components from `@/components/ui`
- Use `useToast()` composable for notifications

**Theme Colors:**
```
bg-primary: #0f0f1a    bg-secondary: #161625    bg-elevated: #1e1e32
accent-blue: #5b8def   accent-green: #4ade80    accent-red: #f87171   accent-yellow: #fbbf24
```

**Target Devices:**

Design and test UI for these primary devices:

| Device | CSS Viewport | Physical Resolution | DPR | Notes |
|--------|-------------|---------------------|-----|-------|
| MacBook Pro 16" M2 | ~1792×1120 | 3456×2234 | 2x | Primary desktop target, 254 PPI |
| iPhone 15 Pro Max | 430×932 | 1290×2796 | 3x | Primary mobile target |
| iPad Pro M4 13" | 1032×1376 | 2752×2064 | 2x | Tablet target |

- MacBook 16" typically runs at "Default" scaling (~1792px wide viewport)
- Mobile-first responsive breakpoints: `sm:640px`, `md:768px`, `lg:1024px`, `xl:1280px`
- Max content width: `max-w-6xl` (1152px) for optimal reading on large screens

**Known gotchas (previously fixed bugs):**
- SelectContent needs high z-index (`z-[9999]`) for dropdowns to open over other elements
- Tab indicator uses GSAP only - CSS `::after` underline removed from TabsTrigger
- Tab indicator needs initial `opacity: 0; width: 0px;` until GSAP positions it
- Statistics tab has separate date filters for chart vs group comparison table

## Backend Modules

| Module | Purpose |
|--------|---------|
| `src/server.js` | Express API, periodic fetch scheduler, coordinates pipeline |
| `src/fetcher.js` | Puppeteer browser automation, fetches source website |
| `src/parser.js` | Ukrainian text parsing with regex, extracts schedules |
| `src/storage.js` | JSON file persistence, duplicate detection |
| `src/comparator.js` | Schedule diff, statistics calculation |
| `src/telegram.js` | Bot integration, per-group notifications |

### Parser Regex Patterns

The parser extracts data from Ukrainian text. Key patterns:
- Schedule header: `/Графік погодинних відключень на (\d{2}\.\d{2}\.\d{4})/g`
- Group with outages: `/Група (\d+\.\d+)\.\s*Електроенергії немає\s+(.+?)(?=Група|\n\n|$)/g`
- Time intervals: `/з (\d{2}:\d{2}) до (\d{2}:\d{2})/g`

**Source website notes:** Parser depends on https://poweron.loe.lviv.ua/ structure. If the source website changes its format, update regex patterns in `src/parser.js` and verify by examining Docker logs after rebuild.

### Telegram Bot Commands

| Command | Description |
|---------|-------------|
| `/start` | Initialize subscription, show group selector |
| `/schedule` | Show current schedule for subscribed group |
| `/group` | Change subscribed group |
| `/stop` | Unsubscribe |

## Data Structures

### Schedule Record
```javascript
{
  fetchedAt: "2025-12-04T10:00:00.000Z",    // ISO timestamp when fetched
  scheduleDate: "04.12.2025",               // Display format DD.MM.YYYY
  infoTimestamp: "10:00 04.12.2025",        // From source website
  groups: {
    "1.1": {
      intervalsText: "з 09:00 до 12:30, з 19:30 до 22:00",  // Used for duplicate detection
      intervals: [{ start: "09:00", end: "12:30", durationMinutes: 210 }],
      totalMinutesOff: 360
    }
    // ... 12 groups total (1.1-6.2)
  }
}
```

### Comparison Result
```javascript
{
  hasChanges: true,
  groupChanges: { "1.1": { status: "better", differenceMinutes: -60, ... } },
  summary: { totalMinutesChange: -180, humanReadable: "Загалом 3 год менше..." }
}
```

Change status values: `'worse'` | `'better'` | `'unchanged'`

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/schedule` | Current schedule with comparison to previous version |
| GET | `/api/dates` | All date keys with data (sorted descending) |
| GET | `/api/schedule/:dateKey` | Full history for specific date |
| GET | `/api/history/:dateKey` | Day summary with change timeline |
| GET | `/api/statistics?from=&to=` | Multi-day stats with optional date range |
| GET | `/api/export` | Export all schedules (for data transfer between instances) |
| GET | `/api/status` | App status, version, Telegram subscriber counts |
| GET | `/health` | Health check endpoint (returns 200 OK when ready) |
| POST | `/api/fetch` | Trigger immediate fetch (returns 409 if already fetching) |
| POST | `/api/schedule/import` | Import single schedule record |
| DELETE | `/api/schedule/:dateKey/:fetchedAt` | Delete specific schedule version |

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | 3000 | HTTP server port |
| `FETCH_INTERVAL_MS` | 300000 | Fetch interval (5 minutes) |
| `SOURCE_URL` | https://poweron.loe.lviv.ua/ | Schedule source website |
| `TELEGRAM_BOT_TOKEN` | - | Optional Telegram bot token |
| `DATA_DIR` | /app/data (Docker) or ./data | Persistent storage directory |
| `PUPPETEER_EXECUTABLE_PATH` | - | Custom Chromium path (set in Docker) |
| `PUPPETEER_SKIP_CHROMIUM_DOWNLOAD` | - | Skip bundled Chromium (Docker uses system) |

## Conventions

**Language:**
- Code: English (variable names, comments)
- User-facing strings: Ukrainian (UI, Telegram messages, error messages to users)

**Date formats:**
- Storage keys: `YYYY-MM-DD` (ISO-like, sortable)
- Display: `DD.MM.YYYY` (European format)
- Timestamps: `HH:MM DD.MM.YYYY` (time first, then date)

**Time:**
- 24-hour format (`HH:MM`)
- All calculations in minutes
- Overnight intervals supported (e.g., 22:00-24:00)

**Groups:**
- 12 fixed groups: 1.1, 1.2, 2.1, 2.2, 3.1, 3.2, 4.1, 4.2, 5.1, 5.2, 6.1, 6.2
- Sorted by major.minor numerically
- Groups without outages stored with empty intervals and totalMinutesOff: 0

**Error handling:**
- Log errors but continue operation
- Graceful degradation (Telegram failures don't stop app)
- Remove dead Telegram subscribers automatically

**Version:**
- Stored in `VERSION` file (not package.json)
- Read at server startup
- Displayed in UI and API responses

## Important Implementation Details

**Duplicate detection:**
- Compares `intervalsText` field per group between schedules
- Does NOT compare timestamps or other metadata
- Schedule only stored if any group's `intervalsText` changed

**Multi-schedule support:**
- Page may contain both today's and tomorrow's schedules
- Parser splits by schedule headers and processes each independently
- Each schedule stored under its own date key

**Browser lifecycle:**
- Fresh Puppeteer browser launched for each fetch
- Browser fully closed after extraction (prevents memory leaks)
- Page cache disabled, unnecessary resources blocked

**Notification logic:**
- New day: All subscribers notified for their group
- Update: Only subscribers whose group changed are notified
- Comparison shows diff from previous version of same day

**Frontend state persistence:**
- `myGroup` → localStorage
- `sectionStates` (collapsed/expanded) → localStorage
- Statistics/history data → memory only (re-fetched on tab switch)

## Deployment Notes

**Production:** https://lighttracker.up.railway.app (main branch)

**Infrastructure:**
- Docker uses system Chromium (`apt-get`) not bundled Puppeteer Chromium
- `dumb-init` handles signal forwarding in Docker
- Volume mount `./data:/app/data` for persistence
- Railway uses `railway.json` with Dockerfile builder

## Telegram Bot Setup

1. Create bot via [@BotFather](https://t.me/BotFather)
2. Set `TELEGRAM_BOT_TOKEN` environment variable
3. Bot starts automatically on server launch if token provided
