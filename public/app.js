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
  const mediaContainer = $('#media-container');
  const slideTitle = $('#slide-title');
  const headerUsername = $('#header-username');
  const headerCounter = $('#header-counter');
  const redditLink = $('#reddit-link');
  const prevBtn = $('#prev-btn');
  const nextBtn = $('#next-btn');
  const playBtn = $('#play-btn');
  const playIcon = $('#play-icon');
  const pauseIcon = $('#pause-icon');
  const speedRange = $('#speed-range');
  const speedDisplay = $('#speed-display');
  const progressFill = $('#progress-fill');
  const backBtn = $('#back-btn');
  const fullscreenBtn = $('#fullscreen-btn');
  const gridBtn = $('#grid-btn');
  const gridOverlay = $('#grid-overlay');
  const gridContainer = $('#grid-container');
  const gridTitle = $('#grid-title');
  const gridCloseBtn = $('#grid-close-btn');

  let mediaItems = [];
  let currentIndex = 0;
  let isPlaying = false;
  let playTimer = null;
  let progressTimer = null;
  let username = '';

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

  function getSpeed() {
    return parseInt(speedRange.value, 10);
  }

  // Fetch media from backend
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

      mediaItems = data.media;
      username = data.username;
      currentIndex = 0;
      startSlideshow();
    } catch (err) {
      showScreen(searchScreen);
      showError(err.message);
    }
  }

  function startSlideshow() {
    showScreen(slideshowScreen);
    headerUsername.textContent = `u/${username}`;
    updateSlide();
  }

  function updateSlide() {
    if (mediaItems.length === 0) return;

    const item = mediaItems[currentIndex];
    headerCounter.textContent = `${currentIndex + 1} / ${mediaItems.length}`;
    redditLink.href = item.permalink;

    mediaContainer.innerHTML = '';

    if (item.type === 'video') {
      const video = document.createElement('video');
      video.src = item.url;
      video.controls = true;
      video.autoplay = true;
      video.muted = true;
      video.loop = true;
      video.playsInline = true;
      mediaContainer.appendChild(video);
    } else {
      const img = document.createElement('img');
      img.src = item.url;
      img.alt = item.title || '';
      img.loading = 'eager';
      img.onerror = () => {
        img.style.display = 'none';
        const fallback = document.createElement('div');
        fallback.style.cssText = 'color:var(--text-muted);padding:40px;text-align:center;';
        fallback.textContent = 'Image failed to load';
        mediaContainer.appendChild(fallback);
      };
      mediaContainer.appendChild(img);
    }

    slideTitle.textContent = item.title || '';
    slideTitle.classList.add('visible');
    clearTimeout(slideTitle._hideTimeout);
    slideTitle._hideTimeout = setTimeout(() => {
      slideTitle.classList.remove('visible');
    }, 2500);

    updateProgress();
    preloadNeighbors();
  }

  function preloadNeighbors() {
    for (let offset = 1; offset <= 2; offset++) {
      const idx = (currentIndex + offset) % mediaItems.length;
      const item = mediaItems[idx];
      if (item.type === 'image') {
        const img = new Image();
        img.src = item.url;
      }
    }
  }

  function goNext() {
    currentIndex = (currentIndex + 1) % mediaItems.length;
    updateSlide();
    if (isPlaying) resetPlayTimer();
  }

  function goPrev() {
    currentIndex = (currentIndex - 1 + mediaItems.length) % mediaItems.length;
    updateSlide();
    if (isPlaying) resetPlayTimer();
  }

  function play() {
    isPlaying = true;
    playIcon.classList.add('hidden');
    pauseIcon.classList.remove('hidden');
    resetPlayTimer();
  }

  function pause() {
    isPlaying = false;
    playIcon.classList.remove('hidden');
    pauseIcon.classList.add('hidden');
    clearInterval(playTimer);
    clearInterval(progressTimer);
    progressFill.style.width = '0%';
  }

  function togglePlay() {
    isPlaying ? pause() : play();
  }

  function resetPlayTimer() {
    clearInterval(playTimer);
    clearInterval(progressTimer);

    const speed = getSpeed() * 1000;
    const startTime = Date.now();

    progressTimer = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const pct = Math.min((elapsed / speed) * 100, 100);
      progressFill.style.width = `${pct}%`;
    }, 50);

    playTimer = setTimeout(() => {
      clearInterval(progressTimer);
      progressFill.style.width = '0%';
      goNext();
    }, speed);
  }

  function updateProgress() {
    if (!isPlaying) {
      progressFill.style.width = '0%';
    }
  }

  function goToSlide(index) {
    currentIndex = index;
    updateSlide();
    gridOverlay.classList.add('hidden');
    if (isPlaying) resetPlayTimer();
  }

  function showGrid() {
    pause();
    gridTitle.textContent = `u/${username} — ${mediaItems.length} items`;
    gridContainer.innerHTML = '';

    mediaItems.forEach((item, i) => {
      const thumb = document.createElement('div');
      thumb.className = 'grid-thumb';
      thumb.addEventListener('click', () => goToSlide(i));

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

  prevBtn.addEventListener('click', goPrev);
  nextBtn.addEventListener('click', goNext);
  playBtn.addEventListener('click', togglePlay);
  backBtn.addEventListener('click', () => {
    pause();
    showScreen(searchScreen);
    redditInput.focus();
  });
  fullscreenBtn.addEventListener('click', toggleFullscreen);
  gridBtn.addEventListener('click', showGrid);
  gridCloseBtn.addEventListener('click', () => gridOverlay.classList.add('hidden'));

  speedRange.addEventListener('input', () => {
    speedDisplay.textContent = `${speedRange.value}s`;
    if (isPlaying) resetPlayTimer();
  });

  document.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT') return;
    if (!slideshowScreen.classList.contains('active')) return;

    switch (e.key) {
      case 'ArrowRight':
      case 'l':
        goNext();
        break;
      case 'ArrowLeft':
      case 'h':
        goPrev();
        break;
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
        if (!gridOverlay.classList.contains('hidden')) {
          gridOverlay.classList.add('hidden');
        }
        break;
    }
  });

  redditInput.focus();
})();

