# Develop branch + preview (optional)

**Prefer tagging + revert?** See **`VERSIONING.md`** — tag releases on `main` and `git revert` if a deploy looks bad (no long-lived `develop` required).

---

Use a **`develop`** branch for work in progress. Keep **GitHub Pages** building only from **`main`** so the live site stays stable.

---

## 1. Git: create `develop` and push

```bash
cd /path/to/redditThing   # or your combined repo that contains website/

git checkout main
git pull origin main

git checkout -b develop
git push -u origin develop
```

Daily work:

```bash
git checkout develop
# … edit …
git add -A
git commit -m "Describe change"
git push origin develop
```

When ready for production:

```bash
git checkout main
git pull origin main
git merge develop
git push origin main
```

Or open a **Pull Request** on GitHub: `develop` → `main`, review, merge.

---

## 2. GitHub Pages stays on `main`

In the repo that powers your **live** site (often `username.github.io` or your Pages repo):

1. **Settings → Pages**
2. **Branch** = **`main`** (or `gh-pages` — whatever you use today)
3. Do **not** switch this to `develop` for day-to-day work.

Pushing only to **`develop`** does not update that site.

---

## 3. Hosted previews on Netlify (recommended)

1. Sign up at [netlify.com](https://www.netlify.com/) (free tier is enough).
2. **Add new site → Import an existing project** → connect **GitHub** → pick this repo.
3. Netlify reads **`netlify.toml`**: publish directory is **`website`** (no build command).
4. **Site settings → Build & deploy → Continuous deployment → Branch deploys**
   - Enable **Deploy Previews** / branch deploys for **`develop`** (or “All branches”).
5. After you **push `develop`**, Netlify gives a **unique preview URL** (e.g. `deploy-preview-123--yoursite.netlify.app`) for that deploy. Production on Netlify can stay tied to **`main`** if you set **Production branch** = `main` under Deploy contexts.

**Result:** `main` → production Netlify + GitHub Pages (if you use both); `develop` → preview URL only.

---

## 4. Hosted previews on Vercel (alternative)

1. [vercel.com](https://vercel.com/) → **Add New Project** → import this repo.
2. **Root Directory** → set to **`website`** (important: your HTML/CSS/JS live there).
3. **Framework preset:** Other / no framework; leave build command empty if everything is static.
4. **Production Branch:** `main`.
5. Vercel automatically creates **Preview Deployments** for other branches (e.g. each push to **`develop`** gets a preview URL).

---

## 5. If your live site is a *different* repo than `redditThing`

- Keep **redditThing** on `develop` / `main` for the slideshow app + server.
- **Copy or subtree** the `website/` folder into your **Pages repo** when you merge to production, **or** use the same Netlify/Vercel project pointed at the repo that actually contains `website/`.

Adjust the Git remote / repo choice in Netlify/Vercel to match where **`website/`** lives.

---

## 6. Quick reference

| Branch   | GitHub Pages (if from `main`) | Netlify/Vercel preview      |
|----------|----------------------------------|-----------------------------|
| `main`   | Live site updates              | Production deploy           |
| `develop`| No change                        | Preview URL per push      |

---

## 7. Tunnel testing (`?reddit_proxy=`)

See **`TRY-TUNNEL.md`**. That works on **any** host (preview or production) as long as the built files include the latest `collage_app.js` and `index.html` query-param logic.
