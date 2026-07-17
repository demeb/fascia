# FasiAI — deploy for $0

It's a static site (HTML/CSS/JS + JSON). No server, no keys, no monthly bill.

## What's real

Every number on the site comes from `data/source/usa_housing.csv` — 4,090 real
King County home sales — via `pipeline/calibrate_us.py`. The model is backtested at
**±13.3% median error**, and that figure is shown on the site. No invented data.

## Put it online (pick one, all free)

**GitHub Pages**
1. Push this folder to a GitHub repo.
2. Settings → Pages → deploy from `main`, root folder. Done — you get a public URL.

**Netlify / Cloudflare Pages**
1. Free account → drag the `fasi-ai` folder in (or connect the repo).
2. No build command; publish directory is the repo root.

## Rebuild the model when the data changes

```bash
python3 pipeline/calibrate_us.py    # rebuilds data/model.json + listings.json, prints accuracy
```

`.github/workflows/build-model.yml` runs this automatically (free) whenever you change
`data/source/usa_housing.csv`, and commits the rebuilt files so your host redeploys.

## Growing it

- **More cities/metros:** append rows to `data/source/usa_housing.csv` from other US sales
  datasets (same columns), re-run the calibrator. New cities calibrate automatically; thin
  ones are marked "low data."
- **Newer data:** the current set is 2014–15. Swapping in recent sales makes the estimates
  current — same pipeline, no code changes.

## Honesty checklist (what keeps it trustworthy)

- ✅ Accuracy is measured (backtest) and shown, not claimed.
- ✅ Cities with few sales are labelled "low data," not passed off as precise.
- ✅ Every estimate shows its reasoning, a range, and a percentile among real sales.
- ❌ Don't present a 2014–15 estimate as today's market value without saying so.
