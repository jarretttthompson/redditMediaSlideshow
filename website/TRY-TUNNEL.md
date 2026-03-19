# Try GitHub Pages + local Reddit proxy (ngrok or cloudflared)

Use this to confirm your **live static site** can talk to **your laptop’s** `server.js` over HTTPS — **$0**, good for a quick end-to-end test.

## 1. Run the API locally

From the `redditThing` folder (where `server.js` lives):

```bash
npm install   # first time only
node server.js
```

Default: **http://localhost:3000** (or set `PORT=3001` etc.).

## 2. Expose it with HTTPS

### Option A — ngrok

1. Install: [ngrok download](https://ngrok.com/download) (or `brew install ngrok`).
2. Free account: sign up and run `ngrok config add-authtoken …` once.
3. In a **second** terminal:

   ```bash
   ngrok http 3000
   ```

   (Use `3001` if that’s your `PORT`.)

4. Copy the **https** URL, e.g. `https://abc123.ngrok-free.app`  
   - No trailing slash.

### Option B — Cloudflare Tunnel (cloudflared)

1. Install: [cloudflared](https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/install-and-setup/installation/).
2. Run:

   ```bash
   cloudflared tunnel --url http://localhost:3000
   ```

3. Copy the printed **https** `*.trycloudflare.com` URL (no trailing slash).

## 3. Open your GitHub Pages site with a query param

The site reads **`reddit_proxy`** and uses it as **`HOME_REDDIT_PROXY`** / API base (no code edit, no commit of the tunnel URL).

**Homepage collage**

Use your real Pages URL and **encode** the tunnel origin:

```text
https://YOUR_USER.github.io/YOUR_REPO/index.html?reddit_proxy=https%3A%2F%2Fabc123.ngrok-free.app
```

Example encoding:

- `https://abc123.ngrok-free.app` → `https%3A%2F%2Fabc123.ngrok-free.app`

**Projects → Reddit Media Collage**

```text
https://YOUR_USER.github.io/YOUR_REPO/projects/reddit-media-collage/index.html?reddit_proxy=https%3A%2F%2Fabc123.ngrok-free.app
```

After pushing, your repo must include the latest **`collage_app.js`** (ngrok skip header + `reddit_proxy` handling in `index.html`).

## 4. What we changed for you

- **`?reddit_proxy=…`** overrides the default proxy URL on the homepage and collage demo page.
- **ngrok:** the app sends `ngrok-skip-browser-warning` on API `fetch`es; **`server.js`** allows that header in CORS so the browser preflight succeeds.

## Limits (expected)

- **Tunnel stops** when you close the terminal or sleep the machine.
- **ngrok free** URLs often **change each session** (new `?reddit_proxy=` needed).
- **First visitor** to an ngrok URL may see an interstitial in a **browser tab**; API `fetch` usually still works with the header above.
- **`/api/avatar`** is loaded with `<img src="…">`; if ngrok interferes with images, the homepage hero may still use your hardcoded `i.redd.it` image; Reddit **lookup** is what you’re really testing.

## Next step after it works

Deploy the same API to **Vercel / Cloudflare Workers / Railway** and set a **fixed** `https://` origin (no query param) for production.
