/*
 * FasiAI pricing engine — USA (King County / WA) edition.
 *
 * Applies the log-linear model learned by pipeline/calibrate_us.py:
 *   price = cityPpsf · sqft · exp(intercept + Σ coefᵢ·(featureᵢ − refᵢ))
 * Every number comes from real 2014–15 sales. Backtest: ~14% median error.
 *
 * Pure functions, no DOM. To swap in a fresh dataset, re-run the calibrator —
 * this file reads all coefficients from data/model.json.
 */
const Pricing = (() => {

  function round(n, to) { return Math.round(n / to) * to; }

  // Build the centered feature vector in the SAME order as model.coef.
  function featureVec(f, model) {
    const ref = model.ref;
    const ageDec = (2015 - f.yearBuilt) / 10;
    return {
      intercept: 1,
      condition: f.condition - ref.cond,
      view: f.view - ref.view,
      waterfront: f.waterfront - ref.wf,
      renovated: f.renovated - ref.reno,
      logSqftLiving: Math.log(Math.max(f.sqft, 100)) - ref.logsqft,
      logSqftLot: Math.log(Math.max(f.lot, 100)) - ref.loglot,
      bathrooms: f.baths - ref.baths,
      bedrooms: f.beds - ref.beds,
      ageDecades: ageDec - ref.agedec,
      floors: f.floors - ref.floors,
      basement: (f.basement ? 1 : 0) - ref.basement
    };
  }

  const FACTOR_LABEL = {
    condition: c => `Condition: ${c.conditionLabel}`,
    view: c => `View: ${c.viewLabel}`,
    waterfront: () => 'Waterfront',
    renovated: () => 'Renovated',
    logSqftLiving: () => 'Size vs. typical (economies of scale)',
    logSqftLot: () => 'Lot size',
    bathrooms: () => 'Bathrooms',
    bedrooms: () => 'Bedrooms (given the size)',
    ageDecades: () => 'Age of home',
    floors: () => 'Floors / stories',
    basement: () => 'Has a basement'
  };

  function estimate(f, model) {
    const city = model.cities[f.city];
    if (!city || !f.sqft) return null;

    const x = featureVec(f, model);
    const coef = model.coef;

    // base = what a median-quality home of this size sells for in this city
    let lnPpsf = Math.log(city.ppsf) + coef.intercept * x.intercept;
    const breakdown = [];
    breakdown.push({
      label: `${city.label} · median $${city.ppsf}/sqft`,
      text: `$${round(city.ppsf * f.sqft, 1000).toLocaleString()}`, pct: null, base: true
    });

    const ctx = {
      conditionLabel: model.conditionLabels[f.condition],
      viewLabel: model.viewLabels[f.view]
    };

    // apply each learned factor
    for (const key of Object.keys(coef)) {
      if (key === 'intercept') continue;
      const contrib = coef[key] * x[key];         // in log space
      lnPpsf += contrib;
      const pct = (Math.exp(contrib) - 1) * 100;
      // hide near-zero and hide waterfront/renovated when not applicable
      if (Math.abs(pct) < 1) continue;
      if ((key === 'waterfront' || key === 'renovated') && x[key] === 0) continue;
      breakdown.push({ label: FACTOR_LABEL[key](ctx), text: `${pct > 0 ? '+' : ''}${pct.toFixed(0)}%`, pct });
    }

    const ppsf = Math.exp(lnPpsf);
    const total = round(ppsf * f.sqft, 1000);

    // uncertainty from the model's real backtest; wider for thin-data cities
    const bt = model.meta.backtest.medianAbsErrorPct / 100;
    let rangePct = bt;
    if (city.source === 'estimated') rangePct += 0.08;
    else if (city.samples < 50) rangePct += 0.03;

    const confidence = city.source === 'estimated' ? 60
      : city.samples >= 100 ? 86 : city.samples >= 40 ? 80 : 74;

    // where this estimate sits in the city's real sale distribution
    let percentile = null;
    if (city.p10 != null) {
      const pts = [[city.p10, 10], [city.p25, 25], [city.p50, 50], [city.p75, 75], [city.p90, 90]];
      if (total <= city.p10) percentile = 5;
      else if (total >= city.p90) percentile = 95;
      else {
        for (let i = 0; i < pts.length - 1; i++) {
          if (total >= pts[i][0] && total <= pts[i + 1][0]) {
            const t = (total - pts[i][0]) / (pts[i + 1][0] - pts[i][0] || 1);
            percentile = Math.round(pts[i][1] + t * (pts[i + 1][1] - pts[i][1]));
            break;
          }
        }
      }
    }

    return {
      total,
      low: round(total * (1 - rangePct), 1000),
      high: round(total * (1 + rangePct), 1000),
      perSqft: Math.round(total / f.sqft),
      rangePct, confidence, breakdown,
      cityLabel: city.label, source: city.source, samples: city.samples,
      percentile, dist: city.p10 != null
        ? { p10: city.p10, p25: city.p25, p50: city.p50, p75: city.p75, p90: city.p90 } : null
    };
  }

  function findComparables(f, listings, max = 5) {
    return listings
      .filter(l => l.city === f.city)
      .map(l => ({ ...l, d: Math.abs(l.sqft - f.sqft) }))
      .sort((a, b) => a.d - b.d)
      .slice(0, max);
  }

  return { estimate, findComparables, round };
})();
