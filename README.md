# FasiAI 🏡 — Home Value Intelligence (Seattle / King County, WA)

An instant home-valuation site built on **real data** — 4,090 actual 2014–15 King County
home sales. Enter the features that genuinely move price, get a defensible estimate with a
fair range, see where it sits among local sales, and ask a built-in AI agent to explain it.
The agent runs **100% in the browser** — no API keys, no tokens, no cost.

## Run it

```bash
cd fasi-ai
python3 -m http.server 4173
# open http://localhost:4173
```

Any static server works. It must be a server (not `file://`) because the app fetches JSON.

## How the price is calculated (and how good it is)

The model is **learned from the data**, not hand-tuned:

1. Each city's **base price-per-sqft** = the median of real sales there.
2. An **OLS regression** (pure Python, no libraries) learns how much each feature shifts
   price-per-sqft above that base: condition, view, waterfront, size, lot, baths, beds, age.
3. Every estimate is **backtested against all 4,090 real sales**:
   **±13.3% median error · 66% of homes within ±20%.** That accuracy is shown on the site.

Estimate for a home = `cityPricePerSqft × sqft × exp(Σ coefficient × feature)`, plus a fair
range and a percentile showing where it lands in that city's real sale distribution.

| Piece | File |
|---|---|
| Pricing engine (applies the learned model) | `js/model.js` |
| AI agent (rule-based, free, grounded in the estimate) | `js/chat.js` |
| UI — form, results, distribution chart, market overview | `index.html`, `css/style.css`, `js/app.js` |
| The learned model (city bases + coefficients + backtest) | `data/model.json` |
| Real comparable sales (size-stratified per city) | `data/listings.json` |
| The dataset the model is built from | `data/source/usa_housing.csv` |
| Model builder + backtester | `pipeline/calibrate_us.py` |

## Features the model uses (only what actually matters)

City · living area (sqft) · lot size · bedrooms · bathrooms · year built · floors · condition (1–5) ·
view quality (0–4) · waterfront · basement · renovated. Every one is a real column in the Kaggle
dataset — no photo upload, no invented fields the data can't support.

## Rebuilding the model / using fresh data

Replace `data/source/usa_housing.csv` (same columns) and run:

```bash
python3 pipeline/calibrate_us.py
```

It rewrites `data/model.json` and `data/listings.json` and prints the new backtest accuracy.
`.github/workflows/build-model.yml` does this automatically (free) whenever the CSV changes.

### Adding more regions

The dataset is King County, WA. To cover other US metros, append rows from another sales
dataset (Zillow/Redfin exports, county assessor open data, Kaggle housing sets) with the same
columns and re-run the calibrator — new cities calibrate automatically, and any city with
under 15 sales is honestly marked "low data" on the site.

## Deploying free

See **[DEPLOY.md](DEPLOY.md)** — GitHub Pages / Netlify, $0.

⚠️ Estimates are based on 2014–15 sales and are for **guidance, not a formal appraisal**.
