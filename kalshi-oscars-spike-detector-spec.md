# Kalshi Oscars volume spike detector — agent build spec

## Overview

Build a real-time dashboard that polls Kalshi's public market data API for **Oscars / culture** markets, tracks volume changes between polling intervals, detects **volume spikes** (sudden increases in contracts traded), and alerts the user through **visual alerts**, **browser push notifications**, and **audio alert sounds**.

---

## Kalshi API reference

### Base URL

All public market data endpoints are unauthenticated. No API key required.

```
https://api.elections.kalshi.com/trade-api/v2
```

> Despite the "elections" subdomain, this provides access to ALL Kalshi markets — not just election-related ones.

### Key endpoints

#### Get markets (paginated)

```
GET /markets?series_ticker={TICKER}&status=open&limit=100
```

Returns a list of market objects. Each market includes:

| Field | Type | Description |
|-------|------|-------------|
| `ticker` | string | Unique market identifier (e.g., `KXOSCARPIC-26-OBA`) |
| `title` | string | Human-readable market title |
| `subtitle` | string | The specific outcome (e.g., "One Battle After Another") |
| `yes_bid` | number | Current best yes bid price (cents) |
| `yes_ask` | number | Current best yes ask price (cents) |
| `no_bid` | number | Current best no bid price (cents) |
| `no_ask` | number | Current best no ask price (cents) |
| `volume` | integer | Total contracts traded (lifetime) |
| `volume_24h` | integer | Contracts traded in last 24 hours |
| `open_interest` | integer | Outstanding open contracts |
| `last_price` | number | Last trade price (cents) |
| `event_ticker` | string | Parent event ticker |
| `status` | string | `open`, `closed`, `settled` |
| `close_time` | string | ISO 8601 close timestamp |

Supports cursor-based pagination. Response shape:

```json
{
  "markets": [ ... ],
  "cursor": "string_or_empty"
}
```

#### Get trades (paginated)

```
GET /trades?ticker={MARKET_TICKER}&limit=100&min_ts={UNIX_SECONDS}
```

Returns recent trades for a specific market. Each trade includes:

| Field | Type | Description |
|-------|------|-------------|
| `trade_id` | string | Unique trade identifier |
| `ticker` | string | Market ticker |
| `yes_price` | number | Yes price in cents |
| `no_price` | number | No price in cents |
| `count` | integer | Number of contracts in this trade |
| `taker_side` | string | `yes` or `no` |
| `created_time` | string | ISO 8601 timestamp |

#### Get events

```
GET /events/{EVENT_TICKER}
```

Returns event-level metadata including title, category, and child market tickers.

#### Get orderbook

```
GET /markets/{TICKER}/orderbook
```

Returns current order book depth (yes bids, no bids).

### Rate limits

Kalshi enforces rate limits. Best practices:

- Poll no faster than every **10 seconds** for market data
- Use cursor pagination for large result sets
- Back off on 429 responses with exponential delay

### Known Oscars market tickers

These are the confirmed series and event tickers for 2026 Oscars markets:

| Category | Series ticker | Example market URL slug |
|----------|---------------|------------------------|
| Best Picture | `KXOSCARPIC` | `kxoscarpic-26` |
| Best Actor | `KXOSCARACTO` | `kxoscaracto-26` |
| Best Actress | `KXOSCARACTR` | `kxoscaractr-26` |
| Best Director | (discover via API) | — |
| Best Supporting Actor | (discover via API) | — |
| Best Supporting Actress | (discover via API) | — |
| Best Original Score | `KXOSCARSCORE` | `kxoscarscore-26` |
| Best Sound | `KXOSCARSOUND` | `kxoscarsound-26` |
| Best Picture Nominations | `KXOSCARNOMPIC` | — |

To discover all Oscars markets, query the `/markets` endpoint and filter by tickers beginning with `KXOSCAR`. Alternatively, iterate known series tickers.

---

## Spike detection algorithm

### Core concept

Compare `volume` (or `volume_24h`) snapshots between consecutive polling intervals. A spike is defined as a volume delta exceeding a configurable threshold.

### Implementation

```
For each market M at poll interval T:

  delta_volume = M.volume[T] - M.volume[T-1]
  avg_delta    = rolling_average(deltas for M over last N intervals)

  IF delta_volume > (avg_delta * SPIKE_MULTIPLIER) AND delta_volume > MIN_ABSOLUTE_SPIKE:
    TRIGGER spike alert for M
```

### Configurable parameters

| Parameter | Default | Description |
|-----------|---------|-------------|
| `POLL_INTERVAL_SEC` | 15 | Seconds between API polls |
| `SPIKE_MULTIPLIER` | 3.0 | How many times above the rolling average triggers a spike |
| `MIN_ABSOLUTE_SPIKE` | 50 | Minimum absolute volume delta to qualify as a spike (filters noise on low-volume markets) |
| `ROLLING_WINDOW` | 10 | Number of past intervals used for rolling average |
| `COOLDOWN_SEC` | 120 | After an alert fires, suppress re-alerts for this market for N seconds |

