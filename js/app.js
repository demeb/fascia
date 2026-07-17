/*
 * UI layer (USA edition): loads the real model, drives the form, renders the
 * regression estimate, a distribution positioning chart, real comparables, and
 * a market overview computed live from the dataset.
 */
(async function () {
  const $ = s => document.querySelector(s);
  const $$ = s => [...document.querySelectorAll(s)];
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

  const grab = (p, fb) => fetch(p, { cache: 'no-cache' }).then(r => r.json()).catch(() => fb);
  const [model, listings] = await Promise.all([
    grab('data/model.json'),
    grab('data/listings.json', { items: [] })
  ]);

  const state = { features: null, result: null };
  const fmt = n => '$' + Math.round(n).toLocaleString();
  const fmtK = n => n >= 1e6 ? '$' + (n / 1e6).toFixed(2) + 'M' : '$' + Math.round(n / 1000) + 'K';
  const icon = id => `<svg class="icon" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24"><use href="#i-${id}"/></svg>`;
  const ordinal = n => { const s = ['th','st','nd','rd'], v = n % 100; return n + (s[(v-20)%10] || s[v] || s[0]); };

  /* ── motion helpers ──────────────────────────────────── */
  function countUp(el, to, prefix = '') {
    const final = () => { el.textContent = prefix + Math.round(to).toLocaleString(); };
    if (reduced || document.hidden) { final(); return; }
    const dur = 1100, t0 = performance.now(), ease = t => 1 - Math.pow(1 - t, 4);
    let done = false;
    const guard = setTimeout(() => { if (!done) { done = true; final(); } }, dur + 250);
    (function frame(now) {
      if (done) return;
      const t = Math.min((now - t0) / dur, 1);
      el.textContent = prefix + Math.round(to * ease(t)).toLocaleString();
      if (t < 1) requestAnimationFrame(frame); else { clearTimeout(guard); done = true; final(); }
    })(t0);
  }

  function show(el) {
    el.classList.add('in');
    const c = el.querySelector('[data-count]');
    if (c && !c.dataset.done) { c.dataset.done = '1'; countUp(c, +c.dataset.count, c.dataset.prefix || ''); }
  }
  const revealer = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { show(e.target); revealer.unobserve(e.target); } }),
    { threshold: 0.15, rootMargin: '0px 0px -40px 0px' });
  const animatable = () => !reduced && !document.hidden;
  const root = document.documentElement;
  function observeReveals() {
    if (animatable()) { root.classList.remove('no-motion'); $$('.rv:not(.in)').forEach(el => revealer.observe(el)); }
    else { root.classList.add('no-motion'); $$('.rv:not(.in)').forEach(show); }
  }
  observeReveals();
  document.addEventListener('visibilitychange', observeReveals);

  const nav = $('#nav');
  addEventListener('scroll', () => nav.classList.toggle('stuck', scrollY > 20), { passive: true });
  $$('[data-scroll]').forEach(b => b.addEventListener('click', () => $(b.dataset.scroll).scrollIntoView({ behavior: 'smooth' })));

  /* ── hero trust chips + rows count ───────────────────── */
  const bt = model.meta.backtest;
  $('#hero-rows').textContent = model.meta.rows.toLocaleString();
  $('#trust-row').innerHTML = [
    `±${bt.medianAbsErrorPct}% median error`,
    `${bt.within20pct}% within ±20%`,
    `${model.meta.rows.toLocaleString()} real sales`,
    `${Object.keys(model.cities).length} cities`
  ].map(t => `<span class="trust-chip">${t}</span>`).join('');

  /* ── build form ──────────────────────────────────────── */
  const cityEntries = Object.entries(model.cities).sort((a, b) => b[1].samples - a[1].samples);
  $('#f-city').innerHTML = cityEntries.map(([k, c]) =>
    `<option value="${k}">${c.label}${c.source === 'estimated' ? ' — few sales' : ''}</option>`).join('');
  $('#f-condition').innerHTML = Object.entries(model.conditionLabels).map(([v, l]) =>
    `<option value="${v}"${v === '3' ? ' selected' : ''}>${l}</option>`).join('');
  $('#f-view').innerHTML = Object.entries(model.viewLabels).map(([v, l]) =>
    `<option value="${v}"${v === '0' ? ' selected' : ''}>${l}</option>`).join('');

  const readFeatures = () => ({
    city: $('#f-city').value,
    sqft: +$('#f-sqft').value,
    lot: +$('#f-lot').value || 4000,
    beds: +$('#f-beds').value,
    baths: +$('#f-baths').value,
    yearBuilt: +$('#f-year').value || 1975,
    condition: +$('#f-condition').value,
    view: +$('#f-view').value,
    floors: +$('#f-floors').value,
    waterfront: $('#f-waterfront').checked ? 1 : 0,
    basement: $('#f-basement').checked ? 1 : 0,
    renovated: $('#f-renovated').checked ? 1 : 0
  });

  /* ── render result ───────────────────────────────────── */
  function renderResult(f, r) {
    countUp($('#price-main'), r.total, '$');
    $('#price-psf').textContent = `${fmt(r.perSqft)} per sqft · ${f.sqft.toLocaleString()} sqft in ${r.cityLabel}`;
    $('#res-sub').textContent = `${r.cityLabel} · ${f.sqft.toLocaleString()} sqft · ${f.beds} bd · ${f.baths} ba · ${model.conditionLabels[f.condition].toLowerCase()} condition`;
    $('#range-low').textContent = fmtK(r.low);
    $('#range-high').textContent = fmtK(r.high);
    $('#s-psf').textContent = fmt(r.perSqft);
    $('#s-conf').textContent = r.confidence + '%';
    $('#s-pct').textContent = r.percentile != null ? ordinal(r.percentile) : '—';

    // data-confidence badge
    const badge = $('#data-badge');
    if (r.source === 'calibrated') {
      badge.className = 'data-badge calibrated';
      badge.innerHTML = `${icon('shield')}<span><b>Calibrated</b> — ${r.cityLabel}'s price is set from ${r.samples} real sales. Model is accurate to about ±${bt.medianAbsErrorPct}% on tested homes.</span>`;
    } else {
      badge.className = 'data-badge estimated';
      badge.innerHTML = `${icon('info')}<span><b>Low data</b> — only ${r.samples} sales in ${r.cityLabel}, so treat this as a rough guide, not a precise figure.</span>`;
    }
    badge.hidden = false;

    $('#res-alt-text').innerHTML = r.percentile != null
      ? `That's around the <b>${ordinal(r.percentile)} percentile</b> of recent ${r.cityLabel} sales — ${r.percentile >= 50 ? 'toward the higher end' : 'toward the more affordable end'} of the local market.`
      : `Based on ${r.cityLabel}'s median price per square foot.`;

    // breakdown with proportional bars
    const maxPct = Math.max(...r.breakdown.map(b => Math.abs(b.pct || 0)), 1);
    $('#bd').innerHTML = r.breakdown.map(b => {
      const w = b.pct ? Math.abs(b.pct) / maxPct * 100 : 0;
      const cls = b.pct > 0 ? 'pos' : b.pct < 0 ? 'neg' : '';
      return `<li>
        <span class="bd-k">${b.label}</span>
        <span class="bd-v ${cls}">${b.text}</span>
        ${w ? `<span class="bd-bar ${cls}"><i data-w="${w}"></i></span>` : ''}
      </li>`;
    }).join('');
    requestAnimationFrame(() => $$('#bd .bd-bar i').forEach((el, i) =>
      setTimeout(() => el.style.width = el.dataset.w + '%', 120 + i * 55)));

    // comparables
    const comps = Pricing.findComparables(f, listings.items);
    $('#comps').innerHTML = comps.length ? comps.map(c => `
      <div class="comp">
        <div>
          <div class="comp-t">${c.sqft.toLocaleString()} sqft · ${c.beds} bd · ${c.baths} ba${c.wf ? ' · waterfront' : ''}${c.basement ? ' · basement' : ''}</div>
          <div class="comp-m">${model.conditionLabels[c.cond]} condition · ${c.floors ? c.floors + ' floors · ' : ''}built ${c.yb}</div>
        </div>
        <div><div class="comp-p">${fmtK(c.price)}</div><div class="comp-d">sold price</div></div>
      </div>`).join('') : '<p class="muted">No comparable sales recorded in this city.</p>';

    renderDistribution(f, r);
    $('#results').hidden = false;
    observeReveals();
    requestAnimationFrame(() => $('#res-hero').classList.add('is-shown'));
  }

  /* ── distribution positioning chart ──────────────────── */
  function renderDistribution(f, r) {
    if (!r.dist) { $('#dist-chart').innerHTML = '<p class="muted">Not enough local sales to plot a distribution.</p>'; $('#dist-foot').textContent = ''; return; }
    const d = r.dist;
    $('#dist-title').textContent = `Your estimate vs. ${r.cityLabel} sales`;
    const W = 580, H = 150, P = { l: 20, r: 20, t: 40, b: 34 };
    const lo = Math.min(d.p10, r.low) * 0.96, hi = Math.max(d.p90, r.high) * 1.04;
    const x = v => P.l + (v - lo) / (hi - lo) * (W - P.l - P.r);
    const y = H - P.b;

    const ticks = [['p10', d.p10, '10th'], ['p25', d.p25, '25th'], ['p50', d.p50, 'median'], ['p75', d.p75, '75th'], ['p90', d.p90, '90th']];
    const tickMarks = ticks.map(([k, v, lbl]) => `
      <line x1="${x(v)}" x2="${x(v)}" y1="${y - 7}" y2="${y + 7}" class="grid"/>
      <text x="${x(v)}" y="${y + 22}" class="tick" text-anchor="middle">${fmtK(v)}</text>
      <text x="${x(v)}" y="${P.t - 14}" class="tick" text-anchor="middle" opacity="0.7">${lbl}</text>`).join('');

    $('#dist-chart').innerHTML = `
      <svg class="chart-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="Where your estimate falls among ${r.cityLabel} sales">
        <defs><linearGradient id="distGrad" x1="0" x2="1" y1="0" y2="0">
          <stop offset="0%" stop-color="#B58F1D" stop-opacity="0.15"/><stop offset="100%" stop-color="#B58F1D" stop-opacity="0.35"/>
        </linearGradient></defs>
        <rect x="${x(d.p10)}" y="${y - 5}" width="${x(d.p90) - x(d.p10)}" height="10" rx="5" fill="url(#distGrad)"/>
        <rect x="${x(d.p25)}" y="${y - 5}" width="${x(d.p75) - x(d.p25)}" height="10" rx="5" fill="#B58F1D" opacity="0.5"/>
        ${tickMarks}
        <g class="est-marker" style="--x:${x(r.total)}px">
          <line x1="${x(r.total)}" x2="${x(r.total)}" y1="${P.t - 4}" y2="${y + 8}" class="est-line"/>
          <circle cx="${x(r.total)}" cy="${P.t - 4}" r="6" class="est-dot"/>
          <text x="${x(r.total)}" y="${P.t - 16}" class="est-text" text-anchor="middle">${fmtK(r.total)}</text>
        </g>
      </svg>`;
    $('#dist-foot').innerHTML = `${icon('info')} The band shows the middle 80% of real ${r.cityLabel} sale prices; the darker band is the middle 50%.`;
  }

  /* ── market overview (computed live) ─────────────────── */
  (function renderMarket() {
    const wfPremium = Math.round((Math.exp(model.coef.waterfront) - 1) * 100);
    const calib = Object.values(model.cities).filter(c => c.source === 'calibrated');
    const priciest = calib.reduce((a, b) => b.ppsf > a.ppsf ? b : a);
    const cheapest = calib.reduce((a, b) => b.ppsf < a.ppsf ? b : a);

    const card = (k, v, s) => `<div class="fact"><span class="fact-k">${k}</span><span class="fact-v num">${v}</span><span class="fact-s">${icon('info')}${s}</span></div>`;
    $('#mk-facts').innerHTML =
      card('Homes analyzed', model.meta.rows.toLocaleString(), '2014–15 King County sales') +
      card('Median $/sqft', '$' + model.globalPpsf, 'across all sales') +
      card('Model accuracy', '±' + bt.medianAbsErrorPct + '%', 'median error, backtested') +
      card('Waterfront premium', '+' + wfPremium + '%', 'learned from the data');

    // city bars — top 12 calibrated cities by $/sqft
    const top = Object.values(model.cities).filter(c => c.source === 'calibrated')
      .sort((a, b) => b.ppsf - a.ppsf).slice(0, 12);
    const max = top[0].ppsf;
    $('#city-bars').innerHTML = top.map((c, i) => `
      <div class="cbar rv" style="transition-delay:${Math.min(i, 8) * 45}ms">
        <span class="cbar-name">${c.label}</span>
        <span class="cbar-track"><i style="width:${c.ppsf / max * 100}%"></i></span>
        <span class="cbar-val num">$${c.ppsf}</span>
      </div>`).join('');
    observeReveals();
  })();

  /* ── compute + submit ────────────────────────────────── */
  function recompute(features, updateUI) {
    const r = Pricing.estimate(features, model);
    if (updateUI && r) {
      state.features = features; state.result = r;
      renderResult(features, r);
      Assistant.setContext({ features, result: r, model, recompute });
    }
    return r;
  }

  $('#form').addEventListener('submit', e => {
    e.preventDefault();
    const f = readFeatures();
    const r = recompute(f, true);
    if (!r) return;
    $('#results').scrollIntoView({ behavior: 'smooth' });
    setTimeout(() => push(`I valued your ${r.cityLabel} home at **${fmt(r.total)}** — likely range ${fmtK(r.low)} to ${fmtK(r.high)}. Ask me why, or try a what-if.`, true), 900);
  });

  /* ── chat ────────────────────────────────────────────── */
  const chat = $('#chat'), body = $('#chat-body'), fab = $('#fab');
  const md = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/\n/g, '<br>');
  function bubble(t, who) { const el = document.createElement('div'); el.className = 'msg ' + who; el.innerHTML = md(t); body.appendChild(el); body.scrollTop = body.scrollHeight; return el; }
  function push(t, instant) {
    if (instant || reduced) { bubble(t, 'bot'); return; }
    const ty = document.createElement('div'); ty.className = 'msg bot typing'; ty.innerHTML = '<i></i><i></i><i></i>';
    body.appendChild(ty); body.scrollTop = body.scrollHeight;
    setTimeout(() => { ty.remove(); bubble(t, 'bot'); }, 500 + Math.random() * 400);
  }
  const openChat = () => { chat.hidden = false; fab.classList.add('hidden'); if (!body.children.length) push(Assistant.greet(), true); $('#chat-text').focus(); };
  const closeChat = () => { chat.hidden = true; fab.classList.remove('hidden'); };
  fab.addEventListener('click', openChat);
  $('#chat-x').addEventListener('click', closeChat);
  $('#res-chat').addEventListener('click', openChat);
  $('#hero-chat').addEventListener('click', openChat);
  $('#chat-form').addEventListener('submit', e => { e.preventDefault(); const t = $('#chat-text').value.trim(); if (!t) return; bubble(t, 'user'); $('#chat-text').value = ''; push(Assistant.respond(t)); });
  $('#chips').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; bubble(b.dataset.q, 'user'); push(Assistant.respond(b.dataset.q)); });
})();
