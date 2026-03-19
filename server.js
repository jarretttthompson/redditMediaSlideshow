const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

const cache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

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
  const cacheKey = username.toLowerCase();
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.data;
  }

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

  const result = { username, count: allMedia.length, media: allMedia };
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

app.listen(PORT, () => {
  console.log(`Reddit Slideshow running at http://localhost:${PORT}`);
});
