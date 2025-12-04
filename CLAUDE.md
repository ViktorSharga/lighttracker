# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

LightTracker is a self-hosted application for tracking power outage schedules in Lviv, Ukraine. It scrapes schedule data from poweron.loe.lviv.ua (a React SPA), detects changes, stores history, and sends Telegram notifications.

## Commands

```bash
# Development
npm install                    # Install dependencies
npm start                      # Start server on port 3000
npm run dev                    # Start with --watch for auto-reload

# Docker
docker compose up -d           # Run production container
docker compose down            # Stop container
docker build -t lighttracker . # Build image

# Manual fetch (when server is running)
curl -X POST http://localhost:3000/api/fetch
```

Note: Puppeteer requires Chromium. For local development without Docker, run `npx puppeteer browsers install chrome` after npm install.

## Architecture

**Data Flow**: Fetcher → Parser → Storage → Comparator → Telegram

| Module | Purpose |
|--------|---------|
| `server.js` | Express API, scheduling (5-min interval), orchestrates fetch pipeline |
| `fetcher.js` | Puppeteer headless browser to scrape React-rendered page |
| `parser.js` | Parses Ukrainian schedule text using regex into structured groups/intervals |
| `storage.js` | JSON file storage keyed by date (YYYY-MM-DD), maintains version history |
| `comparator.js` | Calculates differences between schedule versions for change detection |
| `telegram.js` | Bot commands, subscriber management, notification formatting |

**Key Design Decisions**:
- Puppeteer is required because the source website is a React SPA that requires JS execution
- Each fetch launches a fresh browser instance to prevent memory leaks
- Schedules are stored per-date with full version history (not just latest)
- Changes are detected by comparing `intervalsText` strings, not individual intervals
- The page can contain multiple schedules (today + tomorrow), handled by `parseAllSchedules()`

**Data Files** (in `/app/data` or `./data`):
- `schedules.json` - Schedule history keyed by date
- `subscribers.json` - Telegram subscriber data by chat ID

## Ukrainian Text Patterns

The parser extracts:
- Schedule date: `Графік погодинних відключень на DD.MM.YYYY`
- Timestamp: `Інформація станом на HH:MM DD.MM.YYYY`
- Groups: `Група X.Y. Електроенергії немає з HH:MM до HH:MM, з HH:MM до HH:MM.`

Groups are numbered 1.1-6.2 (12 total).
