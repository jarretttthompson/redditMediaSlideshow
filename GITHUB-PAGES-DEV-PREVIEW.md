# Host the site from `dev-preview` (GitHub Pages)

The HTML/CSS/JS live in **`website/`**, which GitHub’s classic “Deploy from branch” **cannot** use as a folder (only `/` or `/docs`). This repo uses **GitHub Actions** to publish **`website/`** whenever you push to **`dev-preview`**.

## One-time setup (GitHub website)

1. Open the repo on GitHub → **Settings** → **Pages** (under Code and automation).
2. Under **Build and deployment** → **Source**, choose **GitHub Actions** (not “Deploy from a branch”).
3. Save if prompted.

After your first successful workflow run, Pages will show the site URL (often `https://<user>.github.io/<repo>/`).

## Day-to-day

```bash
git checkout dev-preview
git pull origin dev-preview
# … make changes …
git add -A && git commit -m "your message" && git push origin dev-preview
```

The workflow **Deploy website (dev-preview) to GitHub Pages** runs automatically. Check **Actions** tab for status.

## Switch back to `main` later

- Change the workflow trigger branches to `main`, or add a second workflow for `main`.
- Or set Pages source back to **Deploy from branch** → `main` (only works if `index.html` is at repo root or under `/docs`).

## `main` branch

Leaving **`main`** on classic Pages or without a deploy workflow means **`main` pushes won’t update** this Pages site until you change setup again — by design while you test from **`dev-preview`**.
