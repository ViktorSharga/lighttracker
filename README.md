# LightTracker

A self-hosted application for tracking power outage schedules in Lviv, Ukraine. It fetches schedules from [poweron.loe.lviv.ua](https://poweron.loe.lviv.ua/), detects changes, and sends notifications via Telegram.

## Features

- **Automatic Schedule Fetching**: Fetches schedules every 5 minutes from the official Lvivoblenergo website
- **Multi-Day Support**: Handles multiple schedules on the same page (today + tomorrow)
- **Change Detection**: Only stores new records when schedule changes are detected
- **Change Comparison**: Shows differences between schedule versions (more/less outage time)
- **Historical Data**: Keeps history of all schedule changes per day
- **Telegram Bot**: Sends notifications when your group's schedule changes
- **Dark Theme UI**: Modern, responsive web interface

## Quick Start

### Prerequisites

- Docker and Docker Compose
- (Optional) Telegram Bot Token for notifications

### Installation

1. Clone or download the project:
   ```bash
   cd lighttracker
   ```

2. Configure environment (optional):
   ```bash
   # Edit docker-compose.yml to set your Telegram bot token
   TELEGRAM_BOT_TOKEN=your_bot_token_here
   ```

3. Start the application:
   ```bash
   docker compose up -d
   ```

4. Open http://localhost:3000 in your browser

### Stopping

```bash
docker compose down
```

## Configuration

All configuration is done via environment variables in `docker-compose.yml`:

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3000` | Web server port |
| `FETCH_INTERVAL_MS` | `300000` | Fetch interval in milliseconds (5 minutes) |
| `SOURCE_URL` | `https://poweron.loe.lviv.ua/` | Schedule source URL |
| `TELEGRAM_BOT_TOKEN` | - | Telegram bot token (optional) |
| `DATA_DIR` | `/app/data` | Directory for persistent data |

## Architecture

```
lighttracker/
├── src/
│   ├── server.js      # Express server, API endpoints, fetch scheduler
│   ├── fetcher.js     # Puppeteer-based page fetcher
│   ├── parser.js      # Schedule text parser
│   ├── storage.js     # JSON file storage
│   ├── comparator.js  # Schedule comparison logic
│   └── telegram.js    # Telegram bot integration
├── public/
│   └── index.html     # Web UI (single-page application)
├── data/
│   ├── schedules.json # Schedule history (auto-created)
│   └── subscribers.json # Telegram subscribers (auto-created)
├── Dockerfile
├── docker-compose.yml
├── package.json
└── VERSION
```

## API Endpoints

### GET /api/schedule
Returns the current schedule with comparison to previous version.

**Response:**
```json
{
  "version": "0.4.1",
  "lastFetchTime": "2025-12-04T10:00:00.000Z",
  "lastFetchError": null,
  "isFetching": false,
  "dateKey": "2025-12-04",
  "current": {
    "fetchedAt": "2025-12-04T10:00:00.000Z",
    "scheduleDate": "04.12.2025",
    "infoTimestamp": "10:00 04.12.2025",
    "groups": {
      "1.1": {
        "intervalsText": "з 09:00 до 12:30, з 19:30 до 22:00",
        "intervals": [
          { "start": "09:00", "end": "12:30", "durationMinutes": 210 },
          { "start": "19:30", "end": "22:00", "durationMinutes": 150 }
        ],
        "totalMinutesOff": 360
      }
      // ... other groups
    }
  },
  "previous": { /* previous schedule version */ },
  "comparison": {
    "hasChanges": true,
    "groupChanges": { /* per-group changes */ },
    "summary": {
      "totalMinutesChange": -60,
      "groupsWithMoreOutage": 2,
      "groupsWithLessOutage": 5,
      "groupsUnchanged": 5,
      "humanReadable": "Загалом 1 год менше без світла (по всіх групах)"
    }
  }
}
```

### GET /api/dates
Returns all available dates with schedule data.

**Response:**
```json
{
  "dates": ["2025-12-04", "2025-12-03", "2025-12-02"]
}
```

### GET /api/schedule/:dateKey
Returns schedules for a specific date.

**Response:**
```json
{
  "dateKey": "2025-12-04",
  "current": { /* latest schedule for this date */ },
  "previous": { /* previous version */ },
  "comparison": { /* comparison data */ },
  "allVersions": [ /* all schedule versions for this date */ ]
}
```

### GET /api/history/:dateKey
Returns detailed history summary for a specific date.

**Response:**
```json
{
  "dateKey": "2025-12-04",
  "summary": {
    "updateCount": 5,
    "firstUpdate": "08:00 04.12.2025",
    "lastUpdate": "20:00 04.12.2025",
    "totalChanges": 4,
    "changesTimeline": [ /* timeline of changes */ ],
    "groupSummaries": {
      "1.1": {
        "changes": [ /* list of changes */ ],
        "totalChange": -30,
        "initialMinutes": 360,
        "finalMinutes": 330,
        "netChange": -30,
        "netChangeFormatted": "-30 хв"
      }
      // ... other groups
    }
  },
  "schedules": [ /* all schedule versions */ ]
}
```

### GET /api/status
Returns application status.

**Response:**
```json
{
  "version": "0.4.1",
  "lastFetchTime": "2025-12-04T10:00:00.000Z",
  "lastFetchError": null,
  "isFetching": false,
  "fetchIntervalMs": 300000,
  "nextFetchIn": 180000,
  "telegram": {
    "enabled": true,
    "subscribers": 15,
    "byGroup": {
      "1.1": 3,
      "2.1": 5,
      "3.2": 7
    }
  }
}
```

### POST /api/fetch
Triggers an immediate schedule fetch.

**Response:**
```json
{
  "success": true,
  "schedules": [
    { "date": "04.12.2025", "added": true, "reason": null, "isNewDay": false },
    { "date": "05.12.2025", "added": true, "reason": null, "isNewDay": true }
  ]
}
```

## Telegram Bot

### Setup

1. Create a bot via [@BotFather](https://t.me/BotFather)
2. Copy the bot token
3. Add it to `docker-compose.yml`:
   ```yaml
   environment:
     - TELEGRAM_BOT_TOKEN=your_token_here
   ```
4. Restart the container

### Bot Commands

| Command | Description |
|---------|-------------|
| `/start` | Start the bot, select your group |
| `/schedule` | Show current schedule for your group |
| `/group` | Change your group |
| `/stop` | Unsubscribe from notifications |

### Notification Types

**Schedule Update** (existing day changed):
```
📢 Оновлення графіка
Станом на: 15:30 04.12.2025

⚡ Група 2.1
Відключення: 09:00 - 12:30, 16:00 - 19:00
Всього: 6 год 30 хв

🟢 -1 год менше без світла

Було: з 09:00 до 12:30, з 16:00 до 20:00
```

**New Day Schedule** (tomorrow's schedule posted):
```
📅 Графік на 05.12.2025
Станом на: 19:30 04.12.2025

⚡ Група 2.1
Відключення: 06:00 - 09:00, 18:00 - 21:00
Всього без світла: 6 год
```

## Data Storage

### schedules.json

Schedules are stored by date key (YYYY-MM-DD):

```json
{
  "2025-12-04": [
    {
      "fetchedAt": "2025-12-04T08:00:00.000Z",
      "scheduleDate": "04.12.2025",
      "infoTimestamp": "08:00 04.12.2025",
      "groups": { /* group data */ }
    },
    {
      "fetchedAt": "2025-12-04T12:00:00.000Z",
      "scheduleDate": "04.12.2025",
      "infoTimestamp": "12:00 04.12.2025",
      "groups": { /* updated group data */ }
    }
  ]
}
```

### subscribers.json

Telegram subscribers:

```json
{
  "123456789": {
    "group": "2.1",
    "subscribedAt": "2025-12-01T10:00:00.000Z",
    "chatId": "123456789"
  }
}
```

## Web Interface

### Current Schedule Tab

- Shows the latest schedule for the most recent date
- Displays change comparison with previous version
- Color-coded indicators:
  - 🟢 Green: Less outage time (better)
  - 🔴 Red: More outage time (worse)
  - Gray: No change
- "📅 Графік на завтра" badge when viewing tomorrow's schedule

### History Tab

- Date selector for viewing past schedules
- Day statistics (update count, change count)
- Timeline of all changes throughout the day
- Per-group change summary
- Click on a group to see detailed change history

## Resource Usage

Typical resource consumption:

| Metric | Idle | During Fetch |
|--------|------|--------------|
| Memory | ~50 MB | ~150 MB |
| CPU | <1% | 10-30% |
| Disk | ~100 KB | ~100 KB |
| PIDs | 6 | 15-20 |

The application launches a headless Chromium browser for each fetch (every 5 minutes) to render the React-based source website. The browser is fully closed after each fetch to prevent memory leaks.

## Troubleshooting

### Container won't start

Check logs:
```bash
docker logs lighttracker
```

### High memory usage

The application should use ~50MB when idle. If memory grows continuously:
```bash
# Check for zombie processes
docker exec lighttracker ps aux | grep defunct

# Restart container
docker compose restart
```

### Telegram bot not working

1. Verify token is correct in `docker-compose.yml`
2. Check bot is not blocked by user
3. Check logs for Telegram errors:
   ```bash
   docker logs lighttracker | grep -i telegram
   ```

### Schedule not updating

1. Check if source website is accessible
2. Force a manual fetch:
   ```bash
   curl -X POST http://localhost:3000/api/fetch
   ```
3. Check logs for parsing errors

## Development

### Local Development (without Docker)

1. Install dependencies:
   ```bash
   npm install
   ```

2. Install Chromium (for Puppeteer):
   ```bash
   npx puppeteer browsers install chrome
   ```

3. Start the server:
   ```bash
   npm start
   ```

### Running Tests

```bash
npm test
```

### Building Docker Image

```bash
docker build -t lighttracker .
```

## License

MIT

## Credits

- Data source: [Lvivoblenergo](https://poweron.loe.lviv.ua/)
- Built with: Node.js, Express, Puppeteer, node-telegram-bot-api
