(() => {
  const $ = (sel) => document.querySelector(sel);

  /** Homepage embed: screens live under #home-collage-app; standalone uses #app. */
  const scopeRoot =
    document.getElementById('home-collage-app') ||
    document.getElementById('app') ||
    document.body;
  const isEmbed = !!document.getElementById('home-collage-app');

  const apiBase = (() => {
    if (typeof window === 'undefined') return '';
    const w = window;
    if (w.HOME_REDDIT_PROXY) return String(w.HOME_REDDIT_PROXY).replace(/\/$/, '');
    if (w.REDDIT_SLIDESHOW_API_BASE)
      return String(w.REDDIT_SLIDESHOW_API_BASE).replace(/\/$/, '');
    return '';
  })();

  function lookupApiUrl(q) {
    const path = `/api/lookup?q=${encodeURIComponent(q)}`;
    return apiBase ? `${apiBase}${path}` : path;
  }

  /** ngrok free tier may interstitial API calls unless this header is sent. */
  function redditProxyFetch(url) {
    const headers = {};
    try {
      if (/ngrok(-free)?\.app|ngrok\.io/i.test(String(url))) {
        headers['ngrok-skip-browser-warning'] = 'true';
      }
    } catch (e) {
      /* ignore */
    }
    return fetch(url, Object.keys(headers).length ? { headers } : undefined);
  }

  /**
   * Avatar through this app’s server — Reddit’s CDN often blocks or flakes on cross-site <img> loads.
   */
  function profileAvatarProxySrc(resolvedUsername) {
    if (!resolvedUsername) return null;
    /* Embed is usually on another port/origin than the Node API — relative /api/avatar would 404. */
    if (isEmbed && !apiBase) return null;
    const path = `/api/avatar/${encodeURIComponent(resolvedUsername)}`;
    return apiBase ? `${apiBase}${path}` : path;
  }

  const searchScreen = $('#search-screen');
  const loadingScreen = $('#loading-screen');
  const slideshowScreen = $('#slideshow-screen');
  const searchForm = $('#search-form');
  const redditInput = $('#reddit-input');
  const errorMsg = $('#error-msg');
  const loadingText = $('#loading-text');

  const headerUsername = $('#header-username');
  const headerTotal = $('#header-total');
  const backBtn = $('#back-btn');
  const fullscreenBtn = $('#fullscreen-btn');
  const gridBtn = $('#grid-btn');
  const gridOverlay = $('#grid-overlay');
  const gridContainer = $('#grid-container');
  const gridTitle = $('#grid-title');
  const gridCloseBtn = $('#grid-close-btn');

  const sizeRange = $('#size-range');
  const sizeDisplay = $('#size-display');

  const collageStage = $('#collage-stage');

  const globalPlayBtn = $('#global-play-btn');
  const globalPlayIcon = $('#global-play-icon');
  const globalPauseIcon = $('#global-pause-icon');
  const globalSpeedMinRange = $('#global-speed-min-range');
  const globalSpeedMaxRange = $('#global-speed-max-range');
  const globalSpeedDisplay = $('#global-speed-display');
  const layersDisplay = $('#layers-display');
  const progressFill = $('#global-progress-fill');

  /** Homepage embed: tune in index.html via `window.HOME_COLLAGE_SETTINGS`. */
  function readEmbedSettings() {
    const defaults = {
      speedMinSec: 1,
      speedMaxSec: 5,
      mediaSizePercent: 110,
      autoPlay: true,
      /** If set, shown first (large fade-in, hold, fade-out). Overrides Reddit avatar intro. */
      introHeroImageUrl: '',
      showProfileIntro: true,
      /** Seconds the hero stays fully visible after fade-in (before fade-out). */
      profileIntroSeconds: 5,
      profileFadeInMs: 900,
      profileFadeOutMs: 550,
      /** If false, no 5‑min polling (fewer Reddit/proxy calls; homepage default). */
      backgroundMediaRefresh: false,
    };
    if (!isEmbed) return null;
    const fromWin =
      typeof window !== 'undefined' &&
      window.HOME_COLLAGE_SETTINGS &&
      typeof window.HOME_COLLAGE_SETTINGS === 'object'
        ? window.HOME_COLLAGE_SETTINGS
        : {};
    return { ...defaults, ...fromWin };
  }

  const embedCfg = readEmbedSettings();

  let embedSpeedMinS = 1;
  let embedSpeedMaxS = 5;
  let mediaScale = 1;

  if (embedCfg) {
    let minS = Number(embedCfg.speedMinSec);
    let maxS = Number(embedCfg.speedMaxSec);
    if (!Number.isFinite(minS)) minS = 1;
    if (!Number.isFinite(maxS)) maxS = 5;
    minS = Math.max(1, Math.min(30, minS));
    maxS = Math.max(1, Math.min(30, maxS));
    if (minS > maxS) {
      const t = minS;
      minS = maxS;
      maxS = t;
    }
    embedSpeedMinS = minS;
    embedSpeedMaxS = maxS;
    let pct = Math.round(Number(embedCfg.mediaSizePercent));
    if (!Number.isFinite(pct)) pct = 110;
    pct = Math.max(30, Math.min(150, pct));
    mediaScale = pct / 100;
    if (sizeRange) {
      sizeRange.value = String(pct);
      if (sizeDisplay) sizeDisplay.textContent = `${pct}%`;
    }
  } else {
    mediaScale = (parseInt(sizeRange?.value || '100', 10) || 100) / 100;
  }

  const MAX_TILES = 140;
  const SEED_TILES_MIN = 1;
  const SEED_TILES_MAX = 4;
  /** Extra penalty for overlapping the tile that was just placed (strongly avoids stacking on top). */
  const LAST_TILE_OVERLAP_WEIGHT = 22;
  /** Prevent overlap with the last N placed tiles. */
  const NO_OVERLAP_WITH_LAST_N_TILES = 5;
  /** Inflate protected tiles by this many pixels when checking “no overlap”. */
  const NO_OVERLAP_GAP_PX = 2;
  /** Don't remove tiles until we have a substantial stack (prevents quick popping). */
  const PRUNE_MIN_TILES = 70;
  const REFRESH_MEDIA_INTERVAL_MS = 5 * 60 * 1000;

  let isPlaying = false;
  let tickTimeout = null;
  let progressInterval = null;
  let lastTickStart = 0;

  let username = '';
  let mediaPool = [];
  /** @type {CollageTile[]} */
  let tiles = [];
  let aspectCache = new Map();
  let mediaCursor = 0;
  let zCounter = 0;
  /** Most recently placed tile — rect is read fresh when scoring so late image loads stay accurate. */
  let lastPlacedTile = null;
  /** FIFO of most recently placed tiles we should not overlap with. */
  let protectedTiles = [];

  // Periodic refresh: bring in newly posted media without clearing what’s already on screen.
  let lookupInput = '';
  let refreshTimer = null;
  let mediaSeenKeys = new Set();
  let newMediaQueue = [];

  function showScreen(screen) {
    if (!screen) return;
    scopeRoot.querySelectorAll('.screen').forEach((s) => s.classList.remove('active'));
    screen.classList.add('active');
  }

  function showError(msg) {
    if (errorMsg) {
      errorMsg.textContent = msg;
      errorMsg.classList.remove('hidden');
    }
    if (searchScreen) {
      showScreen(searchScreen);
    } else if (loadingScreen && loadingText) {
      loadingText.textContent = msg;
      showScreen(loadingScreen);
    }
  }

  function hideError() {
    if (errorMsg) errorMsg.classList.add('hidden');
  }

  function shuffle(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function clamp(n, min, max) {
    return Math.max(min, Math.min(max, n));
  }

  function rand(min, max) {
    return min + Math.random() * (max - min);
  }

  function randInt(min, maxInclusive) {
    return Math.floor(rand(min, maxInclusive + 1));
  }

  function updatePlayIcons() {
    if (isPlaying) {
      globalPauseIcon?.classList.remove('hidden');
      globalPlayIcon?.classList.add('hidden');
    } else {
      globalPauseIcon?.classList.add('hidden');
      globalPlayIcon?.classList.remove('hidden');
    }
  }

  function getSpeedRangeSeconds() {
    let minS;
    let maxS;
    if (embedCfg && (!globalSpeedMinRange || !globalSpeedMaxRange)) {
      minS = embedSpeedMinS;
      maxS = embedSpeedMaxS;
    } else {
      minS = parseInt(globalSpeedMinRange?.value, 10);
      maxS = parseInt(globalSpeedMaxRange?.value, 10);
    }
    if (!Number.isFinite(minS)) minS = 1;
    if (!Number.isFinite(maxS)) maxS = 10;
    minS = clamp(minS, 1, 30);
    maxS = clamp(maxS, 1, 30);
    if (minS > maxS) [minS, maxS] = [maxS, minS];
    return { minS, maxS };
  }

  function getRandomSpeedMs() {
    const { minS, maxS } = getSpeedRangeSeconds();
    const seconds = randInt(minS, maxS); // inclusive
    return seconds * 1000;
  }

  function updateSpeedDisplay() {
    const { minS, maxS } = getSpeedRangeSeconds();
    if (globalSpeedDisplay) globalSpeedDisplay.textContent = `${minS}s - ${maxS}s`;
  }

  function updateTilesDisplay() {
    if (layersDisplay) layersDisplay.textContent = `Tiles: ${tiles.length}`;
  }

  function getExistingRects(excludeTile) {
    const sr = collageStage.getBoundingClientRect();
    return tiles
      .filter((t) => t !== excludeTile && t.el.isConnected)
      .map((t) => {
        const r = t.el.getBoundingClientRect();
        return {
          x: r.left - sr.left,
          y: r.top - sr.top,
          w: r.width,
          h: r.height,
        };
      });
  }

  function rectIntersectionArea(a, b) {
    const x1 = Math.max(a.x, b.x);
    const y1 = Math.max(a.y, b.y);
    const x2 = Math.min(a.x + a.w, b.x + b.w);
    const y2 = Math.min(a.y + a.h, b.y + b.h);
    if (x2 <= x1 || y2 <= y1) return 0;
    return (x2 - x1) * (y2 - y1);
  }

  function inflateRect(r, m) {
    return { x: r.x - m, y: r.y - m, w: r.w + 2 * m, h: r.h + 2 * m };
  }

  /** Lower is better — prefers gaps between tiles (inflated by margin). */
  function overlapPenalty(candidate, others, margin) {
    const c = inflateRect(candidate, margin);
    let sum = 0;
    for (const o of others) {
      sum += rectIntersectionArea(c, inflateRect(o, margin));
    }
    return sum;
  }

  function rememberLastPlacement(tile) {
    if (tile?.el?.isConnected) {
      lastPlacedTile = tile;
      protectedTiles = protectedTiles.filter((t) => t?.el?.isConnected);
      protectedTiles.push(tile);
      if (protectedTiles.length > NO_OVERLAP_WITH_LAST_N_TILES) {
        protectedTiles = protectedTiles.slice(-NO_OVERLAP_WITH_LAST_N_TILES);
      }
    }
  }

  function getLastPlacedStageRect(excludeTile) {
    if (lastPlacedTile?.el?.isConnected && lastPlacedTile !== excludeTile) {
      const sr = collageStage.getBoundingClientRect();
      const r = lastPlacedTile.el.getBoundingClientRect();
      return {
        x: r.left - sr.left,
        y: r.top - sr.top,
        w: r.width,
        h: r.height,
      };
    }
    return null;
  }

  function getProtectedRects(excludeTile) {
    const sr = collageStage.getBoundingClientRect();
    return protectedTiles
      .filter((t) => t?.el?.isConnected && t !== excludeTile)
      .map((t) => {
        const r = t.el.getBoundingClientRect();
        return inflateRect(
          { x: r.left - sr.left, y: r.top - sr.top, w: r.width, h: r.height },
          NO_OVERLAP_GAP_PX
        );
      });
  }

  /**
   * Picks size/position with many random tries; chooses least overlap with existing tiles.
   * Slightly smaller typical area than before so pieces sit more side-by-side.
   */
  function computeTileLayout(aspect, excludeTile) {
    const rect = collageStage.getBoundingClientRect();
    const W = rect.width;
    const H = rect.height;
    if (W <= 10 || H <= 10) {
      return { x: 0, y: 0, w: 10, h: 10 };
    }

    const a = aspect > 0 ? aspect : 1;
    const others = getExistingRects(excludeTile);
    const protectedRects = getProtectedRects(excludeTile);
    const margin = Math.min(W, H) * 0.04;
    const attempts = 72;
    let best = null;
    let bestScore = Infinity;
    let bestFree = null;
    let bestFreeScore = Infinity;

    for (let i = 0; i < attempts; i++) {
      const areaFrac = rand(0.14, 0.52);
      let area = W * H * areaFrac;

      let h = Math.sqrt(area / a);
      let w = area / h;

      if (w > W * 0.92) {
        w = W * 0.92;
        h = w / a;
      }
      if (h > H * 0.92) {
        h = H * 0.92;
        w = h * a;
      }

      w *= mediaScale;
      h *= mediaScale;

      const minSide = Math.min(W, H);
      w = clamp(w, minSide * 0.16, W * 0.88);
      h = clamp(h, minSide * 0.16, H * 0.88);

      const x = rand(0, Math.max(0, W - w));
      const y = rand(0, Math.max(0, H - h));
      const candidate = { x, y, w, h };
      let score = overlapPenalty(candidate, others, margin);
      const lastRect = getLastPlacedStageRect(excludeTile);
      if (lastRect) {
        const c = inflateRect(candidate, margin);
        const lastBox = inflateRect(lastRect, margin * 2.75);
        score += LAST_TILE_OVERLAP_WEIGHT * rectIntersectionArea(c, lastBox);
      }

      // Hard constraint: avoid overlap with the last N placed tiles.
      let intersectsProtected = false;
      for (const p of protectedRects) {
        if (rectIntersectionArea(candidate, p) > 0) {
          intersectsProtected = true;
          break;
        }
      }

      if (intersectsProtected) {
        // Keep track of best overall as fallback if we can't find a valid spot.
        if (score < bestScore) {
          bestScore = score;
          best = candidate;
        }
        continue;
      }

      if (score < bestFreeScore) {
        bestFreeScore = score;
        bestFree = candidate;
      }
    }

    return bestFree || best || { x: 0, y: 0, w: W * 0.4, h: H * 0.4 };
  }

  class CollageTile {
    constructor() {
      this.el = document.createElement('div');
      this.el.className = 'collage-layer';
      this.z = ++zCounter;
      this.el.style.zIndex = String(this.z);

      this.videoEl = null;
      this.mediaEl = null;
      this.currentAspect = 1;
      this.currentLayout = { x: 0, y: 0, w: 10, h: 10 };
      this._spawning = false;

      collageStage.appendChild(this.el);
    }

    animateIn() {
      if (!this.mediaEl) return;

      // Randomized spawn: sometimes start in the middle, sometimes start larger.
      const MOVE_CHANCE = 0.6;
      const LARGE_CHANCE = 0.45;
      const durationMs = 2000 + Math.random() * 1000; // 2-3s

      const doMove = Math.random() < MOVE_CHANCE;
      const doLarge = Math.random() < LARGE_CHANCE;

      const startScale = doLarge ? rand(1.25, 2.05) : 1;
      const stageRect = collageStage.getBoundingClientRect();
      const stageCx = stageRect.width / 2;
      const stageCy = stageRect.height / 2;

      const finalCx = this.currentLayout.x + this.currentLayout.w / 2;
      const finalCy = this.currentLayout.y + this.currentLayout.h / 2;

      const dx = doMove ? stageCx - finalCx : 0;
      const dy = doMove ? stageCy - finalCy : 0;

      this._spawning = true;
      setTimeout(() => {
        this._spawning = false;
      }, durationMs + 50);

      // Ensure the layer starts fully hidden (opacity on .collage-layer).
      this.el.classList.remove('collage-layer--visible');

      // Snap to start pose without animating (avoid `transition: none` — it nukes all properties in some browsers).
      this.mediaEl.style.transition = 'transform 0s linear';
      this.mediaEl.style.transformOrigin = 'center center';
      this.mediaEl.style.transform = `translate(${dx}px, ${dy}px) scale(${startScale})`;
      void this.mediaEl.offsetWidth;

      // Two rAFs so layout + opacity transitions reliably commit before we animate in.
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          if (!this.mediaEl || !this.el.isConnected) return;
          this.mediaEl.style.transition = `transform ${durationMs}ms ease-out`;
          this.mediaEl.style.transform = 'translate(0px, 0px) scale(1)';
          this.el.classList.add('collage-layer--visible');
        });
      });
    }

    /** Wait until pixels exist (or timeout) so opacity fade isn’t “empty then pop”. */
    waitForMediaThenAnimateIn() {
      const run = () => {
        if (!this.el.isConnected) return;
        this.layout();
        this.animateIn();
      };

      if (this.videoEl) {
        const v = this.videoEl;
        if (v.readyState >= 2) {
          requestAnimationFrame(run);
          return;
        }
        const t = setTimeout(run, 8000);
        const done = () => {
          clearTimeout(t);
          run();
        };
        v.addEventListener('loadeddata', done, { once: true });
        v.addEventListener('error', done, { once: true });
        return;
      }

      const el = this.mediaEl;
      if (el && el.tagName === 'IMG') {
        if (el.complete && el.naturalWidth > 0) {
          requestAnimationFrame(run);
          return;
        }
        const t = setTimeout(run, 10000);
        const done = () => {
          clearTimeout(t);
          run();
        };
        el.addEventListener('load', done, { once: true });
        el.addEventListener('error', done, { once: true });
        return;
      }

      run();
    }

    destroy() {
      this.pause();
      this.el.remove();
    }

    pause() {
      if (this.videoEl) this.videoEl.pause();
    }

    play() {
      if (this.videoEl) {
        try {
          this.videoEl.play();
        } catch {
          // ignore
        }
      }
    }

    layout() {
      const layout = computeTileLayout(this.currentAspect, this);
      this.currentLayout = layout;
      this.el.style.left = `${layout.x}px`;
      this.el.style.top = `${layout.y}px`;
      this.el.style.width = `${layout.w}px`;
      this.el.style.height = `${layout.h}px`;
    }

    setMedia(item) {
      if (!item) return;

      const aspectFromCache = aspectCache.get(item.url);
      this.currentAspect = aspectFromCache || (item.type === 'video' ? 16 / 9 : 1);

      this.render(item);
      this.layout();
      this.waitForMediaThenAnimateIn();
    }

    render(item) {
      this.el.innerHTML = '';
      this.videoEl = null;

      if (item.type === 'video') {
        const video = document.createElement('video');
        video.className = 'video-el';
        video.src = item.url;
        video.controls = false;
        video.muted = true;
        video.loop = true;
        video.playsInline = true;
        video.preload = 'metadata';

        video.addEventListener(
          'loadedmetadata',
          () => {
            if (video.videoWidth && video.videoHeight) {
              const ar = video.videoWidth / video.videoHeight;
              if (ar > 0) aspectCache.set(item.url, ar);
              this.currentAspect = ar || this.currentAspect;
            }
            if (video.duration && video.duration > 1) {
              try {
                video.currentTime = Math.random() * video.duration;
              } catch {
                // ignore
              }
            }
            if (isPlaying) this.play();
          },
          { once: true }
        );

        video.onerror = () => {
          const fallback = document.createElement('div');
          fallback.style.cssText =
            'color:var(--text-muted);font-size:0.85rem;padding:12px;text-align:center;background:rgba(0,0,0,0.25);border-radius:6px;';
          fallback.textContent = 'Video failed to load';
          this.el.appendChild(fallback);
        };

        this.el.appendChild(video);
        this.videoEl = video;
        this.mediaEl = video;
      } else {
        const img = document.createElement('img');
        img.src = item.url;
        img.alt = item.title || '';
        img.loading = 'eager';
        img.onerror = () => {
          const fallback = document.createElement('div');
          fallback.style.cssText =
            'color:var(--text-muted);font-size:0.85rem;padding:12px;text-align:center;background:rgba(0,0,0,0.25);border-radius:6px;';
          fallback.textContent = 'Image failed to load';
          this.el.appendChild(fallback);
        };
        img.addEventListener('load', () => {
          if (img.naturalWidth && img.naturalHeight) {
            const ar = img.naturalWidth / img.naturalHeight;
            if (ar > 0) aspectCache.set(item.url, ar);
            this.currentAspect = ar || this.currentAspect;
          }
        });
        this.el.appendChild(img);
        this.mediaEl = img;
      }
    }
  }

  function destroyAllTiles() {
    document.getElementById('collage-profile-hero')?.remove();
    tiles.forEach((t) => t.destroy());
    tiles = [];
    zCounter = 0;
    lastPlacedTile = null;
    protectedTiles = [];
    updateTilesDisplay();
  }

  function pauseAllVideos() {
    tiles.forEach((t) => t.pause());
  }

  function playAllVideos() {
    tiles.forEach((t) => t.play());
  }

  function relayoutAllTiles() {
    tiles.forEach((t) => t.layout());
  }

  /** True if this tile’s collage-layer is the topmost media layer at the client point. */
  function pointShowsTile(clientX, clientY, tileEl) {
    const stack = document.elementsFromPoint(clientX, clientY);
    for (const el of stack) {
      const layer = el.closest && el.closest('.collage-layer');
      if (layer) return layer === tileEl;
    }
    return false;
  }

  /**
   * Remove tiles that are fully obscured by newer (higher z) tiles.
   * Uses several sample points inside each tile’s screen rect.
   */
  function pruneFullyCoveredTiles() {
    if (tiles.length < PRUNE_MIN_TILES) return;
    const stageRect = collageStage.getBoundingClientRect();
    const sorted = [...tiles].sort((a, b) => a.z - b.z);

    for (const tile of sorted) {
      if (!tile.el.isConnected) continue;
      if (tile._spawning) continue;
      const r = tile.el.getBoundingClientRect();
      if (r.width < 4 || r.height < 4) continue;

      let anyVisible = false;
      // More strict sampling: require that none of the sampled pixels are visible for this tile.
      const grid = 5; // 5x5 = 25 sample points
      const inset = 1; // include edges, but avoid exact border rounding
      for (let yi = 0; yi < grid && !anyVisible; yi++) {
        for (let xi = 0; xi < grid && !anyVisible; xi++) {
          const fx = grid === 1 ? 0.5 : xi / (grid - 1);
          const fy = grid === 1 ? 0.5 : yi / (grid - 1);
          const px = r.left + inset + fx * Math.max(0, r.width - 2 * inset);
          const py = r.top + inset + fy * Math.max(0, r.height - 2 * inset);
          if (px < stageRect.left || px > stageRect.right || py < stageRect.top || py > stageRect.bottom) continue;
          if (pointShowsTile(px, py, tile.el)) {
            anyVisible = true;
            break;
          }
        }
      }

      if (!anyVisible) {
        removeTile(tile);
      }
    }
  }

  function removeTile(tile) {
    const wasLast = lastPlacedTile === tile;
    tile.destroy();
    const idx = tiles.indexOf(tile);
    if (idx >= 0) tiles.splice(idx, 1);
    protectedTiles = protectedTiles.filter((t) => t !== tile);
    if (wasLast) {
      lastPlacedTile = tiles.length ? tiles.reduce((a, b) => (a.z > b.z ? a : b)) : null;
    }
    updateTilesDisplay();
  }

  /** Hard cap: drop oldest tiles if we exceed MAX_TILES */
  function enforceMaxTiles() {
    while (tiles.length > MAX_TILES) {
      const oldest = tiles.reduce((a, b) => (a.z < b.z ? a : b));
      removeTile(oldest);
    }
  }

  function addNextTile() {
    if (!mediaPool.length) return;
    let item;
    if (newMediaQueue.length > 0) {
      item = newMediaQueue.shift();
    } else {
      item = mediaPool[mediaCursor % mediaPool.length];
      mediaCursor++;
    }

    const tile = new CollageTile();
    tile.setMedia(item);
    tiles.push(tile);
    rememberLastPlacement(tile);
    updateTilesDisplay();
    enforceMaxTiles();
    pruneFullyCoveredTiles();
    enforceMaxTiles();
  }

  function seedTiles(count) {
    const n = clamp(count, SEED_TILES_MIN, SEED_TILES_MAX);
    for (let i = 0; i < n; i++) {
      if (!mediaPool.length) return;
      const item = mediaPool[mediaCursor % mediaPool.length];
      mediaCursor = (mediaCursor + 1) % mediaPool.length;
      const tile = new CollageTile();
      tile.setMedia(item);
      tiles.push(tile);
      rememberLastPlacement(tile);
    }
    updateTilesDisplay();
  }

  function tick() {
    if (!isPlaying || !mediaPool.length) return;
    addNextTile();
    if (isPlaying) scheduleLoop();
  }

  function scheduleLoop() {
    clearTimeout(tickTimeout);
    clearInterval(progressInterval);

    const speedMs = getRandomSpeedMs();
    lastTickStart = Date.now();

    progressInterval = setInterval(() => {
      const elapsed = Date.now() - lastTickStart;
      const pct = clamp((elapsed / speedMs) * 100, 0, 100);
      if (progressFill) progressFill.style.width = `${pct}%`;
    }, 50);

    tickTimeout = setTimeout(() => {
      if (progressFill) progressFill.style.width = '0%';
      tick();
    }, speedMs);
  }

  function play() {
    if (!mediaPool.length) return;
    isPlaying = true;
    updatePlayIcons();
    if (progressFill) progressFill.style.width = '0%';
    scheduleLoop();
    playAllVideos();
  }

  function pause() {
    isPlaying = false;
    updatePlayIcons();
    clearTimeout(tickTimeout);
    clearInterval(progressInterval);
    if (progressFill) progressFill.style.width = '0%';
    pauseAllVideos();
  }

  function togglePlay() {
    isPlaying ? pause() : play();
  }

  /**
   * Homepage embed: show Reddit avatar large and centered, fade in, hold, fade out, then collage runs.
   */
  function runProfileIntro(imageSrc) {
    const fadeInMs = Math.max(0, Number(embedCfg?.profileFadeInMs) || 900);
    const fadeOutMs = Math.max(0, Number(embedCfg?.profileFadeOutMs) || 550);
    const holdMs = Math.max(0, Number(embedCfg?.profileIntroSeconds) || 3) * 1000;

    return new Promise((resolve) => {
      if (!collageStage || !imageSrc) {
        resolve();
        return;
      }

      const wrap = document.createElement('div');
      wrap.id = 'collage-profile-hero';
      wrap.className = 'collage-profile-hero';
      wrap.style.setProperty('--profile-fade-in', `${fadeInMs}ms`);
      wrap.style.setProperty('--profile-fade-out', `${fadeOutMs}ms`);
      wrap.setAttribute('role', 'img');
      wrap.setAttribute(
        'aria-label',
        username ? `Opening image before collage for u/${username}` : 'Opening image before collage'
      );

      const img = document.createElement('img');
      img.alt = '';
      img.decoding = 'async';
      img.referrerPolicy = 'no-referrer';
      img.src = imageSrc;

      let finished = false;
      let sequenceStarted = false;

      const cleanup = () => {
        if (finished) return;
        finished = true;
        wrap.remove();
        resolve();
      };

      const startSequence = () => {
        if (sequenceStarted) return;
        sequenceStarted = true;
        requestAnimationFrame(() => {
          wrap.classList.add('collage-profile-hero--visible');
        });
        setTimeout(() => {
          wrap.classList.remove('collage-profile-hero--visible');
          wrap.classList.add('collage-profile-hero--exit');
          setTimeout(cleanup, fadeOutMs);
        }, fadeInMs + holdMs);
      };

      img.onload = () => startSequence();
      img.onerror = () => cleanup();

      wrap.appendChild(img);
      collageStage.appendChild(wrap);

      if (img.complete && img.naturalWidth > 0) {
        startSequence();
      }

      setTimeout(() => {
        if (!finished && !sequenceStarted) {
          cleanup();
        }
      }, 12000);
    });
  }

  async function fetchMedia(input) {
    hideError();
    showScreen(loadingScreen);
    if (loadingText) loadingText.textContent = 'Fetching media...';

    try {
      // Set up refresh state for this lookup.
      lookupInput = input;
      if (refreshTimer) clearInterval(refreshTimer);
      refreshTimer = null;
      newMediaQueue = [];
      mediaSeenKeys = new Set();

      const res = await redditProxyFetch(lookupApiUrl(input));
      const data = await res.json();

      if (!res.ok) throw new Error(data.error || 'Something went wrong');
      if (!data.media || data.media.length === 0) {
        if (searchScreen) showScreen(searchScreen);
        else if (loadingScreen) showScreen(loadingScreen);
        showError('No media found for this user.');
        return;
      }

      username = data.username;
      mediaPool = shuffle(data.media);
      mediaCursor = 0;
      zCounter = 0;

      showScreen(slideshowScreen);
      if (headerUsername) headerUsername.textContent = `u/${username}`;
      if (headerTotal) headerTotal.textContent = `${mediaPool.length} items`;

      destroyAllTiles();

      const heroUrlRaw =
        embedCfg && embedCfg.introHeroImageUrl != null
          ? String(embedCfg.introHeroImageUrl).trim()
          : '';
      const heroIntroSrc = heroUrlRaw && isEmbed ? heroUrlRaw : null;

      const wantAvatarIntro =
        !heroIntroSrc &&
        isEmbed &&
        embedCfg &&
        embedCfg.showProfileIntro !== false &&
        Boolean(username);

      const avatarIntroSrc = wantAvatarIntro ? profileAvatarProxySrc(username) : null;

      const introSrc = heroIntroSrc || avatarIntroSrc;
      if (introSrc) {
        await runProfileIntro(introSrc);
      }

      seedTiles(randInt(SEED_TILES_MIN, SEED_TILES_MAX));

      mediaSeenKeys = new Set(mediaPool.map((m) => `${m.type}|${m.url}`));

      // Standalone app: poll Reddit every 5 min for new posts. Homepage embed: off by default
      // (saves proxy + Reddit traffic; does NOT remove the need for a proxy — browsers can’t call Reddit directly).
      const enableBackgroundRefresh =
        !isEmbed || (embedCfg && embedCfg.backgroundMediaRefresh === true);
      if (enableBackgroundRefresh) {
        refreshTimer = setInterval(() => {
          refreshMediaSource();
        }, REFRESH_MEDIA_INTERVAL_MS);
      }

      if (isEmbed) {
        if (embedCfg && embedCfg.autoPlay === false) pause();
        else play();
      } else {
        pause();
      }
    } catch (err) {
      if (searchScreen) showScreen(searchScreen);
      else if (loadingScreen) showScreen(loadingScreen);
      showError(err.message);
    }
  }

  async function refreshMediaSource() {
    if (!lookupInput) return;
    try {
      const res = await redditProxyFetch(lookupApiUrl(lookupInput));
      const data = await res.json();
      if (!res.ok) return;
      if (!data.media || data.media.length === 0) return;

      username = data.username || username;

      let added = 0;
      for (const item of data.media) {
        const key = `${item.type}|${item.url}`;
        if (mediaSeenKeys.has(key)) continue;
        mediaSeenKeys.add(key);
        mediaPool.push(item);
        newMediaQueue.push(item);
        added++;
      }

      if (added > 0) {
        if (headerUsername) headerUsername.textContent = `u/${username}`;
        if (headerTotal) headerTotal.textContent = `${mediaPool.length} items`;
      }
    } catch {
      // ignore refresh failures
    }
  }

  function showGrid() {
    pause();
    if (gridTitle) gridTitle.textContent = `u/${username} — ${mediaPool.length} items`;
    if (!gridContainer || !gridOverlay) return;
    gridContainer.innerHTML = '';

    mediaPool.forEach((item, i) => {
      const thumb = document.createElement('div');
      thumb.className = 'grid-thumb';

      const img = document.createElement('img');
      img.loading = 'lazy';

      if (item.type === 'video') {
        img.src = item.url.replace(/DASH_\d+\.mp4/, 'DASH_96.jpg').replace(/\?.*$/, '');
        img.onerror = () => {
          img.src = 'https://via.placeholder.com/200x200/1c1c26/8888a0?text=Video';
        };
        const badge = document.createElement('span');
        badge.className = 'video-badge';
        badge.textContent = 'VIDEO';
        thumb.appendChild(badge);
      } else {
        img.src = item.url;
        img.onerror = () => {
          img.src = 'https://via.placeholder.com/200x200/1c1c26/8888a0?text=No+Preview';
        };
      }

      thumb.appendChild(img);
      thumb.addEventListener('click', () => {
        gridOverlay.classList.add('hidden');
        destroyAllTiles();
        mediaCursor = i;
        seedTiles(randInt(SEED_TILES_MIN, SEED_TILES_MAX));
        if (isPlaying) {
          playAllVideos();
          scheduleLoop();
        }
      });

      gridContainer.appendChild(thumb);
    });

    gridOverlay.classList.remove('hidden');
  }

  function toggleFullscreen() {
    if (document.fullscreenElement) document.exitFullscreen();
    else document.documentElement.requestFullscreen();
  }

  if (searchForm && redditInput) {
    searchForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const val = redditInput.value.trim();
      if (!val) return;
      fetchMedia(val);
    });
  }

  if (backBtn) {
    backBtn.addEventListener('click', () => {
      pause();
      destroyAllTiles();
      if (refreshTimer) clearInterval(refreshTimer);
      refreshTimer = null;
      lookupInput = '';
      newMediaQueue = [];
      mediaSeenKeys = new Set();
      if (searchScreen) showScreen(searchScreen);
      redditInput?.focus();
    });
  }

  fullscreenBtn?.addEventListener('click', toggleFullscreen);
  gridBtn?.addEventListener('click', showGrid);
  gridCloseBtn?.addEventListener('click', () => gridOverlay?.classList.add('hidden'));

  globalPlayBtn?.addEventListener('click', togglePlay);

  function onSpeedRangeInput() {
    updateSpeedDisplay();
    if (isPlaying) scheduleLoop();
  }

  globalSpeedMinRange?.addEventListener('input', onSpeedRangeInput);
  globalSpeedMaxRange?.addEventListener('input', onSpeedRangeInput);
  updateSpeedDisplay();

  function applySize(val) {
    const pct = parseInt(val, 10);
    if (Number.isFinite(pct)) mediaScale = clamp(pct, 30, 150) / 100;
    if (sizeDisplay) sizeDisplay.textContent = `${pct}%`;
    relayoutAllTiles();
  }

  if (sizeRange) {
    applySize(sizeRange.value);
    sizeRange.addEventListener('input', () => applySize(sizeRange.value));
  }

  window.addEventListener('resize', () => {
    if (!tiles.length) return;
    relayoutAllTiles();
    pruneFullyCoveredTiles();
  });

  document.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
    if (!slideshowScreen?.classList.contains('active')) return;

    switch (e.key) {
      case ' ':
        e.preventDefault();
        togglePlay();
        break;
      case 'f':
        toggleFullscreen();
        break;
      case 'g':
        showGrid();
        break;
      case 'Escape':
        if (gridOverlay && !gridOverlay.classList.contains('hidden')) {
          gridOverlay.classList.add('hidden');
        }
        break;
    }
  });

  if (isEmbed && typeof window !== 'undefined' && window.HOME_REDDIT_USER) {
    fetchMedia(String(window.HOME_REDDIT_USER).trim());
  } else {
    redditInput?.focus();
  }
})();
