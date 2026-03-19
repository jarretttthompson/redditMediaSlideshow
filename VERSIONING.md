# Version the site, roll back if something looks wrong

Instead of a long-lived `develop` branch, you can treat **tags** as named versions and **revert** when a release is bad.

---

## 1. When the site looks good → tag a version

On `main` (after you’ve pushed what you want live):

```bash
git checkout main
git pull origin main

git tag -a v1.0.0 -m "Stable: homepage collage, projects page, tunnel query param"
git push origin v1.0.0
```

Next release:

```bash
git tag -a v1.1.0 -m "Short note what changed"
git push origin v1.1.0
```

Use any scheme you like (`v1.0.0`, `v2025-03-20`, etc.). Tags are **pointers** to a commit — they don’t change GitHub Pages by themselves; **whatever commit `main` points to** is still what Pages builds. Tags are your **labels** for “last known good.”

---

## 2. If the latest deploy looks bad → go back

### Option A — **Revert** (safest, keeps history)

Undo the bad commit(s) with a **new** commit (good for GitHub Pages — just push):

```bash
git checkout main
git pull origin main

# Undo only the last commit:
git revert HEAD --no-edit
git push origin main

# Or undo several commits (opens editor to confirm):
# git revert HEAD~3..HEAD
```

On GitHub you can also open the bad commit → **⋯** → **Revert this commit** → create PR → merge.

After `main` updates, Pages rebuilds and the live site matches the **previous** behavior.

### Option B — **Reset** to a tag (you’re sure, solo repo)

Move `main` back to a tag, then force-push (rewrites history — avoid if others use the repo):

```bash
git checkout main
git reset --hard v1.0.0
git push origin main --force
```

Only use if you’re comfortable with force-push.

### Option C — **Find the last good commit** without a tag

```bash
git log --oneline -10
# copy the good commit hash, then:
git revert <bad_commit>..HEAD   # or reset --hard <good_hash> (+ force push if you reset)
```

---

## 3. GitHub Pages

Pages builds from a **branch** (usually `main`). It does **not** auto-deploy “from tag.” So:

- **Good workflow:** push to `main` → Pages updates → if bad, **revert on `main`** (Option A) → Pages updates again to the rolled-back state.
- Tags mark **which commit was “v1.0.0”** so you can reset or compare later.

---

## 4. Optional: show version in the site

To see what’s live without opening Git:

1. Add a tiny file e.g. `website/version.txt` with `1.0.0` and bump it when you tag.
2. Or put `<!-- build: v1.0.0 -->` in `index.html` and update when you release.

Not required for Git to work — only for your own sanity.

---

## 5. Relation to `develop` / Netlify

- **Versions + revert** = how you label and **undo** releases on `main`.
- A **`develop` branch** or **Netlify previews** are optional extras for testing *before* you merge to `main`. You can use **only** tags + revert if you prefer.

---

## Quick cheat sheet

| Goal              | Command |
|-------------------|--------|
| Save “this is v1” | `git tag -a v1.0.0 -m "msg" && git push origin v1.0.0` |
| Undo last change  | `git revert HEAD --no-edit && git push origin main` |
| List tags         | `git tag -l` |
| See tag’s commit  | `git show v1.0.0` |
