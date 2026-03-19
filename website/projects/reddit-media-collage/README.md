# Reddit Media Collage (static bundle)

This folder is a copy of the collage UI from [redditMediaSlideshow](https://github.com/jarretttthompson/redditMediaSlideshow) so it can be linked from the **Projects** page on thejrummer.art.

- **Try locally (recommended):** from the repo root, run `npm install` and `node server.js`, then open  
  `http://localhost:3000/projects/reddit-media-collage/index.html` (API + collage same origin; change the port if you use `PORT=3001`).
- **GitHub Pages:** static hosting has no `/api/lookup`. Either deploy the Express server somewhere and set `window.REDDIT_SLIDESHOW_API_BASE` at the top of `index.html` to that origin, or ask visitors to clone and run the server.

Homepage embed uses `HOME_REDDIT_PROXY`; this standalone page uses `REDDIT_SLIDESHOW_API_BASE` when the proxy is not same-origin.