Users should be able to adjust all of these via the dashboard UI.

### Edge cases

- **First poll**: No delta available yet; store baseline and skip detection.
- **Market with zero prior volume**: Use `MIN_ABSOLUTE_SPIKE` as the only threshold.
- **API errors / missed polls**: Mark interval as missing; don't compute delta across gaps.
- **Market closes mid-session**: Remove from active tracking when `status` changes to `closed` or `settled`.

---

## Notification system

All three notification channels fire simultaneously when a spike is detected.

### 1. Visual alerts (in-dashboard)

- Flash the affected market row/card with a highlight animation (e.g., pulsing border or background glow)
- Add an entry to a scrolling **alert feed / activity log** with timestamp, market name, volume delta, and current price
- Show a **badge counter** on the dashboard header indicating unread spike alerts
- Alerts should remain visible until dismissed or until the feed reaches a max length (e.g., 50 entries)

### 2. Browser push notifications

- Request `Notification` permission on first load
- On spike, fire a `new Notification(...)` with:
  - **Title**: `"Volume Spike: {market_title}"`
  - **Body**: `"+{delta} contracts in {interval}s | Yes: {yes_price}¢ | No: {no_price}¢"`
  - **Icon**: Kalshi logo or a custom alert icon
  - **Tag**: Use `market_ticker` as the tag so repeated spikes on the same market replace the previous notification
- Handle the `click` event to focus the dashboard tab

### 3. Audio alert

- Play a short, distinct alert sound (a chime or beep) on spike
- Use the Web Audio API or a preloaded `<audio>` element
- Include a **mute/unmute toggle** in the dashboard UI
- Respect browser autoplay policies: only play after the user has interacted with the page at least once

---

## Dashboard UI requirements

### Layout

The dashboard should have these sections:

1. **Header bar**: Title ("Kalshi Oscars spike detector"), connection status indicator (green dot = polling, red = error), mute toggle, settings gear icon
2. **Market cards grid**: One card per tracked market showing current price, volume, 24h volume, last trade, and a mini sparkline of recent volume deltas
3. **Spike alert feed**: A scrollable panel (sidebar or bottom drawer) showing chronological spike events
4. **Settings panel**: Slide-out or modal for configuring spike parameters

### Market card contents

Each card displays:

- Market title and subtitle (e.g., "Best Picture — One Battle After Another")
- Current yes price as a large number (e.g., "76¢") with a colored indicator (green if up from last poll, red if down)
- Volume badge showing lifetime volume
- Delta badge showing `+N` contracts since last poll
- Mini chart (sparkline or small bar chart) of the last 20 volume deltas
- Visual spike indicator (animated border, icon, etc.) when a spike is active

### Responsive behavior

- Desktop: 3-column card grid + sidebar alert feed
- Tablet: 2-column grid + bottom drawer
- Mobile: 1-column stacked cards + bottom sheet for alerts

### Color scheme

Use a dark theme suited to trading dashboards:

- Background: `#0d1117` or similar near-black
- Card surfaces: `#161b22`
- Accent for spikes/alerts: `#f97316` (amber/orange)
- Positive price movement: `#22c55e`
- Negative price movement: `#ef4444`
- Text primary: `#e6edf3`
- Text secondary: `#8b949e`

---

## Tech stack recommendations

### Option A: Standalone React app

- **Framework**: React 18+ with Vite
- **State**: Zustand or React Context for market data store
- **Charts**: Recharts or lightweight `<canvas>` sparklines
- **Notifications**: Native browser Notification API
- **Audio**: Web Audio API with a bundled chime `.mp3`
- **Styling**: Tailwind CSS

### Option B: Single HTML file (no build step)

- Vanilla JS with `fetch` polling loop
- Chart.js for sparklines
- CSS custom properties for theming
- Suitable for quick deployment or embedding

### Option C: Node.js backend + WebSocket frontend

- Backend polls Kalshi API and computes spikes
- Pushes spike events to connected clients via WebSocket
- Frontend is a thin display layer
- Better for multi-user or persistent monitoring

---

## Data flow

```
[Kalshi Public API]
        |
        | GET /markets (every POLL_INTERVAL_SEC)
        v
[Polling Service]
        |
        | Compare volume snapshots
        | Compute deltas + rolling averages
        v
[Spike Detection Engine]
        |
        | If spike detected:
        |   -> Visual alert (update UI state)
        |   -> Browser notification (Notification API)
        |   -> Audio chime (Web Audio API)
        v
[Dashboard UI]
        |
        | Renders market cards, sparklines, alert feed
        | User can adjust thresholds, mute audio, dismiss alerts
```

---

## API polling implementation notes

### Fetching all Oscars markets

