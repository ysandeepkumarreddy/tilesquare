/* ─── storage shim (chrome.storage ↔ localStorage) ────── */
const Store = (() => {
  const isExt  = typeof chrome !== 'undefined' && !!chrome.runtime?.id;
  const local  = isExt ? chrome.storage.local : null;
  const sync   = isExt ? chrome.storage.sync  : null;
  const LOCAL_KEYS = new Set(['_ts_notes', 'history', '_ts_geo', '_ts_todos', '_ts_cal_ics']);
  const area = (key) => (LOCAL_KEYS.has(key) ? local : sync) || null;
  return {
    get(key, fallback = null) {
      const a = area(key);
      if (a) return new Promise((r) => a.get(key, (v) => r(v[key] ?? fallback)));
      const raw = localStorage.getItem(key);
      if (raw === null) return Promise.resolve(fallback);
      /* try to deserialise objects/arrays stored as JSON */
      if (raw[0] === '{' || raw[0] === '[') {
        try { return Promise.resolve(JSON.parse(raw)); } catch {}
      }
      return Promise.resolve(raw);
    },
    set(key, val) {
      const a = area(key);
      if (a) a.set({ [key]: val });
      else localStorage.setItem(key, typeof val === 'object' && val !== null ? JSON.stringify(val) : String(val ?? ''));
    },
  };
})();

/* ─── user name (set by Onboarding, read by Clock) ─────── */
let _userName = '';

