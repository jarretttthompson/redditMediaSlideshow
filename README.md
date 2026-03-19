# Reddit Slideshow

A web app that takes a Reddit profile URL (or username) and creates a full-screen media slideshow of all images and videos that user has posted.

## Setup

```bash
npm install
npm start
```

Then open [http://localhost:3000](http://localhost:3000).

## Usage

1. Enter a Reddit username or profile URL (e.g. `exampleuser`, `u/exampleuser`, or `https://reddit.com/user/exampleuser`)
2. The app fetches all media posts from that profile
3. Browse through the slideshow with controls or keyboard shortcuts

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `→` or `L` | Next slide |
| `←` or `H` | Previous slide |
| `Space` | Play / Pause |
| `F` | Toggle fullscreen |
| `G` | Open grid view |
| `Esc` | Close grid view |

## How It Works

- Backend proxies requests to Reddit's public JSON API to avoid CORS issues
- Extracts media from `i.redd.it`, `i.imgur.com`, Reddit galleries, Reddit video, and preview images
- Paginates through up to 500 posts per user
- Caches results for 5 minutes to reduce API load
- Frontend presents media in a slideshow with autoplay, speed control, grid view, and fullscreen support
