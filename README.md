# TileSquare

A beautiful, glassmorphic new-tab Chrome extension with smart keyboard-driven search, live weather with animated effects, Google Calendar integration, a todo list, quick notes, and more — all in a single-file, zero-dependency startpage.

---

## Features

| Feature | Details |
| --- | --- |
| **Smart search** | Type anything to search Google; use shortcut keys to jump directly to any configured site |
| **Keyboard navigation** | Every site has a single-key shortcut; search with `key'query`; open a path with `key/path` |
| **Search engine cycling** | Press `Ctrl+/` while searching to rotate Google → DuckDuckGo → Bing |
| **Autocomplete** | Suggestions from DuckDuckGo, personal history, and configurable per-key defaults |
| **Live clock** | 12 h / 24 h, configurable timezone, optional seconds, personalised greeting |
| **Weather** | Real-time conditions via Open-Meteo; animated rain, snow, storms, fog, and sun on canvas |
| **Google Calendar** | Paste your ICS URL once; upcoming events appear in a side widget with one-click Join links |
| **Todo list** | Persistent, per-device task list stored in `chrome.storage.local` |
| **Quick notes** | Full-screen scratchpad that auto-saves on every keystroke (`Tab` to open/close) |
| **Jokes** | A subtle daily joke card — tap to reveal the punchline |
| **Themes** | Dark and light glassmorphic themes; respects OS preference on first load |

---

## Architecture Overview

```text
tilesquare/
├── manifest.json       # MV3 manifest — permissions, icons, background
├── index.html          # New-tab shell (markup only, ~60 lines)
├── app.css             # All styles (extracted for maintainability)
├── app.js              # All UI logic — classes + bootstrap
├── config.js           # User-editable configuration (commands, search, clock)
├── background.js       # Service worker — proxies CORS-blocked ICS fetches
└── favicon.svg         # Extension icon (2×2 tile grid)
```

**Key classes in `app.js`:**

| Class | Responsibility |
| --- | --- |
| `Store` | Unified storage shim — routes keys to `chrome.storage.local`, `.sync`, or `localStorage` |
| `Clock` | Live time/date display with personalised greeting |
| `Weather` | Geolocation → Open-Meteo fetch, weather tip |
| `WeatherFX` | Canvas-based animated weather effects (rain, snow, storm, fog, sun) |
| `Help` | Keyboard-shortcut overlay with command grid |
| `Form` | Search input, engine cycling, keyboard routing |
| `QueryParser` | Parses raw input into redirect URLs for commands, paths, and searches |
| `Suggester` | Orchestrates suggestion influencers; renders suggestion list |
| `HistoryInfluencer` | Tracks and ranks past queries in `chrome.storage.local` |
| `DuckDuckGoInfluencer` | Fetches live autocomplete from DuckDuckGo |
| `DefaultInfluencer` | Config-defined per-key defaults |
| `CalendarWidget` | ICS fetch (via background), RRULE expansion, event rendering |
| `TodoWidget` | CRUD todo list persisted to `chrome.storage.local` |
| `Notes` | Textarea scratchpad persisted to `chrome.storage.local` |
| `JokeWidget` | Fetches and renders a random joke |
| `Onboarding` | First-run name prompt |

**Storage routing:**

| Key | Area | Reason |
| --- | --- | --- |
| `_ts_notes` | `local` | Large text; no benefit syncing |
| `_ts_todos` | `local` | Per-device task list |
| `_ts_geo` | `local` | Cached geolocation coordinates |
| `_ts_cal_ics` | `local` | Contains a private calendar auth token — must not sync |
| `history` | `local` | Search history; per-device |
| `_ts_name` | `sync` | User's first name — syncs across devices |

---

## Installation

### Load unpacked (development / personal use)

1. Clone or download this repository:

   ```bash
   git clone https://github.com/ysandeepkumarreddy/tilesquare.git
   cd tilesquare
   ```

2. Open **chrome://extensions** in Chrome.
3. Enable **Developer mode** (top-right toggle).
4. Click **Load unpacked** and select the `tilesquare` folder.
5. Open a new tab — TileSquare replaces it immediately.

> **Firefox:** Go to `about:debugging` → *This Firefox* → *Load Temporary Add-on* and select `manifest.json`. The `browser_specific_settings` key in the manifest handles Firefox compatibility.

---

## Usage

### Basic navigation

| Input | Result |
| --- | --- |
| `g` + Enter | Go to GitHub |
| `y` + Enter | Go to YouTube |
| Any unrecognised text | Google search |
| A full URL | Navigate directly |

### Search a site

```text
g'typescript generics    → github.com/search?q=typescript+generics
y'lo-fi beats            → youtube.com/results?search_query=lo-fi+beats
```

### Open a sub-path

```text
r/r/startpages           → reddit.com/r/startpages
g/ysandeepkumarreddy     → github.com/ysandeepkumarreddy
```

### Keyboard shortcuts