/* ─── utility helpers ──────────────────────────────────── */
  const $ = {
    bodyClassAdd:    (c) => $.el('body').classList.add(c),
    bodyClassRemove: (c) => $.el('body').classList.remove(c),
    el:  (s) => document.querySelector(s),
    els: (s) => Array.from(document.querySelectorAll(s) || []),
    escapeRegex: (s) => s?.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&'),
    flattenAndUnique: (arr) => [...new Set([].concat(...arr))],
    isDown:   (e) => ['ctrl-n', 'down', 'tab'].includes($.whichKey(e)),
    isRemove: (e) => ['backspace', 'delete'].includes($.whichKey(e)),
    isUp:     (e) => ['ctrl-p', 'up', 's-tab'].includes($.whichKey(e)),
    whichKey: (e) => {
      const { ctrlKey: ctrl, metaKey: meta, shiftKey: shift } = e;
      switch (e.key) {
        case 'Backspace': return 'backspace';
        case 'Tab':       return shift ? 's-tab' : 'tab';
        case 'Enter':     return 'enter';
        case 'Shift':     return 'shift';
        case 'Control':   return 'ctrl';
        case 'Alt':       return 'alt';
        case 'Escape':    return 'escape';
        case 'ArrowUp':   return 'up';
        case 'ArrowDown': return 'down';
        case 'Delete':    return 'delete';
        case 'n':         return ctrl ? 'ctrl-n' : 'n';
        case 'p':         return ctrl ? 'ctrl-p' : 'p';
        case 'v':         if (ctrl || meta) return 'ctrl-v'; break;
        case 'Meta':      return 'meta';
      }
      if (ctrl) return 'ctrl-*';
      if (meta) return 'meta-*';
    },
  };

  /* ─── Clock ────────────────────────────────────────────── */
  class Clock {
    constructor(options) {
      this._el          = $.el('#clock');
      this._dateEl      = $.el('#date-line');
      this._hintEl      = $.el('#clock-hint');
      this._greetingEl  = $.el('#greeting-line');
      this._amPm      = options.amPm;
      this._delimiter = options.delimiter;
      this._showSecs  = options.showSeconds;
      this._tz        = options.timeZone;
      this._24h       = options.twentyFourHour;
      this._interval  = null;
      this._setTime   = this._setTime.bind(this);

      this._el.addEventListener('click', options.onClick);
      this._el.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          options.onClick();
        }
      });

      this._start();
    }

    stop() { clearInterval(this._interval); }

    _setTime() {
      const date   = new Date();
      const text   = date
        .toLocaleString('en-US', {
          hour12:   !this._24h,
          hour:     'numeric',
          minute:   'numeric',
          second:   this._showSecs ? 'numeric' : undefined,
          timeZone: this._tz,
        })
        .replace(this._amPm ? '' : / (AM|PM)/, '')
        .replace(/:/g, this._delimiter)
        .replace(/^0/, '');

      this._el.textContent = text;
      this._el.setAttribute('datetime', date.toTimeString());

      if (this._dateEl) {
        this._dateEl.textContent = date.toLocaleDateString('en-US', {
          weekday: 'long', month: 'long', day: 'numeric', timeZone: this._tz,
        });
      }

      const h = date.getHours();
      const greeting = h >= 5 && h < 12 ? 'Good morning'
        : h >= 12 && h < 17 ? 'Good afternoon'
        : h >= 17 && h < 21 ? 'Good evening'
        : h >= 21 || h < 1 ? 'Good night'
        : 'Hey';
      const name = _userName ? `, ${_userName}` : '';

      if (this._greetingEl) {
        this._greetingEl.textContent = `${greeting}${name}`;
      }
      if (this._hintEl) {
        this._hintEl.textContent = 'press any key  ·  ? for shortcuts';
      }
    }

    _start() {
      this._setTime();
      this._interval = setInterval(this._setTime, 1000);
    }
  }

  /* ─── Weather ──────────────────────────────────────────── */
  class Weather {
    static _tip(code, temp, unit) {
      const c = unit === 'fahrenheit' ? (temp - 32) * 5 / 9 : temp;
      if (code >= 95) return 'Thunderstorm ahead — stay indoors if you can';
      if (code >= 85) return 'Snow showers — dress warm and drive carefully';
      if (code >= 80) return 'Rain showers expected — carry an umbrella';
      if (code >= 71) return 'Snowing outside — wear warm layers';
      if (code >= 61) return 'Rainy outside — carry an umbrella';
      if (code >= 51) return 'Drizzly outside — grab an umbrella';
      if (code === 45 || code === 48) return 'Foggy conditions — drive carefully';
      if (c >= 40) return 'Extreme heat — avoid going out, stay hydrated';
      if (c >= 35) return 'Very hot outside — apply sunscreen and carry water';
      if (c >= 28) return 'Warm day — sunscreen recommended if heading out';
      if (c <= 2)  return 'Near freezing — bundle up and watch for ice';
      if (c <= 8)  return 'Cold outside — dress in warm layers';
      return null;
    }

    static _WMO = {
      0: 'Clear sky', 1: 'Mostly clear', 2: 'Partly cloudy', 3: 'Overcast',
      45: 'Foggy', 48: 'Icy fog',
      51: 'Light drizzle', 53: 'Drizzle', 55: 'Heavy drizzle',
      61: 'Light rain', 63: 'Rain', 65: 'Heavy rain',
      71: 'Light snow', 73: 'Snow', 75: 'Heavy snow', 77: 'Snow grains',
      80: 'Showers', 81: 'Rain showers', 82: 'Heavy showers',
      85: 'Snow showers', 86: 'Heavy snow showers',
      95: 'Thunderstorm', 96: 'Thunderstorm', 99: 'Thunderstorm',
    };

    constructor(options) {
      this._el   = $.el('#weather-line');
      this._unit = options.unit || 'celsius';
      this._fx   = options.fx || null;
      if (this._el && navigator.geolocation) {
        this._fetch();
        setInterval(() => this._fetch(), 30 * 60 * 1000);
      }
    }

    async _fetch() {
      try {
        const cached = await Store.get('_ts_geo');
        let lat, lon;

        if (cached && Date.now() - cached.ts < 6 * 60 * 60 * 1000) {
          /* use cached coords — no location prompt */
          ({ lat, lon } = cached);
        } else {
          const pos = await new Promise((res, rej) =>
            navigator.geolocation.getCurrentPosition(res, rej, { timeout: 8000 })
          );
          lat = pos.coords.latitude;
          lon = pos.coords.longitude;
          Store.set('_ts_geo', { lat, lon, ts: Date.now() });
        }

        const [weatherRes, geoRes] = await Promise.all([
          fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat.toFixed(4)}&longitude=${lon.toFixed(4)}&current=temperature_2m,weather_code&temperature_unit=${this._unit}&forecast_days=1`),
          fetch(`https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat.toFixed(4)}&longitude=${lon.toFixed(4)}&localityLanguage=en`),
        ]);

        const { current } = await weatherRes.json();
        const geo          = await geoRes.json();
        const city         = geo.city || geo.locality || geo.principalSubdivision || '';
        const sym          = this._unit === 'fahrenheit' ? '°F' : '°C';
        const condition    = Weather._WMO[current.weather_code] ?? 'Unknown';

        this._el.textContent = [
          city,
          `${Math.round(current.temperature_2m)}${sym}`,
          condition,
        ].filter(Boolean).join('  ·  ');

        if (this._fx) this._fx.apply(current.weather_code);

        const tip   = Weather._tip(current.weather_code, current.temperature_2m, this._unit);
        const tipEl = $.el('#weather-tip');
        if (tipEl) {
          tipEl.textContent = tip || '';
          tipEl.classList.toggle('visible', !!tip);
        }
      } catch {
        /* geolocation denied or network error — stay silent */
      }
    }
  }

  /* ─── WeatherFX ────────────────────────────────────────── */
  class WeatherFX {
    constructor() {
      this._canvas = document.createElement('canvas');
      this._canvas.id = 'weather-fx-canvas';
      document.body.appendChild(this._canvas);
      this._ctx = this._canvas.getContext('2d');

      this._sun = document.createElement('div');
      this._sun.id = 'weather-fx-sun';
      document.body.appendChild(this._sun);

      this._drops       = [];
      this._type        = null;
      this._raf         = null;
      this._flashOpacity = 0;

      window.addEventListener('resize', () => this._resize());
      this._resize();

      /* resume loop when tab becomes visible again after being hidden */
      document.addEventListener('visibilitychange', () => {
        if (!document.hidden && this._type && !this._raf) this._loop(this._type);
      });
    }

    apply(code) {
      const type = WeatherFX._toType(code);
      if (type === this._type) return;
      this._type = type;
      this._teardown();
      if (type === 'sunny') {
        this._sun.classList.add('active');
      } else if (type) {
        this._canvas.classList.add('active');
        this._spawn(type);
        this._loop(type);
        if (type === 'storm') this._scheduleLightning();
      }
    }

    _teardown() {
      cancelAnimationFrame(this._raf);
      this._raf = null;
      this._drops = [];
      this._flashOpacity = 0;
      this._ctx.clearRect(0, 0, this._canvas.width, this._canvas.height);
      this._canvas.classList.remove('active');
      this._sun.classList.remove('active');
    }

    _resize() {
      this._canvas.width  = window.innerWidth;
      this._canvas.height = window.innerHeight;
    }

    _spawn(type) {
      const count = { cloudy: 5, overcast: 10, drizzle: 28, rain: 65, storm: 110, snow: 85, fog: 10, cold: 45 }[type] ?? 65;
      for (let i = 0; i < count; i++) this._drops.push(this._newDrop(type));
    }

    _newDrop(type, atTop = false) {
      const w = this._canvas.width, h = this._canvas.height;
      if (type === 'cloudy' || type === 'overcast') {
        const baseR = 38 + Math.random() * 55;
        const puffN = 3 + Math.floor(Math.random() * 4);
        const puffs = Array.from({ length: puffN }, () => ({
          dx: (Math.random() - 0.5) * baseR * 2,
          dy: (Math.random() - 0.2) * baseR * 0.9,
          r:  baseR * (0.45 + Math.random() * 0.65),
        }));
        return {
          t: 'cloud', puffs, baseR,
          x: Math.random() * (w + baseR * 3) - baseR,
          y: 30 + Math.random() * h * 0.38,
          vx: 0.05 + Math.random() * 0.1,
          op: type === 'overcast' ? 0.18 + Math.random() * 0.14 : 0.09 + Math.random() * 0.1,
        };
      }
      if (type === 'cold') return {
        t: 'cold',
        x: Math.random() * w,
        y: h * (0.4 + Math.random() * 0.6),
        r: 1.2 + Math.random() * 2.2,
        vy: -(0.18 + Math.random() * 0.35),
        vx: (Math.random() - 0.5) * 0.25,
        op: 0.12 + Math.random() * 0.22,
        life: 0.6 + Math.random() * 0.4,
        decay: 0.0018 + Math.random() * 0.0025,
      };
      if (type === 'fog') return {
        t: 'fog',
        x: Math.random() * w,
        y: h * 0.2 + Math.random() * h * 0.6,
        rx: 150 + Math.random() * 220,
        ry:  50 + Math.random() * 90,
        vx: (0.06 + Math.random() * 0.12) * (Math.random() > 0.5 ? 1 : -1),
        op: 0.04 + Math.random() * 0.07,
      };
      if (type === 'snow') return {
        t: 'snow', x: Math.random() * w,
        y: atTop ? -10 : Math.random() * h,
        r: 1.5 + Math.random() * 2.5,
        vy: 0.35 + Math.random() * 0.65,
        vx: (Math.random() - 0.5) * 0.4,
        op: 0.4 + Math.random() * 0.4,
        phase: Math.random() * Math.PI * 2,
      };
      return {
        t: 'drop', x: Math.random() * w,
        y: atTop ? -Math.random() * 40 : Math.random() * h * 0.65,
        r: 1 + Math.random() * 2.5,
        maxR: 3 + Math.random() * (type === 'drizzle' ? 4 : 7),
        vy: 0, speed: (type === 'drizzle' ? 1.2 : 2) + Math.random() * 2.5,
        sliding: false, trail: [],
        op: 0.35 + Math.random() * 0.3,
        stuckT: 0, stuckMax: 30 + Math.random() * 80,
        type,
      };
    }

    _tickCloud(d) {
      const ctx = this._ctx, w = this._canvas.width;
      ctx.save();
      ctx.globalAlpha = d.op;
      d.puffs.forEach(({ dx, dy, r }) => {
        const cx = d.x + dx, cy = d.y + dy;
        const g = ctx.createRadialGradient(cx, cy - r * 0.18, r * 0.08, cx, cy, r);
        g.addColorStop(0,   'rgba(235,242,252,1)');
        g.addColorStop(0.55,'rgba(215,228,245,0.85)');
        g.addColorStop(1,   'rgba(200,218,240,0)');
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.fillStyle = g;
        ctx.fill();
      });
      ctx.restore();
      d.x += d.vx;
      if (d.x - d.baseR * 2 > w + 60) d.x = -d.baseR * 2;
    }

    _tickCold(d) {
      const ctx = this._ctx, w = this._canvas.width, h = this._canvas.height;
      d.life -= d.decay;
      if (d.life <= 0) { Object.assign(d, this._newDrop('cold')); return; }
      const alpha = d.op * d.life;
      const g = ctx.createRadialGradient(d.x, d.y, 0, d.x, d.y, d.r * 2.5);
      g.addColorStop(0,   `rgba(190,225,255,${alpha})`);
      g.addColorStop(0.5, `rgba(170,210,255,${alpha * 0.5})`);
      g.addColorStop(1,   'rgba(150,200,255,0)');
      ctx.beginPath();
      ctx.arc(d.x, d.y, d.r * 2.5, 0, Math.PI * 2);
      ctx.fillStyle = g;
      ctx.fill();
      d.y  += d.vy;
      d.x  += d.vx;
      d.r  += 0.015;
      if (d.y < -20 || d.x < -20 || d.x > w + 20) Object.assign(d, this._newDrop('cold'));
    }

    _tickFog(d) {
      const ctx = this._ctx, w = this._canvas.width;
      ctx.save();
      ctx.scale(1, d.ry / d.rx);
      const g = ctx.createRadialGradient(d.x, d.y * (d.rx / d.ry), 0, d.x, d.y * (d.rx / d.ry), d.rx);
      g.addColorStop(0,   `rgba(200,215,230,${d.op})`);
      g.addColorStop(0.5, `rgba(200,215,230,${d.op * 0.5})`);
      g.addColorStop(1,   'rgba(200,215,230,0)');
      ctx.beginPath();
      ctx.arc(d.x, d.y * (d.rx / d.ry), d.rx, 0, Math.PI * 2);
      ctx.fillStyle = g;
      ctx.fill();
      ctx.restore();
      d.x += d.vx;
      if (d.x - d.rx > w + 50) d.x = -d.rx;
      if (d.x + d.rx < -50)    d.x = w + d.rx;
    }

    _loop(type) {
      if (document.hidden) { this._raf = null; return; }
      const ctx = this._ctx;
      ctx.clearRect(0, 0, this._canvas.width, this._canvas.height);
      this._drops.forEach((d) => {
        if (d.t === 'snow')   this._tickSnow(d);
        else if (d.t === 'cloud') this._tickCloud(d);
        else if (d.t === 'fog')   this._tickFog(d);
        else if (d.t === 'cold')  this._tickCold(d);
        else this._tickDrop(d);
      });

      if (this._flashOpacity > 0) {
        ctx.fillStyle = `rgba(210, 235, 255, ${this._flashOpacity})`;
        ctx.fillRect(0, 0, this._canvas.width, this._canvas.height);
        this._flashOpacity = Math.max(0, this._flashOpacity - 0.03);
      }
      this._raf = requestAnimationFrame(() => this._loop(type));
    }

    _tickSnow(d) {
      const ctx = this._ctx, w = this._canvas.width, h = this._canvas.height;
      ctx.beginPath();
      ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(255,255,255,${d.op})`;
      ctx.fill();
      d.y += d.vy;
      d.x += d.vx + Math.sin(d.phase + d.y * 0.016) * 0.38;
      d.phase += 0.01;
      if (d.y > h + 10) Object.assign(d, this._newDrop('snow', true));
      if (d.x < -10) d.x = w + 10;
      if (d.x > w + 10) d.x = -10;
    }

    _tickDrop(d) {
      const ctx = this._ctx, w = this._canvas.width, h = this._canvas.height;

      if (!d.sliding) {
        d.r = Math.min(d.r + 0.025, d.maxR);
        if (++d.stuckT >= d.stuckMax) { d.sliding = true; d.vy = d.speed; }
      } else {
        d.trail.push({ x: d.x, y: d.y, r: Math.max(d.r * 0.3, 0.8) });
        if (d.trail.length > 18) d.trail.shift();
        d.y  += d.vy;
        d.vy  = Math.min(d.vy + 0.07, d.speed * 2.5);
        d.x  += (Math.random() - 0.5) * 0.35;
        d.r   = Math.max(d.r * 0.999, 1.5);
        if (d.y > h + 30) Object.assign(d, this._newDrop(d.type, true));
      }

      /* trail */
      d.trail.forEach((t, i) => {
        ctx.beginPath();
        ctx.arc(t.x, t.y, t.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(180,225,255,${(i / d.trail.length) * d.op * 0.35})`;
        ctx.fill();
      });

      /* glass bead — radial gradient */
      const g = ctx.createRadialGradient(
        d.x - d.r * 0.3, d.y - d.r * 0.35, d.r * 0.05,
        d.x, d.y, d.r
      );
      g.addColorStop(0,    `rgba(255,255,255,${d.op * 1.1})`);
      g.addColorStop(0.38, `rgba(210,240,255,${d.op * 0.75})`);
      g.addColorStop(1,    `rgba(140,195,255,${d.op * 0.15})`);
      ctx.beginPath();
      ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2);
      ctx.fillStyle = g;
      ctx.fill();

      /* specular highlight */
      ctx.beginPath();
      ctx.arc(d.x - d.r * 0.28, d.y - d.r * 0.32, d.r * 0.28, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(255,255,255,${d.op * 0.55})`;
      ctx.fill();
    }

    _scheduleLightning() {
      if (this._type !== 'storm') return;
      const flash = () => {
        if (this._type !== 'storm') return;
        this._flashOpacity = 0.18;
        if (Math.random() > 0.5) {
          setTimeout(() => { if (this._type === 'storm') this._flashOpacity = 0.12; }, 160);
        }
        setTimeout(flash, 4000 + Math.random() * 9000);
      };
      setTimeout(flash, 2000 + Math.random() * 4000);
    }

    static _toType(code) {
      if ([0, 1].includes(code))            return 'sunny';
      if (code === 2)                        return 'cloudy';
      if (code === 3)                        return 'overcast';
      if ([45, 48].includes(code))          return 'fog';
      if ([51, 53, 55].includes(code))      return 'drizzle';
      if ([61, 63, 65, 80, 81, 82].includes(code)) return 'rain';
      if ([71, 73, 75, 77, 85, 86].includes(code)) return 'snow';
      if ([95, 96, 99].includes(code))      return 'storm';
      return null;
    }
  }

  /* ─── Help ─────────────────────────────────────────────── */
  class Help {
    constructor(options) {
      this._el       = $.el('#help');
      this._commands = options.commands;
      this._newTab   = options.newTab;
      this._toggled  = false;
      this._listEl   = null;
      this.toggle    = this.toggle.bind(this);
      this._handleKeydown = this._handleKeydown.bind(this);
      this._buildCommands();
      document.addEventListener('keydown', this._handleKeydown);
    }

    toggle(show) {
      this._toggled = typeof show === 'boolean' ? show : !this._toggled;
      this._el.classList.toggle('is-open', this._toggled);
      if (!this._toggled && this._listEl) {
        this._listEl.querySelectorAll('li.hidden').forEach((li) => li.classList.remove('hidden'));
      }
    }

    _buildCommands() {
      const inner = document.createElement('div');
      inner.className = 'help-inner';

      /* header */
      const header = document.createElement('div');
      header.className = 'help-header';
      header.innerHTML = `
        <p class="help-title">Shortcuts</p>
        <div class="help-syntax">
          <span class="help-syntax-item"><code>key</code> → navigate</span>
          <span class="help-syntax-item"><code>key'query</code> → search site</span>
          <span class="help-syntax-item"><code>key/path</code> → open path</span>
          <span class="help-syntax-item"><code>url</code> → go to URL</span>
        </div>
      `;

      inner.appendChild(header);

      /* command grid — built with DOM to avoid XSS */
      const list = document.createElement('ul');
      list.className = 'command-list';
      this._listEl = list;

      this._commands.forEach(({ color, name, key, url }, i) => {
        if (!name) return;

        const styleId = `cmd-style-${i}`;
        if (!document.getElementById(styleId)) {
          const s = document.createElement('style');
          s.id = styleId;
          s.textContent = `
            .command-key-${i} { background: ${color}; }
            .command-${i}:hover { background: ${color}; color: var(--command-color-complementary); }
          `;
          document.head.appendChild(s);
        }

        const li = document.createElement('li');
        const a  = document.createElement('a');
        a.className = `command command-${i}`;
        a.href      = url;
        a.target    = this._newTab ? '_blank' : '_self';
        a.rel       = 'noopener noreferrer';

        const keyEl  = document.createElement('span');
        keyEl.className = `command-key command-key-${i}`;
        keyEl.textContent = key;

        const favicon = document.createElement('img');
        favicon.className = 'command-favicon';
        favicon.alt = '';
        favicon.width = 14;
        favicon.height = 14;
        try {
          favicon.src = `https://www.google.com/s2/favicons?domain=${new URL(url).hostname}&sz=32`;
        } catch { favicon.style.display = 'none'; }
        favicon.onerror = () => { favicon.style.display = 'none'; };

        const nameEl = document.createElement('span');
        nameEl.className = 'command-name';
        nameEl.textContent = name;

        a.appendChild(keyEl);
        a.appendChild(favicon);
        a.appendChild(nameEl);
        li.appendChild(a);
        list.appendChild(li);
      });

      inner.appendChild(list);
      this._el.appendChild(inner);
    }

    _handleKeydown(e) {
      if ($.whichKey(e) === 'escape') this.toggle(false);
    }
  }

  /* ─── Notes ────────────────────────────────────────────── */
  class Notes {
    constructor() {
      this._open     = false;
      this._el       = null;
      this._textarea = null;
      this._build();
      document.addEventListener('keydown', this._handleKeydown.bind(this));
    }

    toggle(show) {
      this._open = typeof show === 'boolean' ? show : !this._open;
      this._el.classList.toggle('is-open', this._open);
      if (this._open) this._textarea.focus();
    }

    _build() {
      this._el = document.createElement('div');
      this._el.className = 'notes-panel';
      this._el.setAttribute('role', 'dialog');
      this._el.setAttribute('aria-label', 'Quick notes');

      const header = document.createElement('div');
      header.className = 'notes-header';

      const title = document.createElement('span');
      title.textContent = 'Notes';

      const hint = document.createElement('span');
      hint.textContent = 'Tab · Esc to close';
      hint.style.cssText = 'font-size:0.58rem;opacity:0.45;letter-spacing:0.1em';

      const closeBtn = document.createElement('button');
      closeBtn.type = 'button';
      closeBtn.className = 'notes-close';
      closeBtn.textContent = '×';
      closeBtn.setAttribute('aria-label', 'Close notes');
      closeBtn.addEventListener('click', () => this.toggle(false));

      header.appendChild(title);
      header.appendChild(hint);
      header.appendChild(closeBtn);

      this._textarea = document.createElement('textarea');
      this._textarea.className = 'notes-textarea';
      this._textarea.placeholder = 'Type anything… (auto-saved)';
      Store.get('_ts_notes').then((v) => { this._textarea.value = v || ''; });
      this._textarea.addEventListener('input', () =>
        Store.set('_ts_notes', this._textarea.value)
      );

      this._el.appendChild(header);
      this._el.appendChild(this._textarea);
      document.body.appendChild(this._el);
    }

    _handleKeydown(e) {
      if ($.whichKey(e) !== 'tab') return;
      if (document.body.classList.contains('suggestions')) return;
      if ($.el('.help.is-open')) return;
      e.preventDefault();
      this.toggle();
    }
  }

  /* ─── Influencer base ──────────────────────────────────── */
  class Influencer {
    constructor(options) {
      this._limit    = options.limit;
      this._minChars = options.minChars;
    }

    addItem()       { return undefined; }
    getSuggestions() { return Promise.resolve([]); }

    _addSearchPrefix(items, { isSearch, key, split }) {
      const prefix = isSearch ? `${key}${split}` : false;
      return items.map((s) => (prefix ? prefix + s : s));
    }

    _isTooShort(query) { return query.length < this._minChars; }
  }

  /* ─── DefaultInfluencer ────────────────────────────────── */
  class DefaultInfluencer extends Influencer {
    constructor({ suggestionDefaults, ...rest }) {
      super(rest);
      this._defaults = suggestionDefaults;
    }

    getSuggestions({ raw }) {
      return Promise.resolve((this._defaults[raw] || []).slice(0, this._limit));
    }
  }

  /* ─── DuckDuckGoInfluencer ─────────────────────────────── */
  class DuckDuckGoInfluencer extends Influencer {
    getSuggestions(parsedQuery) {
      const { lower, query } = parsedQuery;
      if (this._isTooShort(query)) return Promise.resolve([]);

      return fetch(
        `https://duckduckgo.com/ac/?q=${encodeURIComponent(query)}`,
        { signal: AbortSignal.timeout(3000) }
      )
        .then((r) => r.json())
        .then((res) =>
          this._addSearchPrefix(
            res
              .map((i) => i.phrase)
              .filter((s) => s.toLowerCase() !== lower)
              .slice(0, this._limit),
            parsedQuery
          )
        )
        .catch(() => []);
    }
  }

  /* ─── HistoryInfluencer ────────────────────────────────── */
  class HistoryInfluencer extends Influencer {
    constructor(options) {
      super(options);
      this._storeName = 'history';
      this._history   = null;
      Store.get(this._storeName, []).then((v) => {
        this._history = Array.isArray(v) ? v : [];
      });
    }

    addItem({ isPath, lower }) {
      if (isPath || this._isTooShort(lower) || !this._history) return;
      let exists = false;
      const next = this._history.map(([item, count]) => {
        if (item === lower) { exists = true; return [item, count + 1]; }
        return [item, count];
      });
      if (!exists) next.push([lower, 1]);
      this._history = next.sort((a, b) => b[1] - a[1]);
      Store.set(this._storeName, this._history);
    }

    getSuggestions(parsedQuery) {
      const { lower } = parsedQuery;
      if (this._isTooShort(lower) || !this._history) return Promise.resolve([]);
      return Promise.resolve(
        this._addSearchPrefix(
          this._history
            .filter(([item]) => item !== lower && item.includes(lower))
            .slice(0, this._limit)
            .map(([item]) => item),
          parsedQuery
        )
      );
    }
  }

  /* ─── Suggester ────────────────────────────────────────── */
  class Suggester {
    constructor(options) {
      this._el                  = $.el('#search-suggestions');
      this._influencers         = options.influencers;
      this._limit               = options.limit;
      this._parsedQuery         = '';
      this._highlightedSuggestion = null;
      this._suggestionEls       = [];
      this._handleKeydown       = this._handleKeydown.bind(this);
      this._setSuggestions      = this._setSuggestions.bind(this);
      document.addEventListener('keydown', this._handleKeydown);
    }

    setOnClick(cb)      { this._onClick = cb; }
    setOnHighlight(cb)  { this._onHighlight = cb; }
    setOnUnhighlight(cb){ this._onUnhighlight = cb; }

    success(parsedQuery) {
      this._influencers.forEach((i) => i.addItem(parsedQuery));
      this._clearSuggestions();
    }

    suggest(parsedQuery) {
      this._parsedQuery         = parsedQuery;
      this._highlightedSuggestion = null;

      if (!parsedQuery.query) { this._clearSuggestions(); return; }

      Promise.all(this._influencers.map((i) => i.getSuggestions(parsedQuery)))
        .then(this._setSuggestions);
    }

    /* XSS-safe DOM builder */
    _buildSuggestionEl(suggestion) {
      const li  = document.createElement('li');
      const btn = document.createElement('button');
      btn.type      = 'button';
      btn.className = 'js-search-suggestion search-suggestion';
      btn.dataset.suggestion = suggestion;
      btn.setAttribute('tabindex', '-1');
      btn.setAttribute('role', 'option');

      const match   = new RegExp($.escapeRegex(this._parsedQuery.query), 'i');
      const matched = suggestion.match(match);

      if (matched) {
        const before = document.createTextNode(suggestion.slice(0, matched.index));
        const span   = document.createElement('span');
        span.className = 'search-suggestion-match';
        span.textContent = matched[0];
        const after  = document.createTextNode(suggestion.slice(matched.index + matched[0].length));
        btn.appendChild(before);
        btn.appendChild(span);
        btn.appendChild(after);
      } else {
        btn.textContent = suggestion;
      }

      li.appendChild(btn);
      return li;
    }

    _clearSuggestions() {
      $.bodyClassRemove('suggestions');
      this._eventsAC?.abort();
      this._eventsAC = null;
      this._el.innerHTML = '';
      this._highlightedSuggestion = null;
      this._suggestionEls = [];
    }

    _focusNext(e) {
      const exists = this._suggestionEls.some((el, i) => {
        if (el.classList.contains('highlight')) {
          this._highlight(this._suggestionEls[i + 1], e);
          return true;
        }
      });
      if (!exists) this._highlight(this._suggestionEls[0], e);
    }

    _focusPrevious(e) {
      const exists = this._suggestionEls.some((el, i) => {
        if (el.classList.contains('highlight') && i) {
          this._highlight(this._suggestionEls[i - 1], e);
          return true;
        }
      });
      if (!exists) this._unHighlight(e);
    }

    _handleKeydown(e) {
      if ($.isDown(e)) this._focusNext(e);
      if ($.isUp(e))   this._focusPrevious(e);
    }

    _highlight(el, e) {
      this._unHighlight();
      if (!el) return;
      this._highlightedSuggestion = el.dataset.suggestion;
      this._onHighlight(this._highlightedSuggestion);
      el.classList.add('highlight');
      if (e) e.preventDefault();
    }

    _rehighlight() {
      if (!this._highlightedSuggestion) return;
      this._highlight($.el(`[data-suggestion="${CSS.escape(this._highlightedSuggestion)}"]`));
    }

    _registerSuggestionEvents() {
      this._eventsAC?.abort();
      this._eventsAC = new AbortController();
      const { signal } = this._eventsAC;

      /* delay mouse handlers until first mouse move to avoid accidental hover on keyboard nav */
      const enableMouse = () => {
        this._suggestionEls.forEach((el) => {
          el.addEventListener('mouseover', () => this._highlight(el), { signal });
          el.addEventListener('mouseout',  () => this._unHighlight(), { signal });
        });
      };
      window.addEventListener('mousemove', enableMouse, { once: true, signal });

      this._suggestionEls.forEach((el) => {
        el.addEventListener('click', () => this._onClick(el.dataset.suggestion), { signal });
      });
    }

    _setSuggestions(newSuggestions) {
      const suggestions = $.flattenAndUnique(newSuggestions).slice(0, this._limit);
      this._el.innerHTML = '';
      suggestions.forEach((s) => this._el.appendChild(this._buildSuggestionEl(s)));
      this._suggestionEls = $.els('.js-search-suggestion');
      this._registerSuggestionEvents();
      if (this._suggestionEls.length) $.bodyClassAdd('suggestions');
      this._rehighlight();
    }

    _unHighlight(e) {
      const el = $.el('.highlight');
      if (!el) return;
      this._onUnhighlight();
      el.classList.remove('highlight');
      if (e) e.preventDefault();
    }
  }

  /* ─── QueryParser ──────────────────────────────────────── */
  class QueryParser {
    constructor(options) {
      this._commands       = options.commands;
      this._searchDelimiter = options.searchDelimiter;
      this._pathDelimiter  = options.pathDelimiter;
      this._scripts        = options.scripts;
      this._protocolRegex  = /^[a-zA-Z]+:\/\//i;
      this._urlRegex       = /^((https?:\/\/)?[\w-]+(\.[\w-]+)+\.?(:\d+)?(\/\S*)?)$/i;
      this.parse           = this.parse.bind(this);
    }

    parse(query) {
      const res   = [];
      res.raw     = query.trim();
      res.query   = res.raw;
      res.lower   = res.raw.toLowerCase();
      res.split   = null;

      if (this._urlRegex.test(query)) {
        const hasProtocol = this._protocolRegex.test(query);
        res.redirect = hasProtocol ? query : 'http://' + query;
        res.color    = QueryParser._getColorFromUrl(this._commands, res.redirect);
        res.isUrl    = true;
        return res;
      }

      const splitSearch = res.query.split(this._searchDelimiter);
      const splitPath   = res.query.split(this._pathDelimiter);

      const isScript = Object.entries(this._scripts).some(([key, script]) => {
        if (query === key) {
          res.key = key; res.isKey = true;
          script.forEach((cmd) => res.push(this.parse(cmd)));
          return true;
        }
        if (splitSearch[0] === key) {
          res.key = key; res.isSearch = true; res.split = this._searchDelimiter;
          res.query = QueryParser._shiftAndTrim(splitSearch, res.split);
          res.lower = res.query.toLowerCase();
          script.forEach((cmd) => res.push(this.parse(`${cmd}${res.split}${res.query}`)));
          return true;
        }
        if (splitPath[0] === key) {
          res.key = key; res.isPath = true; res.split = this._pathDelimiter;
          res.path = QueryParser._shiftAndTrim(splitPath, res.split);
          script.forEach((cmd) => res.push(this.parse(`${cmd}${this._pathDelimiter}${res.path}`)));
          return true;
        }
      });

      if (isScript) return res;

      this._commands.some(({ key, search, url }) => {
        if (query === key) {
          res.key = key; res.isKey = true; res.redirect = url;
          return true;
        }
        if (splitSearch[0] === key) {
          res.key = key; res.isSearch = true; res.split = this._searchDelimiter;
          res.query    = QueryParser._shiftAndTrim(splitSearch, res.split);
          res.lower    = res.query.toLowerCase();
          res.redirect = QueryParser._prepSearch(url, search, res.query);
          return true;
        }
        if (splitPath[0] === key) {
          res.key = key; res.isPath = true; res.split = this._pathDelimiter;
          res.path     = QueryParser._shiftAndTrim(splitPath, res.split);
          res.redirect = QueryParser._prepPath(url, res.path);
          return true;
        }
        if (key === '*') res.redirect = QueryParser._prepSearch(url, search, query);
      });

      res.color = QueryParser._getColorFromUrl(this._commands, res.redirect);
      return res;
    }

    static _getColorFromUrl(commands, url) {
      if (!url) return undefined;
      try {
        const domain      = new URL(url).hostname;
        const domainRegex = new RegExp(`${domain}$`);
        return commands.find((c) => {
          try { return domainRegex.test(new URL(c.url).hostname); }
          catch { return false; }
        })?.color;
      } catch { return undefined; }
    }

    static _prepPath(url, path) {
      return QueryParser._stripUrlPath(url) + '/' + path;
    }

    static _prepSearch(url, searchPath, query) {
      if (!searchPath) return url;
      const urlQuery = encodeURIComponent(query);
      return QueryParser._stripUrlPath(url) + searchPath.replace(/{}/g, urlQuery);
    }

    static _shiftAndTrim(arr, delimiter) {
      arr.shift();
      return arr.join(delimiter).trim();
    }

    static _stripUrlPath(url) {
      const { protocol, hostname } = new URL(url);
      return `${protocol}//${hostname}`;
    }
  }

  /* ─── Form ─────────────────────────────────────────────── */
  class Form {
    constructor(options) {
      this._formEl         = $.el('#search-form');
      this._inputEl        = $.el('#search-input');
      this._engineEl       = $.el('#engine-indicator');
      this._inputElVal     = '';
      this._instantRedirect = options.instantRedirect;
      this._helpKey        = options.helpKey;
      this._newTab         = options.newTab;
      this._parseQuery     = options.parseQuery;
      this._suggester      = options.suggester;
      this._toggleHelp     = options.toggleHelp;
      this._suggestTimer   = null;

      this._engines  = [
        { name: 'Google',     key: '*' },
        { name: 'DuckDuckGo', key: 'ddg' },
        { name: 'Bing',       key: 'bin' },
      ];
      this._engineIdx = 0;

      this._clearPreview   = this._clearPreview.bind(this);
      this._handleInput    = this._handleInput.bind(this);
      this._handleKeydown  = this._handleKeydown.bind(this);
      this._previewValue   = this._previewValue.bind(this);
      this._submitForm     = this._submitForm.bind(this);
      this._submitWithValue = this._submitWithValue.bind(this);
      this.hide            = this.hide.bind(this);
      this.show            = this.show.bind(this);

      this._registerEvents();
      this._loadQueryParam();
    }

    hide() {
      $.bodyClassRemove('form');
      this._inputEl.value = '';
      this._inputElVal    = '';
      this._suggester.suggest({ query: '' });
      this._setColorsFromQuery('');
      this._engineIdx = 0;
      this._updateEngineIndicator();
    }

    show() {
      $.bodyClassAdd('form');
      this._inputEl.focus();
    }

    _cycleEngine() {
      this._engineIdx = (this._engineIdx + 1) % this._engines.length;
      this._updateEngineIndicator();
    }

    _updateEngineIndicator() {
      if (!this._engineEl) return;
      if (this._engineIdx === 0) {
        this._engineEl.textContent = '';
        this._engineEl.classList.remove('visible');
      } else {
        this._engineEl.textContent = `→ ${this._engines[this._engineIdx].name}`;
        this._engineEl.classList.add('visible');
      }
    }

    _clearPreview() {
      this._previewValue(this._inputElVal);
      this._inputEl.focus();
    }

    _handleInput() {
      const newQuery   = this._inputEl.value;
      const isHelp     = newQuery === this._helpKey;
      const parsedQuery = this._parseQuery(newQuery);
      this._inputElVal = newQuery;
      this._setColorsFromQuery(newQuery);

      /* debounce suggestions at 200ms */
      clearTimeout(this._suggestTimer);
      this._suggestTimer = setTimeout(() => this._suggester.suggest(parsedQuery), 200);

      if (!newQuery || isHelp) this.hide();
      if (isHelp) this._toggleHelp();

      if (this._instantRedirect && parsedQuery.isKey) this._submitWithValue(newQuery);
    }

    _handleKeydown(e) {
      /* don't hijack when help, notes, or any other input/textarea has focus */
      if ($.el('.help.is-open') || $.el('.notes-panel.is-open')) return;
      const active = document.activeElement;
      if (active && active !== this._inputEl && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA')) return;

      if ($.isUp(e) || $.isDown(e) || $.isRemove(e)) return;

      /* Ctrl+/ — cycle search engine while form is visible */
      if (e.ctrlKey && e.key === '/') {
        e.preventDefault();
        if (document.body.classList.contains('form')) this._cycleEngine();
        return;
      }

      switch ($.whichKey(e)) {
        case 'alt':
        case 'ctrl':
        case 'ctrl-*':
        case 'enter':
        case 'meta':
        case 'meta-*':
        case 'shift':
          return;
        case 'escape':
          this.hide();
          return;
      }

      this.show();
    }

    _loadQueryParam() {
      const q = new URLSearchParams(window.location.search).get('q');
      if (q) this._submitWithValue(q);
    }

    _previewValue(value) {
      this._inputEl.value = value;
      this._setColorsFromQuery(value);
    }

    _redirect(redirect, forceNewTab) {
      if (!redirect) return;
      if (this._newTab || forceNewTab) {
        window.open(redirect, '_blank', 'noopener noreferrer');
      } else {
        window.location.href = redirect;
      }
    }

    _registerEvents() {
      document.addEventListener('keydown', this._handleKeydown);
      this._inputEl.addEventListener('input', this._handleInput);
      this._formEl.addEventListener('submit', this._submitForm, false);

      if (this._suggester) {
        this._suggester.setOnClick(this._submitWithValue);
        this._suggester.setOnHighlight(this._previewValue);
        this._suggester.setOnUnhighlight(this._clearPreview);
      }
    }

    _setColorsFromQuery(query) {
      const { color } = this._parseQuery(query);

      if (color) {
        const lineColor = color.startsWith('linear-gradient')
          ? 'rgba(255, 255, 255, 0.65)'
          : color;
        this._inputEl.style.borderBottomColor = lineColor;
        $.bodyClassAdd('color');
      } else {
        this._inputEl.style.borderBottomColor = '';
        $.bodyClassRemove('color');
      }
    }

    _submitForm(e) {
      if (e) e.preventDefault();
      let parsedQuery = this._parseQuery(this._inputEl.value);

      /* engine override — reroute plain-text searches to selected engine */
      if (this._engineIdx > 0 && !parsedQuery.key && !parsedQuery.isUrl && !parsedQuery.length) {
        parsedQuery = this._parseQuery(
          `${this._engines[this._engineIdx].key}'${this._inputEl.value}`
        );
      }

      if (parsedQuery.length) {
        parsedQuery.forEach((r) => this._redirect(r.redirect, true));
      } else {
        this._redirect(parsedQuery.redirect);
      }

      this._suggester.success(parsedQuery);
      this.hide();
    }

    _submitWithValue(value) {
      this._inputEl.value = value;
      this._submitForm();
    }
  }

  /* ─── CalendarWidget ───────────────────────────────────── */
  class CalendarWidget {
    constructor() {
      this._el = $.el('#cal-widget');
      if (!this._el) return;
      Store.get('_ts_cal_ics').then((url) => {
        url ? this._fetchAndRender(url) : this._renderSetup();
      });
      setInterval(() => {
        Store.get('_ts_cal_ics').then((url) => { if (url) this._fetchAndRender(url); });
      }, 10 * 60 * 1000);
    }

    _normaliseUrl(raw) {
      try {
        const u = new URL(raw);
        if (u.hostname === 'calendar.google.com' && u.pathname.startsWith('/calendar/embed')) {
          const src = u.searchParams.get('src');
          if (src) return `https://calendar.google.com/calendar/ical/${encodeURIComponent(src)}/public/basic.ics`;
        }
      } catch {}
      return raw;
    }

    _fetchAndRender(url) {
      const isExt = typeof chrome !== 'undefined' && !!chrome.runtime?.id;
      if (!isExt) { this._renderSetup(); return; }
      chrome.runtime.sendMessage({ type: 'FETCH_ICS', url }, (res) => {
        if (chrome.runtime.lastError || !res?.ok) { this._renderError(); return; }
        if (!res.text.includes('BEGIN:VCALENDAR')) { this._renderError('Not a valid ICS URL'); return; }
        this._renderEvents(this._upcomingDays(this._parse(res.text)));
      });
    }

    _parse(text) {
      const events = [];
      let cur = null;
      for (const line of text.replace(/\r?\n[ \t]/g, '').split(/\r?\n/)) {
        if (line === 'BEGIN:VEVENT') { cur = {}; continue; }
        if (line === 'END:VEVENT' && cur) { events.push(cur); cur = null; continue; }
        if (!cur) continue;
        const ci = line.indexOf(':');
        if (ci < 0) continue;
        const key = line.slice(0, ci).split(';')[0];
        const val = line.slice(ci + 1);
        if (key === 'SUMMARY')     cur.title    = val.replace(/\\[,n]/g, ' ').trim();
        if (key === 'DTSTART')     cur.start    = this._date(val);
        if (key === 'DTEND')       cur.end      = this._date(val);
        if (key === 'URL')         cur.url      = val.trim();
        if (key === 'LOCATION')    cur.location = val.replace(/\\,/g, ',').trim();
        if (key === 'DESCRIPTION') cur.desc     = val.replace(/\\n/g, '\n').replace(/\\,/g, ',');
        if (key === 'RRULE')       cur.rrule    = val;
        if (key === 'EXDATE') {
          cur.exdates = cur.exdates || [];
          /* strip optional TZID/VALUE prefix before the colon */
          cur.exdates.push(val.includes(':') ? val.split(':')[1] : val);
        }
      }
      return events;
    }

    _date(s) {
      if (/^\d{8}$/.test(s)) return new Date(`${s.slice(0,4)}-${s.slice(4,6)}-${s.slice(6,8)}`);
      const m = s.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z?)$/);
      if (!m) return null;
      return new Date(`${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}${m[7]}`);
    }

    _rruleOccursOnDate(ev, targetDate) {
      if (!ev.rrule || !ev.start) return false;
      const sod  = new Date(targetDate); sod.setHours(0, 0, 0, 0);
      const DAY  = ['SU','MO','TU','WE','TH','FR','SA'];
      const parts = {};
      ev.rrule.split(';').forEach((p) => { const [k,v] = p.split('='); parts[k] = v; });
      const freq  = parts.FREQ;
      const intv  = parseInt(parts.INTERVAL || '1', 10);
      const until = parts.UNTIL ? this._date(parts.UNTIL) : null;
      if (until && until < sod) return false;
      if (ev.exdates) {
        const pfx = `${targetDate.getFullYear()}${String(targetDate.getMonth()+1).padStart(2,'0')}${String(targetDate.getDate()).padStart(2,'0')}`;
        if (ev.exdates.some((x) => x.startsWith(pfx))) return false;
      }
      const base = new Date(ev.start); base.setHours(0, 0, 0, 0);
      if (freq === 'DAILY') {
        const diff = Math.round((sod - base) / 86400000);
        return diff >= 0 && diff % intv === 0;
      }
      if (freq === 'WEEKLY') {
        const byday = parts.BYDAY ? parts.BYDAY.split(',') : [DAY[ev.start.getDay()]];
        if (!byday.includes(DAY[targetDate.getDay()])) return false;
        const diff  = Math.round((sod - base) / 86400000);
        const weeks = Math.floor(diff / 7);
        return diff >= 0 && weeks % intv === 0;
      }
      return false;
    }

    _eventsForDate(allEvents, targetDate) {
      const sod = new Date(targetDate); sod.setHours(0, 0, 0, 0);
      const eod = new Date(targetDate); eod.setHours(23, 59, 59, 999);
      const out = [];
      allEvents.forEach((ev) => {
        if (!ev.start) return;
        if (!ev.rrule) {
          if (ev.start >= sod && ev.start <= eod) out.push({ ...ev });
          return;
        }
        if (!this._rruleOccursOnDate(ev, targetDate)) return;
        const occ = { ...ev };
        occ.start = new Date(targetDate);
        occ.start.setHours(ev.start.getHours(), ev.start.getMinutes(), ev.start.getSeconds(), 0);
        if (ev.end) occ.end = new Date(occ.start.getTime() + (ev.end - ev.start));
        out.push(occ);
      });
      return out.sort((a, b) => a.start - b.start);
    }

    _upcomingDays(allEvents) {
      const today     = new Date();
      const todayEvts = this._eventsForDate(allEvents, today);
      /* today has ≥2 meetings → show only today (panel scrolls) */
      if (todayEvts.length >= 2) return [{ date: today, events: todayEvts }];
      /* sparse today → fill with next 3 days that have meetings */
      const groups = [{ date: today, events: todayEvts }];
      for (let i = 1; i <= 3; i++) {
        const d = new Date(today); d.setDate(today.getDate() + i);
        const evts = this._eventsForDate(allEvents, d);
        if (evts.length) groups.push({ date: d, events: evts });
      }
      return groups;
    }

    _meetLink(ev) {
      const txt = [ev.url, ev.location, ev.desc].filter(Boolean).join(' ');
      const m = txt.match(/https?:\/\/[^\s<>"'\\]+(?:meet\.google\.com|zoom\.us|teams\.microsoft|webex\.com|whereby\.com)[^\s<>"'\\]*/);
      return m ? m[0] : null;
    }

    _rel(date) {
      const m = Math.round((date - new Date()) / 60000);
      if (m <= 0) return 'now';
      return m < 60 ? `in ${m}m` : `in ${Math.round(m / 60)}h`;
    }

    _clear() { this._el.innerHTML = ''; }

    _label(txt) {
      const p = document.createElement('p');
      p.className = 'cal-label'; p.textContent = txt; return p;
    }

    _gear(label, onClick) {
      const b = document.createElement('button');
      b.className = 'cal-gear'; b.textContent = label;
      b.addEventListener('click', onClick); return b;
    }

    _actions() {
      const wrap = document.createElement('div');
      wrap.style.cssText = 'display:flex;gap:0.5rem;justify-content:flex-end';
      wrap.appendChild(this._gear('edit', () => Store.get('_ts_cal_ics').then((u) => this._renderSetup(u || ''))));
      wrap.appendChild(this._gear('disconnect', () => { Store.set('_ts_cal_ics', ''); this._renderSetup(); }));
      return wrap;
    }

    _renderSetup(currentUrl = '') {
      this._clear();
      this._el.appendChild(this._label('CALENDAR'));
      const card = document.createElement('div');
      card.className = 'cal-connect';

      const hint = document.createElement('p');
      hint.className = 'cal-hint';
      hint.textContent = 'Google Calendar → Settings → your calendar → Integrate calendar → Secret address in iCal format. Paste URL below.';

      const input = document.createElement('input');
      input.type = 'url'; input.className = 'cal-url-input';
      input.placeholder = 'https://calendar.google.com/calendar/ical/…';
      input.value = currentUrl;
      input.autocomplete = 'off'; input.spellcheck = false;

      const btn = document.createElement('button');
      btn.className = 'cal-save-btn'; btn.textContent = currentUrl ? 'Save' : 'Connect';

      const save = () => {
        const raw = input.value.trim();
        if (!raw) return;
        const url = this._normaliseUrl(raw);
        Store.set('_ts_cal_ics', url);
        this._fetchAndRender(url);
      };
      btn.addEventListener('click', save);
      input.addEventListener('keydown', (e) => { if (e.key === 'Enter') save(); });

      card.appendChild(hint);
      card.appendChild(input);
      card.appendChild(btn);
      this._el.appendChild(card);
      requestAnimationFrame(() => { input.focus(); input.select(); });
    }

    _renderEvents(dayGroups) {
      this._clear();
      this._el.appendChild(this._label('UPCOMING'));
      const now   = new Date();
      const today = new Date(); today.setHours(0, 0, 0, 0);
      const fmt   = (d) => d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });

      dayGroups.forEach(({ date, events }) => {
        const group = document.createElement('div');
        group.className = 'cal-day-group';

        const d0 = new Date(date); d0.setHours(0, 0, 0, 0);
        const diffDays  = Math.round((d0 - today) / 86400000);
        const dayLabel  = diffDays === 0 ? 'TODAY'
          : diffDays === 1 ? 'TOMORROW'
          : date.toLocaleDateString('en-US', { weekday: 'long' }).toUpperCase();
        const dateLabel = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

        const dayHdr = document.createElement('p');
        dayHdr.className = 'cal-day-header';
        dayHdr.textContent = `${dayLabel}  ·  ${dateLabel}`;
        group.appendChild(dayHdr);

        if (!events.length) {
          const p = document.createElement('p');
          p.className = 'cal-empty'; p.textContent = 'No meetings';
          group.appendChild(p);
        } else {
          events.forEach((ev) => {
            const ended = ev.end ? ev.end < now : ev.start < now;
            const card  = document.createElement('div');
            card.className = ended ? 'cal-event cal-ended' : 'cal-event';

            const title = document.createElement('span');
            title.className = 'cal-event-title';
            title.textContent = ev.title || 'Untitled';

            const time = document.createElement('span');
            time.className = 'cal-event-time';
            let timeStr = fmt(ev.start);
            if (ev.end) timeStr += ` – ${fmt(ev.end)}`;
            if (!ended && diffDays === 0) timeStr += `  ·  ${this._rel(ev.start)}`;
            time.textContent = timeStr;

            card.appendChild(title);
            card.appendChild(time);

            const join = this._meetLink(ev);
            if (join) {
              const a = document.createElement('a');
              a.className = 'cal-join'; a.href = join;
              a.target = '_blank'; a.rel = 'noopener noreferrer';
              a.textContent = 'Join →';
              card.appendChild(a);
            }
            group.appendChild(card);
          });
        }
        this._el.appendChild(group);
      });

      this._el.appendChild(this._actions());
    }

    _renderError(msg = 'Could not load calendar') {
      this._clear();
      this._el.appendChild(this._label('CALENDAR'));
      const p = document.createElement('p');
      p.className = 'cal-empty'; p.textContent = msg;
      this._el.appendChild(p);
      this._el.appendChild(this._actions());
    }
  }

  /* ─── TodoWidget ───────────────────────────────────────── */
  class TodoWidget {
    constructor() {
      this._el = $.el('#todo-widget');
      if (!this._el) return;
      Store.get('_ts_todos').then((v) => {
        this._todos = Array.isArray(v) ? v : [];
        this._render();
      });
    }

    _save() { Store.set('_ts_todos', this._todos); }

    _render() {
      this._el.innerHTML = '';

      const label = document.createElement('p');
      label.className = 'cal-label';
      label.textContent = 'TODO';
      this._el.appendChild(label);

      this._todos.forEach((todo, i) => {
        const row = document.createElement('div');
        row.className = 'todo-item' + (todo.done ? ' done' : '');

        const check = document.createElement('button');
        check.className = 'todo-check';
        check.setAttribute('aria-label', todo.done ? 'Mark incomplete' : 'Mark complete');
        check.textContent = todo.done ? '✓' : '';
        check.addEventListener('click', () => {
          this._todos[i].done = !this._todos[i].done;
          this._save();
          this._render();
        });

        const text = document.createElement('span');
        text.className = 'todo-text';
        text.textContent = todo.text;

        const del = document.createElement('button');
        del.className = 'todo-del';
        del.setAttribute('aria-label', 'Delete task');
        del.textContent = '×';
        del.addEventListener('click', () => {
          this._todos.splice(i, 1);
          this._save();
          this._render();
        });

        row.appendChild(check);
        row.appendChild(text);
        row.appendChild(del);
        this._el.appendChild(row);
      });

      const addRow = document.createElement('div');
      addRow.className = 'todo-add-row';

      const input = document.createElement('input');
      input.type = 'text';
      input.className = 'todo-input';
      input.placeholder = 'Add task…';
      input.autocomplete = 'off';
      input.spellcheck = false;

      const btn = document.createElement('button');
      btn.className = 'todo-add-btn';
      btn.textContent = '+';

      const add = () => {
        const text = input.value.trim();
        if (!text) return;
        this._todos.push({ text, done: false });
        this._save();
        this._render();
        const newInput = this._el.querySelector('.todo-input');
        if (newInput) newInput.focus();
      };

      btn.addEventListener('click', add);
      input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } });

      addRow.appendChild(input);
      addRow.appendChild(btn);
      this._el.appendChild(addRow);
    }
  }

  /* ─── JokeWidget ───────────────────────────────────────── */
  class JokeWidget {
    constructor() {
      this._el = $.el('#joke-widget');
      if (!this._el) return;
      this._fetch();
    }

    async _fetch() {
      try {
        const res  = await fetch('https://official-joke-api.appspot.com/random_joke',
          { signal: AbortSignal.timeout(5000) });
        const joke = await res.json();
        this._render(joke);
      } catch { /* silent — network may be unavailable */ }
    }

    _render({ setup, punchline }) {
      const setupEl = document.createElement('p');
      setupEl.className = 'joke-setup';
      setupEl.textContent = setup;

      const hint = document.createElement('p');
      hint.className = 'joke-hint';
      hint.textContent = 'tap for punchline';

      const punchEl = document.createElement('p');
      punchEl.className = 'joke-punchline';
      punchEl.textContent = punchline;

      this._el.appendChild(setupEl);
      this._el.appendChild(hint);
      this._el.appendChild(punchEl);

      this._el.addEventListener('click', () => this._el.classList.add('revealed'), { once: true });
      requestAnimationFrame(() => this._el.classList.add('visible'));
    }
  }

  /* ─── DEBUG WEATHER PANEL ─────────────────────────────────
     Uncomment the entire block below (class + bootstrap line)
     to show a small debug button for testing weather scenes.
     Comment it back out before using the extension normally.
  ────────────────────────────────────────────────────────── */
  /*
  class DebugWeather {
    static SCENES = [
      { label: 'Clear',         code:  0, temp: 22 },
      { label: 'Partly cloudy', code:  2, temp: 24 },
      { label: 'Overcast',      code:  3, temp: 20 },
      { label: 'Warm (28°C)',   code:  1, temp: 28 },
      { label: 'Hot (35°C)',    code:  0, temp: 35 },
      { label: 'Extreme (42°)', code:  0, temp: 42 },
      { label: 'Drizzle',       code: 53, temp: 20 },
      { label: 'Rain',          code: 63, temp: 18 },
      { label: 'Rain showers',  code: 81, temp: 19 },
      { label: 'Thunderstorm',  code: 95, temp: 21 },
      { label: 'Snow',          code: 73, temp: -1 },
      { label: 'Snow showers',  code: 85, temp:  0 },
      { label: 'Foggy',         code: 45, temp: 14 },
      { label: 'Cold (6°C)',    code:  3, temp:  6 },
      { label: 'Freezing (1°)', code: 71, temp: -1 },
    ];

    constructor(fx) {
      this._fx  = fx;
      this._el  = this._build();
      document.body.appendChild(this._el);
    }

    _apply({ code, temp }) {
      const wl = $.el('#weather-line');
      if (wl) wl.textContent = `Debug  ·  ${temp}°C  ·  ${Weather._WMO[code] ?? 'Unknown'}`;
      const tip   = Weather._tip(code, temp, 'celsius');
      const tipEl = $.el('#weather-tip');
      if (tipEl) { tipEl.textContent = tip || ''; tipEl.classList.toggle('visible', !!tip); }
      if (this._fx) this._fx.apply(code);
    }

    _build() {
      const wrap = document.createElement('div');
      wrap.style.cssText = 'position:fixed;top:50%;right:0;transform:translateY(-50%);z-index:50;display:flex;flex-direction:column;align-items:flex-end;gap:0.25rem;padding:0.5rem 0.5rem 0.5rem 0;background:rgba(255,40,80,0.08);border:1px solid rgba(255,40,80,0.2);border-right:none;border-radius:10px 0 0 10px;backdrop-filter:blur(12px)';

      const title = document.createElement('p');
      title.textContent = 'WEATHER DEBUG';
      title.style.cssText = 'margin:0 0 0.25rem;font-size:0.5rem;font-weight:700;letter-spacing:0.14em;color:rgba(255,80,120,0.7);padding:0 0.4rem;width:auto';
      wrap.appendChild(title);

      DebugWeather.SCENES.forEach((scene) => {
        const btn = document.createElement('button');
        btn.textContent = scene.label;
        btn.style.cssText = 'font-size:0.6rem;font-weight:700;padding:0.18rem 0.55rem;border-radius:100px 0 0 100px;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.12);border-right:none;color:var(--base-foreground);cursor:pointer;width:auto;text-align:right;transition:background 0.1s';
        btn.addEventListener('click', () => { this._apply(scene); btn.style.background = 'rgba(255,40,80,0.25)'; setTimeout(() => { btn.style.background = 'rgba(255,255,255,0.06)'; }, 600); });
        wrap.appendChild(btn);
      });

      return wrap;
    }
  }
  */

  /* ─── Onboarding ───────────────────────────────────────── */
  class Onboarding {
    constructor() {
      this._el = $.el('#onboarding');
      if (!this._el) return;
      this._build();
    }

    _build() {
      const card = document.createElement('div');
      card.className = 'onboarding-card';

      const title = document.createElement('p');
      title.className = 'onboarding-title';
      title.textContent = 'Welcome to TileSquare';

      const sub = document.createElement('p');
      sub.className = 'onboarding-sub';
      sub.textContent = "What should we call you?";

      const input = document.createElement('input');
      input.type = 'text';
      input.className = 'onboarding-input';
      input.placeholder = 'Your name…';
      input.autocomplete = 'given-name';
      input.spellcheck = false;
      input.maxLength = 40;

      const btn = document.createElement('button');
      btn.className = 'onboarding-btn';
      btn.textContent = "Let's go";

      const submit = () => {
        const name = input.value.trim();
        if (!name) { input.focus(); return; }
        Store.set('_ts_name', name);
        _userName = name;
        this._el.classList.remove('is-open');
      };

      btn.addEventListener('click', submit);
      input.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); });

      card.appendChild(title);
      card.appendChild(sub);
      card.appendChild(input);
      card.appendChild(btn);
      this._el.appendChild(card);
      requestAnimationFrame(() => input.focus());
    }
  }

  /* ─── bootstrap ────────────────────────────────────────── */

  $.bodyClassAdd(CONFIG.theme);

  const help = new Help({
    commands: CONFIG.commands,
    newTab:   CONFIG.queryNewTab,
  });

  const queryParser = new QueryParser({
    commands:       CONFIG.commands,
    pathDelimiter:  CONFIG.queryPathDelimiter,
    scripts:        CONFIG.scripts,
    searchDelimiter: CONFIG.querySearchDelimiter,
  });

  const influencers = CONFIG.suggestionInfluencers.map((cfg) => {
    const Klass = { Default: DefaultInfluencer, DuckDuckGo: DuckDuckGoInfluencer, History: HistoryInfluencer }[cfg.name];
    return new Klass({
      limit:             cfg.limit,
      minChars:          cfg.minChars ?? 0,
      suggestionDefaults: CONFIG.suggestionDefaults,
    });
  });

  const suggester = new Suggester({ influencers, limit: CONFIG.suggestionLimit });

  const form = new Form({
    helpKey:        CONFIG.helpKey,
    instantRedirect: CONFIG.queryInstantRedirect,
    newTab:         CONFIG.queryNewTab,
    parseQuery:     queryParser.parse,
    suggester,
    toggleHelp:     help.toggle,
  });

  const clock = new Clock({
    amPm:         CONFIG.clockShowAmPm,
    delimiter:    CONFIG.clockDelimiter,
    onClick:      CONFIG.clockOnClickAction === 'Search' ? form.show : () => help.toggle(),
    showSeconds:  CONFIG.clockShowSeconds,
    timeZone:     CONFIG.clockTimeZone,
    twentyFourHour: CONFIG.clockTwentyFourHour,
  });

  const weatherFX = new WeatherFX();
  new Weather({ unit: CONFIG.weatherUnit, fx: weatherFX });
  new Notes();
  new TodoWidget();
  new CalendarWidget();
  new JokeWidget();
  // new DebugWeather(weatherFX); /* DEBUG — uncomment with the class above */

  Store.get('_ts_name').then((name) => {
    if (name) {
      _userName = name;
    } else {
      const ob = $.el('#onboarding');
      if (ob) ob.classList.add('is-open');
      new Onboarding();
    }
  });
