const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

const cache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

app.use(express.static(path.join(__dirname, 'public')));
/** Collage bundle linked from the site’s Projects page — same origin as /api/lookup */
app.use(
  '/projects/reddit-media-collage',
  express.static(path.join(__dirname, 'website', 'projects', 'reddit-media-collage'))
);
app.use(express.json());
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'Content-Type, ngrok-skip-browser-warning'
  );
  if (req.method === 'OPTIONS') {
    return res.sendStatus(204);
  }
  next();
});

function normalizeRedditImageUrl(url) {
  if (!url || typeof url !== 'string') return url;
  try {
    const u = new URL(url);
    if (u.hostname === 'preview.redd.it') {
      return `https://i.redd.it${u.pathname}`;
    }
    return url;
  } catch {
    return url;
  }
}

function extractUsername(input) {
  input = input.trim();
  // Handle full URLs like https://www.reddit.com/user/username/ or /u/username
  const urlMatch = input.match(/(?:reddit\.com)?\/u(?:ser)?\/([A-Za-z0-9_-]+)/);
  if (urlMatch) return urlMatch[1];
  // Handle bare usernames (with or without u/ prefix)
  const bareMatch = input.match(/^u\/([A-Za-z0-9_-]+)$/);
  if (bareMatch) return bareMatch[1];
  // Assume it's just a username
  if (/^[A-Za-z0-9_-]+$/.test(input)) return input;
  return null;
}

function absolutizeUrl(u) {
  if (!u || typeof u !== 'string') return u;
  const t = u.trim();
  if (!t) return '';
  if (t.startsWith('//')) return `https:${t}`;
  return t;
}

function pickProfileImageUrlFromAboutData(d) {
  if (!d) return null;
  const candidates = [
    d.snoovatar_img,
    d.icon_img,
    d.subreddit && d.subreddit.icon_img,
  ];
  for (const c of candidates) {
    const s = c != null ? String(c).trim() : '';
    if (!s) continue;
    const decoded = s.replace(/&amp;/g, '&');
    const abs = absolutizeUrl(decoded);
    if (abs) return normalizeRedditImageUrl(abs) || abs;
  }
  return null;
}

async function fetchUserProfileImageUrl(username) {
  try {
    const url = `https://www.reddit.com/user/${encodeURIComponent(username)}/about.json?raw_json=1`;
    const response = await fetch(url, {
      headers: { 'User-Agent': 'RedditSlideshow/1.0' },
    });
    if (!response.ok) return null;
    const json = await response.json();
    return pickProfileImageUrlFromAboutData(json?.data);
  } catch {
    return null;
  }
}

function extractMediaFromPost(post) {
  const data = post.data;
  const media = [];

  if (data.is_self) return media;

  // Reddit-hosted images (i.redd.it)
  if (data.url && /i\.redd\.it/.test(data.url)) {
    media.push({ type: 'image', url: data.url, title: data.title, permalink: `https://reddit.com${data.permalink}` });
    return media;
  }

  // Imgur direct images
  if (data.url && /i\.imgur\.com/.test(data.url)) {
    media.push({ type: 'image', url: data.url, title: data.title, permalink: `https://reddit.com${data.permalink}` });
    return media;
  }

  // Reddit galleries
  if (data.is_gallery && data.media_metadata) {
    for (const [id, meta] of Object.entries(data.media_metadata)) {
      if (meta.status !== 'valid') continue;
      let url;
      if (meta.s && meta.s.u) {
        url = meta.s.u.replace(/&amp;/g, '&');
      } else if (meta.s && meta.s.gif) {
        url = meta.s.gif.replace(/&amp;/g, '&');
      }
      if (url) {
        media.push({ type: 'image', url, title: data.title, permalink: `https://reddit.com${data.permalink}` });
      }
    }
    return media;
  }

  // Reddit-hosted video
  if (data.is_video && data.media && data.media.reddit_video) {
    media.push({
      type: 'video',
      url: data.media.reddit_video.fallback_url,
      title: data.title,
      permalink: `https://reddit.com${data.permalink}`,
    });
    return media;
  }

  // Preview images as fallback
  if (data.preview && data.preview.images && data.preview.images.length > 0) {
    const source = data.preview.images[0].source;
    if (source && source.url) {
      media.push({
        type: 'image',
        url: source.url.replace(/&amp;/g, '&'),
        title: data.title,
        permalink: `https://reddit.com${data.permalink}`,
      });
    }
    return media;
  }

  // Direct image URLs ending in known extensions
  if (data.url && /\.(jpg|jpeg|png|gif|webp)(\?.*)?$/i.test(data.url)) {
    media.push({ type: 'image', url: data.url, title: data.title, permalink: `https://reddit.com${data.permalink}` });
  }

  return media;
}