| Key | Action |
| --- | --- |
| Any key | Open search |
| `?` | Toggle shortcuts overlay |
| `Escape` | Close search / overlay |
| `Tab` | Open / close notes panel |
| `Ctrl+/` | Cycle search engine (Google → DDG → Bing) |
| `↑` / `↓` | Navigate suggestions |

---

## Configuration

All user configuration lives in **`config.js`**. Edit it to personalise your startpage — no build step required.

### Theme

```js
theme: 'glass-dark',  // 'glass-dark' | 'glass-light'
                       // defaults to OS preference on first load
```

### Clock

```js
clockTwentyFourHour: true,
clockShowSeconds: false,
clockDelimiter: ' – ',      // separator between hours and minutes
clockTimeZone: undefined,   // e.g. 'America/New_York'
```

### Weather

```js
weatherUnit: 'celsius',   // 'celsius' | 'fahrenheit'
```

### Adding / editing commands

Each entry in the `commands` array defines a shortcut key:

```js
{
  hues: ['214', '234'],       // gradient hue stops for the key badge colour
  key: 'g',
  name: 'GitHub',
  search: '/search?q={}',     // {} is replaced with the encoded query
  url: 'https://github.com',  // default destination when no query is given
},
```

### Search scripts

Scripts let a single key open multiple sites simultaneously:

```js
scripts: {
  q: ['bin', 'ddg', '*'],  // 'q' searches Bing + DuckDuckGo + Google at once
},
```

### Autocomplete defaults

Per-key suggestion defaults shown before you finish typing:

```js
suggestionDefaults: {
  g: ['g/trending', 'g/ossu'],
  y: ['y/feed/trending'],
},
```

---

## Calendar Setup

1. Open **Google Calendar** → Settings → your calendar → **Integrate calendar**.
2. Copy the **Secret address in iCal format** (ends in `.ics`).
3. Paste the URL into the calendar widget on your new tab page and click **Connect**.

The URL is stored in `chrome.storage.local` (never synced) because it contains a private authentication token.

Recurring events (DAILY and WEEKLY `RRULE`) and exclusion dates (`EXDATE`) are fully supported. Meeting links (Google Meet, Zoom, Teams, Webex, Whereby) are auto-detected and surfaced as a **Join →** link.

---

## Permissions

| Permission | Reason |
| --- | --- |
| `storage` | Persist settings, todos, notes, and history |
| `geolocation` | Fetch local weather (coordinates cached for 6 h) |
| `https://duckduckgo.com/` | Autocomplete suggestions |
| `https://api.open-meteo.com/` | Weather data |
| `https://api.bigdatacloud.net/` | Reverse-geocode city name from coordinates |
| `https://official-joke-api.appspot.com/` | Joke of the day |
| `https://www.google.com/s2/favicons*` | Command shortcut favicons |
| `<all_urls>` | Background service worker fetches user-configured ICS calendar URLs, which can point to any domain |

---

## Development Setup

No build step or package manager is required. The extension runs directly from source.

```bash
git clone https://github.com/ysandeepkumarreddy/tilesquare.git
cd tilesquare
# Load unpacked in chrome://extensions
```

**Recommended tools:**

- [Prettier](https://prettier.io/) for formatting — config is in `.prettierrc`
- Chrome DevTools on the new tab page for debugging

**Weather debug panel** (hidden by default):

A `DebugWeather` class is included in `app.js` as a comment block. Uncomment the class and its bootstrap line to get a side panel for previewing all weather scenes without waiting for real conditions.

---

## Contributing

Contributions are welcome. Please:

1. Fork the repository and create a feature branch.
2. Keep changes scoped — one concern per PR.
3. Test the golden path (search, navigation, weather, calendar) before submitting.
4. Follow the existing code style (Prettier config in `.prettierrc`).

---

## Future Roadmap

- [ ] PNG icons for Chrome Web Store submission (currently SVG)
- [ ] User-configurable theme toggle button in the UI
- [ ] Monthly/weekly `RRULE` support in CalendarWidget
- [ ] Bookmark sync as a suggestion source
- [ ] Optional background image support
- [ ] Options page for GUI-based command editing

---

## Troubleshooting

**Weather not showing** — Check that location permission is granted in Chrome settings for the extension. Coordinates are cached for 6 hours; clearing extension storage forces a re-prompt.

**Calendar not loading** — Make sure you pasted the *ICS* URL, not the HTML embed URL. The widget auto-detects Google Calendar embed URLs and converts them.

**Extension icon missing in toolbar** — Chrome does not render SVG icons from the `icons` manifest field. The icon appears correctly on the new-tab page itself; for the extensions toolbar, PNG icons at 16/48/128 px are needed.

**Search history not persisting** — History is stored in `chrome.storage.local`. If "Clear cookies and site data when you close Chrome" is enabled, extension local storage may be cleared as well.

---

## License

This is free and unencumbered software released into the public domain under the [Unlicense](LICENSE). Do whatever you want with it.
