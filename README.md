# FinCompass — run it and host it

The single-file app (`src/FinCompass.jsx`) is entirely client-side. No server, no database, no API keys. That means GitHub Pages can host it for free.

---

## Run it locally

You need [Node.js](https://nodejs.org) 18 or newer.

```bash
npm install
npm run dev
```

Open the URL it prints (usually `http://localhost:5173`).

To check the production build before deploying:

```bash
npm run build
npm run preview
```

---

## Put it on GitHub

```bash
git init
git add .
git commit -m "FinCompass"
git branch -M main
git remote add origin https://github.com/<your-username>/<your-repo>.git
git push -u origin main
```

Commit `package-lock.json` — the deploy workflow runs `npm ci`, which requires it.

---

## Host it on GitHub Pages

The workflow in `.github/workflows/deploy.yml` builds and publishes on every push to `main`. You only need to switch Pages on once:

1. Go to your repo on GitHub → **Settings** → **Pages**
2. Under **Build and deployment**, set **Source** to **GitHub Actions**
3. Push to `main` (or go to **Actions** → *Deploy to GitHub Pages* → **Run workflow**)

The first run takes a couple of minutes. Your site appears at:

```
https://<your-username>.github.io/<your-repo>/
```

The URL is printed at the bottom of the deploy job, and shown under Settings → Pages.

### Why `base: "./"` in `vite.config.js`

A GitHub Pages *project* site is served from a subfolder (`/your-repo/`), not the domain root. If assets are requested from `/assets/...` the page loads blank with 404s in the console — the single most common Pages deployment failure.

Relative paths avoid it without hardcoding your repo name. Change `base` to `"/"` only if you are using a custom domain, or a *user* site (a repo named exactly `<your-username>.github.io`).

### If the page is blank

- Open the browser console. 404s on `/assets/...` mean `base` is wrong.
- Check **Actions** for a red run — a failed build publishes nothing, leaving the old site up.
- Hard-refresh (Ctrl/Cmd + Shift + R). Pages caches aggressively.

---

## Other hosts

Any static host works, since the build output in `dist/` is just files.

| Host | How |
|---|---|
| **Netlify** | Connect the repo. Build `npm run build`, publish directory `dist`. |
| **Vercel** | Import the repo; the Vite preset is detected automatically. |
| **Cloudflare Pages** | Build `npm run build`, output `dist`. |

For these, `base: "./"` is still fine, but you can set it to `"/"` since they serve from the domain root.

---

## What about the Next.js repo?

The other archive (`fincompass-source.zip`) is a different thing: a full application with Auth.js, Prisma and PostgreSQL. **GitHub Pages cannot host it** — Pages serves static files only, and that app needs a running server and a database.

Deploy it to **Vercel** (free tier) with a managed Postgres from **Neon** or **Supabase**:

1. Push `fincompass/` to its own GitHub repo
2. Import it in Vercel, set the root directory to `apps/web`
3. Add the environment variables from `apps/web/.env.example`
4. Run `npx prisma db push` against your database once

The two projects share the same calculation engine but nothing else. This one is the demonstrable MVP; that one is the production architecture.

---

## A note on the build warning

`npm run build` prints a chunk-size warning. It comes from Recharts, which is around 560 kB minified — larger than Vite's 500 kB default threshold. The app's own code is about 92 kB (28 kB gzipped).

The warning is advisory, not an error, and the build is fine. If the bundle size matters for your audience, the real fix is lazy-loading the chart-heavy tabs with `React.lazy`, not raising the threshold to hide the message.
