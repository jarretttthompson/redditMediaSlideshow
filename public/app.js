(() => {
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => document.querySelectorAll(sel);

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
  const panelsContainer = $('#panels-container');
  const sizeRange = $('#size-range');
  const sizeDisplay = $('#size-display');

  const NUM_PANELS = 3;
  let allMedia = [];
  let username = '';
  let panels = [];

  function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  function showScreen(screen) {
    $$('.screen').forEach((s) => s.classList.remove('active'));
    screen.classList.add('active');
  }

  function showError(msg) {
    errorMsg.textContent = msg;
    errorMsg.classList.remove('hidden');
  }

  function hideError() {
    errorMsg.classList.add('hidden');
  }

  // ─── Panel Class ───

  class SlideshowPanel {
    constructor(index, container) {
      this.index = index;
      this.mediaItems = [];
      this.currentIndex = 0;
      this.isPlaying = false;
      this.playTimer = null;
      this.progressTimer = null;
      this.build(container);
    }

    build(container) {
      this.el = document.createElement('div');
      this.el.className = 'panel';

      // Stage
      this.stage = document.createElement('div');
      this.stage.className = 'panel-stage';

      this.mediaContainer = document.createElement('div');
      this.mediaContainer.className = 'media-container';

      this.titleEl = document.createElement('div');
      this.titleEl.className = 'panel-title';

      this.counterEl = document.createElement('div');
      this.counterEl.className = 'panel-counter';

      this.linkEl = document.createElement('a');
      this.linkEl.className = 'panel-link';
      this.linkEl.target = '_blank';
      this.linkEl.rel = 'noopener';
      this.linkEl.title = 'View on Reddit';
      this.linkEl.innerHTML = `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>`;

      this.stage.appendChild(this.mediaContainer);
      this.stage.appendChild(this.titleEl);
      this.stage.appendChild(this.counterEl);
      this.stage.appendChild(this.linkEl);

      // Controls
      this.controls = document.createElement('div');
      this.controls.className = 'panel-controls';

      this.prevBtn = this.makeBtn('ctrl-btn', `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>`);
      this.playBtnEl = this.makeBtn('ctrl-btn play-btn', '');
      this.nextBtn = this.makeBtn('ctrl-btn', `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>`);

      this.playIconSvg = `<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><polygon points="6,3 20,12 6,21"/></svg>`;
      this.pauseIconSvg = `<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><rect x="5" y="3" width="4" height="18"/><rect x="15" y="3" width="4" height="18"/></svg>`;
      this.playBtnEl.innerHTML = this.playIconSvg;

      const speedWrap = document.createElement('div');
      speedWrap.className = 'speed-control';
      const speedLabel = document.createElement('label');
      speedLabel.textContent = 'Spd';
      this.speedRange = document.createElement('input');
      this.speedRange.type = 'range';
      this.speedRange.min = '1';
      this.speedRange.max = '10';
      this.speedRange.value = '4';
      this.speedDisplayEl = document.createElement('span');
      this.speedDisplayEl.className = 'speed-display';
      this.speedDisplayEl.textContent = '4s';
      speedWrap.appendChild(speedLabel);
      speedWrap.appendChild(this.speedRange);
      speedWrap.appendChild(this.speedDisplayEl);

      this.controls.appendChild(this.prevBtn);
      this.controls.appendChild(this.playBtnEl);
      this.controls.appendChild(this.nextBtn);
      this.controls.appendChild(speedWrap);

      // Progress bar
      this.progressBar = document.createElement('div');
      this.progressBar.className = 'panel-progress';
      this.progressFill = document.createElement('div');
      this.progressFill.className = 'panel-progress-fill';
      this.progressBar.appendChild(this.progressFill);

      this.el.appendChild(this.stage);
      this.el.appendChild(this.controls);
      this.el.appendChild(this.progressBar);
      container.appendChild(this.el);

      this.bindEvents();
    }

    makeBtn(cls, html) {
      const btn = document.createElement('button');
      btn.className = cls;
      btn.innerHTML = html;
      return btn;
    }

    bindEvents() {
      this.prevBtn.addEventListener('click', () => this.goPrev());
      this.nextBtn.addEventListener('click', () => this.goNext());
      this.playBtnEl.addEventListener('click', () => this.togglePlay());
      this.speedRange.addEventListener('input', () => {
        this.speedDisplayEl.textContent = `${this.speedRange.value}s`;
        if (this.isPlaying) this.resetPlayTimer();
      });
    }

    setMedia(media) {
      this.mediaItems = shuffle([...media]);
      this.currentIndex = 0;
      this.updateSlide();
    }

    getSpeed() {
      return parseInt(this.speedRange.value, 10);
    }

    updateSlide() {
      if (this.mediaItems.length === 0) return;

      const item = this.mediaItems[this.currentIndex];
      this.counterEl.textContent = `${this.currentIndex + 1} / ${this.mediaItems.length}`;
      this.linkEl.href = item.permalink;

      this.mediaContainer.innerHTML = '';

      if (item.type === 'video') {
        const video = document.createElement('video');
        video.src = item.url;
        video.controls = true;
        video.autoplay = true;
        video.muted = true;
        video.loop = true;
        video.playsInline = true;
        video.addEventListener('loadedmetadata', () => {
          if (video.duration && video.duration > 1) {
            video.currentTime = Math.random() * video.duration;
          }
        }, { once: true });
        this.mediaContainer.appendChild(video);
      } else {
        const img = document.createElement('img');
        img.src = item.url;
        img.alt = item.title || '';
        img.loading = 'eager';
        img.onerror = () => {
          img.style.display = 'none';
          const fallback = document.createElement('div');
          fallback.style.cssText = 'color:var(--text-muted);padding:20px;text-align:center;font-size:0.8rem;';
          fallback.textContent = 'Image failed to load';
          this.mediaContainer.appendChild(fallback);
        };
        this.mediaContainer.appendChild(img);
      }

      this.titleEl.textContent = item.title || '';
      this.titleEl.classList.add('visible');
      clearTimeout(this._hideTimeout);
      this._hideTimeout = setTimeout(() => {
        this.titleEl.classList.remove('visible');
      }, 2500);

      if (!this.isPlaying) {
        this.progressFill.style.width = '0%';
      }

      this.preloadNeighbors();
    }

    preloadNeighbors() {
      for (let offset = 1; offset <= 2; offset++) {
        const idx = (this.currentIndex + offset) % this.mediaItems.length;
        const item = this.mediaItems[idx];
        if (item.type === 'image') {
          const img = new Image();
          img.src = item.url;
        }
      }
    }

    goNext() {
      this.currentIndex++;
      if (this.currentIndex >= this.mediaItems.length) {
        shuffle(this.mediaItems);
        this.currentIndex = 0;
      }
      this.updateSlide();
      if (this.isPlaying) this.resetPlayTimer();
    }

    goPrev() {
      this.currentIndex = (this.currentIndex - 1 + this.mediaItems.length) % this.mediaItems.length;
      this.updateSlide();
      if (this.isPlaying) this.resetPlayTimer();
    }

    play() {
      this.isPlaying = true;
      this.playBtnEl.innerHTML = this.pauseIconSvg;
      this.resetPlayTimer();
    }

    pause() {
      this.isPlaying = false;
      this.playBtnEl.innerHTML = this.playIconSvg;
      clearTimeout(this.playTimer);
      clearInterval(this.progressTimer);
      this.progressFill.style.width = '0%';
    }

    togglePlay() {
      this.isPlaying ? this.pause() : this.play();
    }

    resetPlayTimer() {
      clearTimeout(this.playTimer);
      clearInterval(this.progressTimer);

      const speed = this.getSpeed() * 1000;
      const startTime = Date.now();

      this.progressTimer = setInterval(() => {
        const elapsed = Date.now() - startTime;
        const pct = Math.min((elapsed / speed) * 100, 100);
        this.progressFill.style.width = `${pct}%`;
      }, 50);

      this.playTimer = setTimeout(() => {
        clearInterval(this.progressTimer);
        this.progressFill.style.width = '0%';
        this.goNext();
      }, speed);
    }

    destroy() {
      this.pause();
      this.el.remove();
    }
  }

  // ─── App Logic ───

  async function fetchMedia(input) {
    hideError();
    showScreen(loadingScreen);
    loadingText.textContent = 'Fetching media...';

    try {
      const res = await fetch(`/api/lookup?q=${encodeURIComponent(input)}`);
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Something went wrong');
      }

      if (data.count === 0) {
        showScreen(searchScreen);
        showError('No media found for this user.');
        return;
      }

      allMedia = data.media;
      username = data.username;
      startSlideshows();
    } catch (err) {
      showScreen(searchScreen);
      showError(err.message);
    }
  }

  function startSlideshows() {
    panels.forEach((p) => p.destroy());
    panels = [];
    panelsContainer.innerHTML = '';

    showScreen(slideshowScreen);
    headerUsername.textContent = `u/${username}`;
    headerTotal.textContent = `${allMedia.length} items`;

    for (let i = 0; i < NUM_PANELS; i++) {
      const panel = new SlideshowPanel(i, panelsContainer);
      panel.setMedia(allMedia);
      panels.push(panel);
    }
  }

  function showGrid() {
    panels.forEach((p) => p.pause());
    gridTitle.textContent = `u/${username} — ${allMedia.length} items`;
    gridContainer.innerHTML = '';

    allMedia.forEach((item, i) => {
      const thumb = document.createElement('div');
      thumb.className = 'grid-thumb';
      thumb.addEventListener('click', () => {
        gridOverlay.classList.add('hidden');
      });

      const img = document.createElement('img');
      img.loading = 'lazy';
      if (item.type === 'video') {
        img.src = item.url.replace(/DASH_\d+\.mp4/, 'DASH_96.jpg').replace(/\?.*$/, '');
        img.onerror = () => {
          img.src = `https://via.placeholder.com/200x200/1c1c26/8888a0?text=Video`;
        };
        const badge = document.createElement('span');
        badge.className = 'video-badge';
        badge.textContent = 'VIDEO';
        thumb.appendChild(badge);
      } else {
        img.src = item.url;
        img.onerror = () => {
          img.src = `https://via.placeholder.com/200x200/1c1c26/8888a0?text=No+Preview`;
        };
      }

      thumb.appendChild(img);
      gridContainer.appendChild(thumb);
    });

    gridOverlay.classList.remove('hidden');
  }

  function toggleFullscreen() {
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      document.documentElement.requestFullscreen();
    }
  }

  // Event listeners
  searchForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const val = redditInput.value.trim();
    if (!val) return;
    fetchMedia(val);
  });

  backBtn.addEventListener('click', () => {
    panels.forEach((p) => p.pause());
    showScreen(searchScreen);
    redditInput.focus();
  });

  fullscreenBtn.addEventListener('click', toggleFullscreen);
  gridBtn.addEventListener('click', showGrid);
  gridCloseBtn.addEventListener('click', () => gridOverlay.classList.add('hidden'));

  function applySize(val) {
    document.documentElement.style.setProperty('--media-scale', `${val}%`);
    sizeDisplay.textContent = `${val}%`;
  }
  applySize(sizeRange.value);
  sizeRange.addEventListener('input', () => applySize(sizeRange.value));

  document.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT') return;
    if (!slideshowScreen.classList.contains('active')) return;

    switch (e.key) {
      case ' ':
        e.preventDefault();
        panels.forEach((p) => p.togglePlay());
        break;
      case 'f':
        toggleFullscreen();
        break;
      case 'g':
        showGrid();
        break;
      case 'Escape':
        if (!gridOverlay.classList.contains('hidden')) {
          gridOverlay.classList.add('hidden');
        }
        break;
    }
  });

  redditInput.focus();
})();
