/*
 * FasiAI assistant (USA edition) — rule-based, runs 100% in the browser. No tokens, no cost.
 * Grounded in the live estimate + the real model, so its numbers match what the user sees.
 * Swap respond() for a fetch() to any LLM later; the UI stays the same.
 */
const Assistant = (() => {
  let ctx = null; // { features, result, model, recompute }
  const setContext = c => { ctx = c; };

  const fmt = n => '$' + Math.round(n).toLocaleString();
  const fmtK = n => n >= 1e6 ? '$' + (n / 1e6).toFixed(2) + 'M' : '$' + Math.round(n / 1000) + 'K';
  const need = () => "Fill in your home's details above and hit **Estimate my home's value** first — then I can talk specifics. 🙂";

  function greet() {
    return "Hi! I'm your FasiAI agent. Once you run a valuation I can explain the price, test a renovation or an extra bathroom, and show how accurate the model is. Ask away.";
  }

  function whyPrice() {
    if (!ctx?.result) return need();
    const r = ctx.result;
    const lines = r.breakdown.map(b => b.base
      ? `• Start: ${b.label} → **${b.text}**`
      : `• ${b.label}: **${b.text}**`);
    return `Here's how the model built **${fmt(r.total)}** for your ${r.cityLabel} home:\n${lines.join('\n')}\n\nEvery percentage is a coefficient learned from real King County sales. The city's price-per-sqft is the median of ${r.samples} actual sales there.`;
  }

  function whatIf(newFeatures, label) {
    const before = ctx.result.total;
    const res = ctx.recompute(newFeatures, false);
    const gain = res.total - before;
    return { res, gain, before, label };
  }

  function renovate() {
    if (!ctx?.result) return need();
    const f = ctx.features;
    if (f.condition >= 5 && f.renovated) return "Your home is already top condition and marked renovated — the model won't add more there. 😄";
    const nf = { ...f, condition: Math.min(5, f.condition + 1), renovated: 1 };
    const { res, gain } = whatIf(nf);
    return `If you bring it to **${ctx.model.conditionLabels[nf.condition]}** condition and mark it renovated:\n• New estimate: **${fmt(res.total)}** (now ${fmt(ctx.result.total)})\n• Added value: **${gain >= 0 ? '+' : ''}${fmt(gain)}**\n\nRenovation costs vary, but in this market a full refresh typically runs $40–100/sqft. Compare that to the gain before committing.`;
  }

  function addBath() {
    if (!ctx?.result) return need();
    const f = ctx.features;
    const nf = { ...f, baths: f.baths + 1 };
    const { res, gain } = whatIf(nf);
    return `Adding a bathroom (to ${nf.baths}):\n• New estimate: **${fmt(res.total)}** (now ${fmt(ctx.result.total)})\n• Added value: **${gain >= 0 ? '+' : ''}${fmt(gain)}**\n\nThe model learned each added bath is worth about +9% on price-per-sqft, holding size constant. A bath addition often costs $15–35k — usually worth it if you have the space.`;
  }

  function addSpace() {
    if (!ctx?.result) return need();
    const f = ctx.features;
    const nf = { ...f, sqft: f.sqft + 400 };
    const { res, gain } = whatIf(nf);
    return `Adding ~400 sqft (to ${nf.sqft.toLocaleString()} sqft):\n• New estimate: **${fmt(res.total)}** (now ${fmt(ctx.result.total)})\n• Added value: **${gain >= 0 ? '+' : ''}${fmt(gain)}**\n\nMore space adds value, but note the model also knows bigger homes sell for a bit less *per* square foot — so it's not purely linear.`;
  }

  function accuracy() {
    const m = ctx?.model;
    if (!m) return "Once the page loads I can show the model's tested accuracy.";
    const bt = m.meta.backtest;
    return `Straight answer: it's a **guide, not an appraisal**. I tested the model against every one of the ${m.meta.rows.toLocaleString()} real sales it was built from:\n• Median error: **±${bt.medianAbsErrorPct}%**\n• Within ±10%: **${bt.within10pct}%** of homes\n• Within ±20%: **${bt.within20pct}%** of homes\n\nSo for a typical home the estimate lands within about ${bt.medianAbsErrorPct}% of the real price. Unusual homes (very large, waterfront, rare cities) are less certain — that's why each estimate shows a range and a confidence score.`;
  }

  function market() {
    const m = ctx?.model;
    if (!m) return "Give me a second to load the data.";
    const calib = Object.values(m.cities).filter(c => c.source === 'calibrated');
    const priciest = calib.reduce((a, b) => b.ppsf > a.ppsf ? b : a);
    const cheapest = calib.reduce((a, b) => b.ppsf < a.ppsf ? b : a);
    const wf = Math.round((Math.exp(m.coef.waterfront) - 1) * 100);
    return `King County market, from the real data:\n• Median price per sqft overall: **$${m.globalPpsf}**\n• Priciest city here: **${priciest.label}** ($${priciest.ppsf}/sqft) · most affordable: **${cheapest.label}** ($${cheapest.ppsf}/sqft)\n• Waterfront adds about **+${wf}%**; each condition step up ≈ +5%; a top view ≈ +25%.\n\nScroll to the Market section to see price-per-sqft across the top cities.`;
  }

  function percentile() {
    if (!ctx?.result) return need();
    const r = ctx.result;
    if (r.percentile == null) return "I don't have enough local sales in this city to place your home in a distribution.";
    return `Your estimate of **${fmt(r.total)}** sits around the **${r.percentile}th percentile** of recent ${r.cityLabel} sales — meaning about ${r.percentile}% of homes there sold for less. ${r.percentile >= 70 ? "It's a higher-end home for the area." : r.percentile <= 30 ? "It's priced toward the affordable end locally." : "Right around the middle of the local market."}`;
  }

  function worthMore() {
    if (!ctx?.result) return need();
    const r = ctx.result;
    return `I get it — but the model's fair range is **${fmtK(r.low)}–${fmtK(r.high)}**, built from real comparable sales. You can list above ${fmtK(r.high)}, but homes priced well over the local distribution tend to sit longer and draw lowball offers. Listing near **${fmt(Pricing.round(r.total * 1.02, 1000))}** leaves a little negotiating room without scaring buyers off.`;
  }

  function thanks() { return "Anytime! 🙌 Good luck with the sale — come back and try a what-if if you're thinking about improvements."; }

  function help() {
    return "I can:\n• **Explain the price** — “why this price?”\n• **What-ifs** — “what if I renovate?”, “add a bathroom”, “add square footage”\n• **Accuracy** — “how accurate is this?”\n• **Positioning** — “where does it rank?”\n• **Market** — “what's the market like?”\n\nAll local, no cost, nothing leaves your browser.";
  }

  const INTENTS = [
    { re: /renovat|remodel|fix up|upgrade|condition/i, fn: renovate },
    { re: /bath/i, fn: addBath },
    { re: /(add|more).*(space|sqft|square|room|size)|bigger|extension|addition/i, fn: addSpace },
    { re: /accura|reliab|trust|confiden|how good|margin|error/i, fn: accuracy },
    { re: /market|median|city|cities|expensive|affordable|premium/i, fn: market },
    { re: /percentile|rank|compare|where.*(sit|stand|rank)|distribution/i, fn: percentile },
    { re: /why|how.*(price|calculat|estimat|got)|breakdown|explain/i, fn: whyPrice },
    { re: /worth more|too (low|cheap)|higher|more money|undervalu|expect more/i, fn: worthMore },
    { re: /thank|thanks|great|awesome|nice|cool/i, fn: thanks },
    { re: /^(hi|hey|hello|yo|sup)\b/i, fn: greet },
    { re: /help|what can you/i, fn: help }
  ];

  function respond(message) {
    const msg = message.trim();
    for (const it of INTENTS) if (it.re.test(msg)) return it.fn(msg);
    return "I didn't quite catch that. " + help();
  }

  return { respond, setContext, greet };
})();