```javascript
const BASE = "https://api.elections.kalshi.com/trade-api/v2";

async function fetchOscarsMarkets() {
  const allMarkets = [];
  let cursor = "";

  do {
    const url = new URL(`${BASE}/markets`);
    url.searchParams.set("limit", "200");
    url.searchParams.set("status", "open");
    if (cursor) url.searchParams.set("cursor", cursor);

    const res = await fetch(url);
    if (!res.ok) throw new Error(`API error: ${res.status}`);

    const data = await res.json();
    const oscarsMarkets = data.markets.filter(m =>
      m.ticker.toUpperCase().startsWith("KXOSCAR")
    );
    allMarkets.push(...oscarsMarkets);
    cursor = data.cursor || "";
  } while (cursor);

  return allMarkets;
}
```

### Polling loop with spike detection

```javascript
let previousVolumes = {};
let deltaHistory = {};  // ticker -> array of recent deltas

async function pollAndDetect(config) {
  const markets = await fetchOscarsMarkets();

  for (const market of markets) {
    const prevVol = previousVolumes[market.ticker];

    if (prevVol !== undefined) {
      const delta = market.volume - prevVol;

      // Update rolling history
      if (!deltaHistory[market.ticker]) deltaHistory[market.ticker] = [];
      deltaHistory[market.ticker].push(delta);
      if (deltaHistory[market.ticker].length > config.ROLLING_WINDOW) {
        deltaHistory[market.ticker].shift();
      }

      // Compute rolling average
      const history = deltaHistory[market.ticker];
      const avg = history.reduce((a, b) => a + b, 0) / history.length;

      // Spike check
      if (
        delta > avg * config.SPIKE_MULTIPLIER &&
        delta > config.MIN_ABSOLUTE_SPIKE
      ) {
        triggerSpikeAlert(market, delta, avg);
      }
    }

    previousVolumes[market.ticker] = market.volume;
  }
}

setInterval(() => pollAndDetect(config), config.POLL_INTERVAL_SEC * 1000);
```

### Fetching recent trades for a specific market

```javascript
async function fetchRecentTrades(ticker, sinceSec) {
  const minTs = Math.floor(Date.now() / 1000) - sinceSec;
  const url = `${BASE}/trades?ticker=${ticker}&limit=100&min_ts=${minTs}`;
  const res = await fetch(url);
  const data = await res.json();
  return data.trades || [];
}
```

---

## Context: why this matters right now

The 98th Academy Awards air **March 15, 2026** on ABC, hosted by Conan O'Brien. As of mid-March 2026, over **$48 million** in Oscar contracts have been traded on Kalshi — far exceeding the $29.6M total from 2025. Key markets to watch:

| Category | Favorite | Implied probability |
|----------|----------|---------------------|
| Best Picture | One Battle After Another | ~76% |
| Best Actor | Michael B. Jordan (surged from 12% to ~58% in two weeks) | ~58% |
| Best Actress | Jessie Buckley | ~88% |
| Best Director | Paul Thomas Anderson | ~88% |
| Best Supporting Actress | Teyana Taylor | ~72% |

The Best Actor market has been the most volatile — Jordan surged from 12¢ to 58¢ while Chalamet dropped from 78¢ to ~32¢ following a public controversy. These are exactly the kinds of movements the spike detector is designed to catch.

Volume spikes on Kalshi tend to cluster around:

- Major precursor award announcements (BAFTAs, SAG, Critics' Choice)
- Celebrity controversies or viral moments
- The hours immediately before and during the ceremony
- Category announcements during the live broadcast

---

## Testing checklist

- [ ] API connection: successfully fetches markets from Kalshi public API
- [ ] Market filtering: correctly identifies and displays only `KXOSCAR*` markets
- [ ] Volume tracking: stores and compares snapshots across poll intervals
- [ ] Spike detection: triggers alerts when delta exceeds threshold
- [ ] Does NOT trigger on first poll (no baseline yet)
- [ ] Cooldown: suppresses re-alerts within the cooldown window
- [ ] Visual alert: market card highlights and alert feed updates
- [ ] Browser notification: fires with correct title/body (after permission granted)
- [ ] Audio alert: plays sound on spike (after user interaction)
- [ ] Mute toggle: silences audio but keeps visual + push notifications
- [ ] Settings panel: all config parameters are adjustable and take effect immediately
- [ ] Graceful error handling: API errors don't crash the polling loop
- [ ] Rate limit compliance: polls no faster than every 10 seconds
- [ ] Pagination: handles cursor-based pagination for large market lists
- [ ] Market closure: removes settled/closed markets from tracking
- [ ] Responsive layout: works on desktop, tablet, and mobile viewports

---

## Deployment notes

- No authentication is needed for read-only market data
- CORS: Kalshi's public API should allow cross-origin requests from browser clients; if not, use a lightweight proxy
- For persistent monitoring, consider a Node.js backend that polls and stores historical data, serving a static frontend
- The app is fully client-side viable for single-user use cases
