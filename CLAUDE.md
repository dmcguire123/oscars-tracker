# Kalshi Oscars Spike Detector

## Project overview

Single-file (`index.html`) real-time dashboard for monitoring Kalshi prediction market volume spikes on Oscars categories. No build step — open directly in a browser.

## Architecture

- **Deployment**: Single self-contained `index.html` (vanilla JS, no frameworks, no dependencies)
- **Data source**: Kalshi public API — `https://api.elections.kalshi.com/trade-api/v2` (no auth required)
- **Market filter**: Tickers starting with `KXOSCAR` (Best Picture, Actor, Actress, Director, etc.)

## Key implementation details

- Polling loop: `setInterval` every `POLL_INTERVAL_SEC` seconds (default 15s, min 10s per Kalshi rate limits)
- Spike detection: rolling average over last N deltas; spike fires when `delta > avg * multiplier AND delta > min_absolute`
- Audio: Web Audio API with programmatic C5/E5/G5 chime (no external audio files)
- Notifications: Native browser `Notification` API
- State: plain JS `Map` keyed by market ticker

## Constraints

- Never poll faster than every 10 seconds (Kalshi rate limit)
- Back off 30 seconds on 429 responses
- No backend — fully client-side
- Don't add a build system; keep it a single file