async function fetchUserMedia(username, limit = 500) {
  const cacheKey = `${username.toLowerCase()}:v2`;
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.data;
  }

  const profileImageUrlPromise = fetchUserProfileImageUrl(username);

  const allMedia = [];
  let after = null;
  let fetched = 0;
  const maxPages = Math.ceil(limit / 100);

  for (let page = 0; page < maxPages; page++) {
    const url = `https://www.reddit.com/user/${encodeURIComponent(username)}/submitted.json?limit=100&raw_json=1${after ? `&after=${after}` : ''}`;

    const response = await fetch(url, {
      headers: { 'User-Agent': 'RedditSlideshow/1.0' },
    });

    if (response.status === 404) {
      throw new Error('User not found');
    }
    if (response.status === 403) {
      throw new Error('Profile is private or suspended');
    }
    if (!response.ok) {
      throw new Error(`Reddit API error: ${response.status}`);
    }

    const json = await response.json();
    if (!json.data || !json.data.children) break;

    for (const post of json.data.children) {
      const media = extractMediaFromPost(post);
      allMedia.push(...media);
    }

    fetched += json.data.children.length;
    after = json.data.after;
    if (!after || fetched >= limit) break;

    // Respect rate limits — small delay between pages
    await new Promise((r) => setTimeout(r, 1200));
  }

  for (const m of allMedia) {
    if (m && m.type === 'image' && m.url) {
      m.url = normalizeRedditImageUrl(m.url);
    }
  }

  const profileImageUrl = await profileImageUrlPromise;

  const result = {
    username,
    count: allMedia.length,
    media: allMedia,
    profileImageUrl: profileImageUrl || null,
  };
  cache.set(cacheKey, { data: result, timestamp: Date.now() });
  return result;
}

app.get('/api/media/:username', async (req, res) => {
  try {
    const username = extractUsername(req.params.username);
    if (!username) {
      return res.status(400).json({ error: 'Invalid username or URL' });
    }
    const data = await fetchUserMedia(username);
    res.json(data);
  } catch (err) {
    const status = err.message.includes('not found') ? 404 : err.message.includes('private') ? 403 : 500;
    res.status(status).json({ error: err.message });
  }
});

app.get('/api/lookup', async (req, res) => {
  try {
    const input = req.query.q;
    if (!input) return res.status(400).json({ error: 'Missing query parameter q' });
    const username = extractUsername(input);
    if (!username) return res.status(400).json({ error: 'Could not parse a Reddit username from that input' });
    const data = await fetchUserMedia(username);
    res.json(data);
  } catch (err) {
    const status = err.message.includes('not found') ? 404 : err.message.includes('private') ? 403 : 500;
    res.status(status).json({ error: err.message });
  }
});

/**
 * Same-origin avatar for the browser (avoids hotlink / referrer issues with styles.redditmedia.com).
 */
app.get('/api/avatar/:user', async (req, res) => {
  try {
    const username = extractUsername(req.params.user);
    if (!username) {
      return res.status(400).json({ error: 'Invalid username' });
    }
    const imageUrl = await fetchUserProfileImageUrl(username);
    if (!imageUrl) {
      return res.status(404).json({ error: 'No profile image' });
    }
    const imgRes = await fetch(imageUrl, {
      headers: { 'User-Agent': 'RedditSlideshow/1.0', Accept: 'image/*' },
    });
    if (!imgRes.ok) {
      return res.status(502).json({ error: 'Upstream image error' });
    }
    const ct = imgRes.headers.get('content-type') || 'image/jpeg';
    res.setHeader('Content-Type', ct);
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.setHeader('Access-Control-Allow-Origin', '*');
    const buf = Buffer.from(await imgRes.arrayBuffer());
    res.send(buf);
  } catch (err) {
    res.status(500).json({ error: err.message || 'Avatar proxy failed' });
  }
});

app.listen(PORT, () => {
  console.log(`Reddit Slideshow running at http://localhost:${PORT}`);
});
