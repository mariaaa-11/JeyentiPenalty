/* ==========================================================================
   MODULE: PEN UI MANAGER
   ========================================================================== */
const PenUIManager = (() => {
  let lastResults = [];
  let multiResults = [];
  let activeDetailIdx = -1;

  function showResults() {
    document.getElementById('results')?.classList.remove('hidden');
  }

  /* ---------- Single manual result (full detail card) ---------- */
  function renderManualResult(result) {
    const box = document.getElementById('manualResult');
    if (!box) return;
    if (!result) {
      box.innerHTML = '';
      box.classList.add('hidden');
      return;
    }
    box.classList.remove('hidden');
    box.innerHTML = buildDetailHtml(result, 'Calculation Result');
  }

  function buildDetailHtml(result, title) {
    const dtClass = result.dt > 0 ? 'late' : (result.dt < 0 ? 'early' : 'ontime');
    const penClass = result.penalty > 0 ? 'penalty-yes' : 'penalty-no';
    return `
      <div class="result-card ${penClass}">
        <h3>${PenUtils.escapeHtml(title || 'Detail')}</h3>
        <div class="result-grid">
          <div class="r-item"><span class="lbl">Route</span><span class="val">${PenUtils.escapeHtml(result.route)}</span></div>
          <div class="r-item"><span class="lbl">Supplier / Trucker</span><span class="val">${PenUtils.escapeHtml(result.supplier || '—')}</span></div>
          <div class="r-item"><span class="lbl">Plan Travel Time</span><span class="val">${PenUtils.formatHours(result.planTT)}</span></div>
          <div class="r-item"><span class="lbl">Actual Travel Time</span><span class="val">${PenUtils.formatHours(result.actualTT)}</span></div>
          <div class="r-item ${dtClass}"><span class="lbl">Delayed Time (DT)</span><span class="val">${result.dt != null ? PenUtils.formatHours(result.dt) : '—'}</span></div>
          <div class="r-item"><span class="lbl">Rate Used</span><span class="val">${PenUtils.formatMoney(result.rate)} <small>${PenUtils.escapeHtml(result.rateSource || '')}</small></span></div>
          <div class="r-item full"><span class="lbl">Rate Note</span><span class="val">${PenUtils.escapeHtml(result.rateNote || result.matchedRoute || '—')}${result.matchedSupplier ? ' · ' + PenUtils.escapeHtml(result.matchedSupplier) : ''}</span></div>
          <div class="r-item full rule"><span class="lbl">Rule Applied</span><span class="val">${PenUtils.escapeHtml(result.rule)}</span></div>
          <div class="r-item full penalty-line"><span class="lbl">Penalty / Deduction</span><span class="val big">${PenUtils.formatMoney(result.penalty)}</span></div>
        </div>
      </div>
    `;
  }

  /* ---------- Multi-entry list (basic info) + click for detail ---------- */
  function renderMultiResults(results) {
    multiResults = results || [];
    activeDetailIdx = -1;

    const summaryEl = document.getElementById('multiSummary');
    const listCard = document.getElementById('multiListCard');
    const listEl = document.getElementById('multiList');
    const detailEl = document.getElementById('multiDetail');
    const metricsEl = document.getElementById('multiMetrics');

    if (!results || !results.length) {
      if (summaryEl) summaryEl.classList.add('hidden');
      if (listCard) listCard.classList.add('hidden');
      if (detailEl) detailEl.classList.add('hidden');
      return;
    }

    const summary = PenCalculator.grandTotal(results);
    if (metricsEl) {
      metricsEl.innerHTML = `
        <div class="metric"><div class="m-val">${summary.trips}</div><div class="m-lbl">Total Trips</div></div>
        <div class="metric late"><div class="m-val">${summary.late}</div><div class="m-lbl">Late Trips</div></div>
        <div class="metric ontime"><div class="m-val">${summary.onTime}</div><div class="m-lbl">On-Time / Early</div></div>
        <div class="metric penalty"><div class="m-val">${PenUtils.formatMoney(summary.penalty)}</div><div class="m-lbl">Total Penalties</div></div>
      `;
    }
    if (summaryEl) summaryEl.classList.remove('hidden');
    if (listCard) listCard.classList.remove('hidden');
    if (detailEl) detailEl.classList.add('hidden');

    if (listEl) {
      listEl.innerHTML = `
        <div class="multi-list-header">
          <span>#</span><span>Route</span><span>Supplier</span><span style="text-align:right">Rate Used</span><span style="text-align:right">Deduction</span>
        </div>
        ${results.map((r, i) => {
          const penCls = r.penalty > 0 ? 'has-pen' : 'no-pen';
          return `<div class="multi-row ${penCls}" data-idx="${i}" role="button" tabindex="0">
            <span class="mr-num">${i + 1}</span>
            <span class="mr-route">${PenUtils.escapeHtml(r.route || '—')}</span>
            <span class="mr-sup" title="${PenUtils.escapeHtml(r.supplier || '')}">${PenUtils.escapeHtml(r.supplier || '—')}</span>
            <span class="mr-rate">${PenUtils.formatMoney(r.rate)}</span>
            <span class="mr-pen">${PenUtils.formatMoney(r.penalty)}</span>
          </div>`;
        }).join('')}
      `;

      listEl.querySelectorAll('.multi-row').forEach(row => {
        row.addEventListener('click', () => showMultiDetail(+row.dataset.idx));
        row.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            showMultiDetail(+row.dataset.idx);
          }
        });
      });
    }
  }

  function showMultiDetail(idx) {
    const r = multiResults[idx];
    if (!r) return;
    activeDetailIdx = idx;

    document.querySelectorAll('.multi-row').forEach((row, i) => {
      row.classList.toggle('active', i === idx);
    });

    const detailEl = document.getElementById('multiDetail');
    const body = document.getElementById('multiDetailBody');
    if (detailEl && body) {
      body.innerHTML = buildDetailHtml(r, `Entry #${idx + 1}`);
      detailEl.classList.remove('hidden');
      detailEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }

  function closeMultiDetail() {
    activeDetailIdx = -1;
    document.querySelectorAll('.multi-row').forEach(row => row.classList.remove('active'));
    document.getElementById('multiDetail')?.classList.add('hidden');
  }

  /* ---------- Rate search ---------- */
  function renderRateSearch(query) {
    const box = document.getElementById('rateSearchResults');
    const clearBtn = document.getElementById('btnClearSearch');
    if (!box) return;

    const q = (query || '').trim().toLowerCase();
    if (!q) {
      box.classList.add('hidden');
      box.innerHTML = '';
      clearBtn?.classList.add('hidden');
      return;
    }
    clearBtn?.classList.remove('hidden');

    const vis = PenRates.getAllVisMin().filter(v => {
      const route = (v.route || '').toLowerCase();
      const sup = (v.supplier || '').toLowerCase();
      const city = (v.city || '').toLowerCase();
      const region = (v.region || '').toLowerCase();
      return route.includes(q) || sup.includes(q) || city.includes(q) || region.includes(q);
    });

    const luz = (typeof PenRates.getAllLuzon === 'function' ? PenRates.getAllLuzon() : []).filter(v => {
      const route = (v.route || '').toLowerCase();
      const sup = (v.supplier || '').toLowerCase();
      const city = (v.city || '').toLowerCase();
      return route.includes(q) || sup.includes(q) || city.includes(q) || 'luzon'.includes(q);
    });

    const loc = PenRates.getAllLocal().filter(l => {
      const branch = (l.branch || '').toLowerCase();
      const code = (l.branchCode || '').toLowerCase();
      const dc = (l.dc || '').toLowerCase();
      const dcCode = String(l.dcCode || '').toLowerCase();
      const region = (l.region || '').toLowerCase();
      return branch.includes(q) || code.includes(q) || dc.includes(q) || dcCode.includes(q) || region.includes(q);
    });

    let html = '';
    if (vis.length) {
      html += `<h4>VisMin (${vis.length} match${vis.length > 1 ? 'es' : ''})</h4>`;
      html += vis.slice(0, 40).map(v => `
        <div class="rate-hit">
          <span class="rh-route">${PenUtils.escapeHtml(v.route)}</span>
          <span class="rh-sup">${PenUtils.escapeHtml(v.supplier)}</span>
          <span class="rh-city">${PenUtils.escapeHtml(v.region)} · ${PenUtils.escapeHtml(v.city)}</span>
          <span class="rh-price">${PenUtils.formatMoney(v.effectivePrice)}</span>
          <span class="rh-back">${v.backloadRate != null ? 'BL ' + PenUtils.formatMoney(v.backloadRate) : '—'}</span>
        </div>
      `).join('');
      if (vis.length > 40) html += `<div class="no-hits">… and ${vis.length - 40} more</div>`;
    }
    if (luz.length) {
      html += `<h4 style="margin-top:14px;">Local Luzon (${luz.length} match${luz.length > 1 ? 'es' : ''})</h4>`;
      html += luz.slice(0, 40).map(v => `
        <div class="rate-hit local-hit">
          <span class="rh-route">${PenUtils.escapeHtml(v.route)}</span>
          <span class="rh-sup">${PenUtils.escapeHtml(v.supplier)}</span>
          <span class="rh-city">Luzon · ${PenUtils.escapeHtml(v.city || '')}</span>
          <span class="rh-price">${PenUtils.formatMoney(v.rate)}</span>
          <span class="rh-back">${PenUtils.escapeHtml(v.truckSize || '')}</span>
        </div>
      `).join('');
    }
    if (loc.length) {
      html += `<h4 style="margin-top:14px;">Local Branch (${loc.length} match${loc.length > 1 ? 'es' : ''})</h4>`;
      html += loc.slice(0, 30).map(l => {
        let rateStr = '';
        if (typeof l.rate === 'object' && l.rate) {
          rateStr = PenUtils.formatMoney(l.rate.a) + ' / ' + PenUtils.formatMoney(l.rate.b);
        } else {
          rateStr = PenUtils.formatMoney(l.rate);
        }
        return `<div class="rate-hit local-hit">
          <span class="rh-route">${PenUtils.escapeHtml(l.dcCode)}</span>
          <span class="rh-sup">${PenUtils.escapeHtml(l.branch)} (${PenUtils.escapeHtml(l.branchCode)})</span>
          <span class="rh-city">${PenUtils.escapeHtml(l.region)} · ${PenUtils.escapeHtml(l.dc)}</span>
          <span class="rh-price">${rateStr}</span>
        </div>`;
      }).join('');
      if (loc.length > 30) html += `<div class="no-hits">… and ${loc.length - 30} more</div>`;
    }
    if (!vis.length && !luz.length && !loc.length) {
      html = `<div class="no-hits">No rates found for “${PenUtils.escapeHtml(query)}”</div>`;
    }

    box.innerHTML = html;
    box.classList.remove('hidden');
  }

  /* ---------- Date helpers ---------- */
  let allBatchResults = [];
  let filteredBatchResults = [];
  let currentDfMode = 'all';

  function toDateKey(val) {
    if (val == null || val === '') return '';
    if (val instanceof Date && !isNaN(val)) {
      return val.getFullYear() + '-' + String(val.getMonth() + 1).padStart(2, '0') + '-' + String(val.getDate()).padStart(2, '0');
    }
    const s = String(val).trim();
    // already YYYY-MM-DD
    const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return m[1] + '-' + m[2] + '-' + m[3];
    // Excel serial
    const n = parseFloat(s);
    if (!isNaN(n) && n > 30000 && n < 60000) {
      const d = new Date(Math.round((n - 25569) * 86400 * 1000));
      if (!isNaN(d)) return toDateKey(d);
    }
    const d2 = new Date(s);
    if (!isNaN(d2)) return toDateKey(d2);
    return '';
  }

  function weekKey(dateKey) {
    if (!dateKey) return '';
    const [y, m, d] = dateKey.split('-').map(Number);
    const dt = new Date(y, m - 1, d);
    // ISO-ish week start Monday
    const day = (dt.getDay() + 6) % 7;
    const monday = new Date(dt);
    monday.setDate(dt.getDate() - day);
    return toDateKey(monday);
  }

  function monthKey(dateKey) {
    return dateKey ? dateKey.slice(0, 7) : '';
  }

  function collectDateMeta(results) {
    const days = new Set();
    results.forEach(r => {
      const k = toDateKey(r.date);
      if (k) days.add(k);
    });
    const sorted = [...days].sort();
    const weeks = [...new Set(sorted.map(weekKey))].sort();
    const months = [...new Set(sorted.map(monthKey))].sort();
    return { days: sorted, weeks, months };
  }

  function populateDateFilters(results) {
    const meta = collectDateMeta(results);
    const daySel = document.getElementById('dfDaySelect');
    const weekSel = document.getElementById('dfWeekSelect');
    const monthSel = document.getElementById('dfMonthSelect');
    const pickList = document.getElementById('dfPickList');

    if (daySel) {
      daySel.innerHTML = meta.days.map(d => `<option value="${d}">${d}</option>`).join('') || '<option value="">—</option>';
    }
    if (weekSel) {
      weekSel.innerHTML = meta.weeks.map(w => {
        const end = new Date(w + 'T12:00:00');
        end.setDate(end.getDate() + 6);
        const endKey = toDateKey(end);
        return `<option value="${w}">Week of ${w} → ${endKey}</option>`;
      }).join('') || '<option value="">—</option>';
    }
    if (monthSel) {
      monthSel.innerHTML = meta.months.map(m => `<option value="${m}">${m}</option>`).join('') || '<option value="">—</option>';
    }
    if (pickList) {
      pickList.innerHTML = meta.days.map(d =>
        `<label class="df-pick-item"><input type="checkbox" value="${d}"><span>${d}</span></label>`
      ).join('') || '<span class="df-status">No dates</span>';
      pickList.querySelectorAll('.df-pick-item').forEach(lab => {
        lab.addEventListener('click', (e) => {
          if (e.target.tagName === 'INPUT') return;
          const cb = lab.querySelector('input');
          cb.checked = !cb.checked;
          lab.classList.toggle('selected', cb.checked);
        });
        lab.querySelector('input')?.addEventListener('change', () => {
          lab.classList.toggle('selected', lab.querySelector('input').checked);
        });
      });
    }
    // range defaults
    if (meta.days.length) {
      const from = document.getElementById('dfRangeFrom');
      const to = document.getElementById('dfRangeTo');
      if (from) from.value = meta.days[0];
      if (to) to.value = meta.days[meta.days.length - 1];
    }
  }

  function setDfMode(mode) {
    currentDfMode = mode || 'all';
    document.querySelectorAll('.df-mode').forEach(b => {
      b.classList.toggle('active', b.getAttribute('data-df') === currentDfMode);
    });
    ['day', 'week', 'month', 'range', 'pick'].forEach(m => {
      const panel = document.getElementById('dfPanel' + m.charAt(0).toUpperCase() + m.slice(1));
      // ids: dfPanelDay, dfPanelWeek, dfPanelMonth, dfPanelRange, dfPanelPick
    });
    const map = {
      all: null,
      day: 'dfPanelDay',
      week: 'dfPanelWeek',
      month: 'dfPanelMonth',
      range: 'dfPanelRange',
      pick: 'dfPanelPick'
    };
    Object.values(map).forEach(id => {
      if (!id) return;
      document.getElementById(id)?.classList.add('hidden');
    });
    if (map[currentDfMode]) {
      document.getElementById(map[currentDfMode])?.classList.remove('hidden');
    }
  }

  function applyDateFilter() {
    let filtered = allBatchResults.slice();
    let status = 'Showing all dates';

    if (currentDfMode === 'day') {
      const day = document.getElementById('dfDaySelect')?.value;
      filtered = filtered.filter(r => toDateKey(r.date) === day);
      status = day ? `Day: ${day}` : status;
    } else if (currentDfMode === 'week') {
      const wk = document.getElementById('dfWeekSelect')?.value;
      filtered = filtered.filter(r => weekKey(toDateKey(r.date)) === wk);
      status = wk ? `Week of ${wk}` : status;
    } else if (currentDfMode === 'month') {
      const mo = document.getElementById('dfMonthSelect')?.value;
      filtered = filtered.filter(r => monthKey(toDateKey(r.date)) === mo);
      status = mo ? `Month: ${mo}` : status;
    } else if (currentDfMode === 'range') {
      const from = document.getElementById('dfRangeFrom')?.value || '';
      const to = document.getElementById('dfRangeTo')?.value || '';
      filtered = filtered.filter(r => {
        const k = toDateKey(r.date);
        if (!k) return false;
        if (from && k < from) return false;
        if (to && k > to) return false;
        return true;
      });
      status = `Range: ${from || '…'} → ${to || '…'}`;
    } else if (currentDfMode === 'pick') {
      const picked = [...document.querySelectorAll('#dfPickList input:checked')].map(cb => cb.value);
      if (picked.length) {
        const set = new Set(picked);
        filtered = filtered.filter(r => set.has(toDateKey(r.date)));
        status = `Picked ${picked.length} date(s)`;
      } else {
        status = 'No dates picked — showing all';
      }
    }

    filteredBatchResults = filtered;
    const statusEl = document.getElementById('dfStatus');
    if (statusEl) statusEl.textContent = `${status} · ${filtered.length} trip(s)`;
    paintBatch(filtered);
  }

  function clearDateFilter() {
    currentDfMode = 'all';
    setDfMode('all');
    filteredBatchResults = allBatchResults.slice();
    const statusEl = document.getElementById('dfStatus');
    if (statusEl) statusEl.textContent = `Showing all dates · ${allBatchResults.length} trip(s)`;
    paintBatch(allBatchResults);
  }

  function paintBatch(results) {
    lastResults = results || [];
    const summary = PenCalculator.grandTotal(results);
    const bySup = PenCalculator.summaryBySupplier(results);

    const metricsEl = document.getElementById('batchMetrics');
    if (metricsEl) {
      metricsEl.innerHTML = `
        <div class="metric"><div class="m-val">${summary.trips}</div><div class="m-lbl">Total Trips</div></div>
        <div class="metric late"><div class="m-val">${summary.late}</div><div class="m-lbl">Late Trips</div></div>
        <div class="metric ontime"><div class="m-val">${summary.onTime}</div><div class="m-lbl">On-Time / Early</div></div>
        <div class="metric penalty"><div class="m-val">${PenUtils.formatMoney(summary.penalty)}</div><div class="m-lbl">Total Penalties</div></div>
      `;
    }

    const supBody = document.querySelector('#supSummaryTable tbody');
    if (supBody) {
      if (!bySup.length) {
        supBody.innerHTML = '<tr><td colspan="5" class="empty">No data</td></tr>';
      } else {
        supBody.innerHTML = bySup.map(s => `
          <tr>
            <td>${PenUtils.escapeHtml(s.supplier)}</td>
            <td class="num">${s.trips}</td>
            <td class="num">${s.lateTrips}</td>
            <td class="num">${s.onTime}</td>
            <td class="num money">${PenUtils.formatMoney(s.totalPenalty)}</td>
          </tr>
        `).join('');
      }
    }

    const detBody = document.querySelector('#detailTable tbody');
    if (detBody) {
      if (!results.length) {
        detBody.innerHTML = '<tr><td colspan="11" class="empty">No rows</td></tr>';
      } else {
        detBody.innerHTML = results.map((r, i) => {
          const dtCls = r.dt > 0 ? 'late' : (r.dt < 0 ? 'early' : '');
          const penCls = r.penalty > 0 ? 'has-pen' : '';
          const dateStr = toDateKey(r.date) || (r.date || '');
          const st = String(r.status || '').toLowerCase();
          const stCls = st === 'disputed' ? 'status-disputed' : (st === 'broken' ? 'status-broken' : (st === 'penalty' ? 'status-penalty' : ''));
          return `<tr class="${penCls}">
            <td>${PenUtils.escapeHtml(r.id || (i + 1))}</td>
            <td>${PenUtils.escapeHtml(dateStr)}</td>
            <td>${PenUtils.escapeHtml(r.route)}</td>
            <td>${PenUtils.escapeHtml(r.supplier)}</td>
            <td class="${stCls}">${PenUtils.escapeHtml(r.status || '—')}</td>
            <td class="num">${PenUtils.formatHours(r.planTT)}</td>
            <td class="num">${PenUtils.formatHours(r.actualTT)}</td>
            <td class="num ${dtCls}">${r.dt != null ? PenUtils.formatHours(r.dt) : '—'}</td>
            <td class="num">${PenUtils.formatMoney(r.rate)}</td>
            <td class="num money">${PenUtils.formatMoney(r.penalty)}</td>
            <td class="rule-cell" title="${PenUtils.escapeHtml(r.rule)}">${PenUtils.escapeHtml(r.rule)}</td>
          </tr>`;
        }).join('');
      }
    }
  }

  /* ---------- Batch (Excel upload) ---------- */
  function renderBatch(results) {
    allBatchResults = results || [];
    filteredBatchResults = allBatchResults.slice();
    populateDateFilters(allBatchResults);
    setDfMode('all');
    const statusEl = document.getElementById('dfStatus');
    if (statusEl) statusEl.textContent = `Showing all dates · ${allBatchResults.length} trip(s)`;
    paintBatch(allBatchResults);
    showResults();
    showMainPanel('batch');
  }

  function showMainPanel(id) {
    document.querySelectorAll('.pen-main-panel').forEach(p => p.classList.add('hidden'));
    document.querySelectorAll('.pen-main-tab').forEach(b => {
      b.classList.toggle('active', b.getAttribute('data-main') === id);
    });
    const map = { manual: 'penMainManual', batch: 'penMainBatch', rates: 'penMainRates' };
    const el = document.getElementById(map[id] || 'penMainManual');
    if (el) el.classList.remove('hidden');
    if (id === 'rates') renderRateReference();
  }

  function toggleRulesPopover(force) {
    const pop = document.getElementById('rulesPopover');
    if (!pop) return;
    if (force === true) pop.classList.remove('hidden');
    else if (force === false) pop.classList.add('hidden');
    else pop.classList.toggle('hidden');
  }

  function showMode(mode) {
    document.querySelectorAll('.mode-tab').forEach(t => {
      t.classList.toggle('active', t.getAttribute('data-mode') === mode);
    });
    document.getElementById('manualSingle')?.classList.toggle('hidden', mode !== 'single');
    document.getElementById('manualMulti')?.classList.toggle('hidden', mode !== 'multi');
  }

  function renderRateReference() {
    const visBody = document.querySelector('#visminRateTable tbody');
    if (visBody && !visBody.dataset.loaded) {
      const rows = PenRates.getAllVisMin();
      visBody.innerHTML = rows.map(v => `
        <tr>
          <td>${PenUtils.escapeHtml(v.region)}</td>
          <td>${PenUtils.escapeHtml(v.city)}</td>
          <td><strong>${PenUtils.escapeHtml(v.route)}</strong></td>
          <td>${PenUtils.escapeHtml(v.supplier)}</td>
          <td class="num">${PenUtils.formatMoney(v.effectivePrice)}</td>
          <td class="num">${v.backloadRate != null ? PenUtils.formatMoney(v.backloadRate) : '—'}</td>
        </tr>
      `).join('');
      visBody.dataset.loaded = '1';
    }
    const luzBody = document.querySelector('#luzonRateTable tbody');
    if (luzBody && !luzBody.dataset.loaded && typeof PenRates.getAllLuzon === 'function') {
      const rows = PenRates.getAllLuzon();
      luzBody.innerHTML = rows.map(v => `
        <tr>
          <td>${PenUtils.escapeHtml(v.city || '')}</td>
          <td><strong>${PenUtils.escapeHtml(v.route)}</strong></td>
          <td>${PenUtils.escapeHtml(v.supplier)}</td>
          <td>${PenUtils.escapeHtml(v.truckSize || '')}</td>
          <td class="num">${PenUtils.formatMoney(v.rate)}</td>
        </tr>
      `).join('');
      luzBody.dataset.loaded = '1';
    }
    const locBody = document.querySelector('#localRateTable tbody');
    if (locBody && !locBody.dataset.loaded) {
      const rows = PenRates.getAllLocal();
      locBody.innerHTML = rows.map(l => {
        let rateStr = '';
        if (typeof l.rate === 'object' && l.rate) {
          rateStr = PenUtils.formatMoney(l.rate.a) + ' / ' + PenUtils.formatMoney(l.rate.b);
        } else {
          rateStr = PenUtils.formatMoney(l.rate);
        }
        return `<tr>
          <td>${PenUtils.escapeHtml(l.region)}</td>
          <td>${PenUtils.escapeHtml(l.dc)} (${l.dcCode})</td>
          <td>${PenUtils.escapeHtml(l.branch)}</td>
          <td>${PenUtils.escapeHtml(l.branchCode)}</td>
          <td class="num">${rateStr}</td>
        </tr>`;
      }).join('');
      locBody.dataset.loaded = '1';
    }
  }

  function exportResults(fromMulti) {
    const dataSrc = fromMulti ? multiResults : lastResults;
    if (!dataSrc.length) {
      alert('No results to export.');
      return;
    }
    const headers = ['ID', 'Date', 'Route', 'Supplier', 'Status', 'Plan TT (hrs)', 'Actual TT (hrs)', 'DT (hrs)', 'Rate', 'Penalty', 'Rule', 'Rate Source'];
    const data = dataSrc.map((r, i) => [
      r.id || (i + 1), r.date, r.route, r.supplier, r.status || '',
      r.planTT != null ? +r.planTT.toFixed(4) : '',
      r.actualTT != null ? +r.actualTT.toFixed(4) : '',
      r.dt != null ? +r.dt.toFixed(4) : '',
      r.rate, r.penalty, r.rule, r.rateSource
    ]);
    const ws = XLSX.utils.aoa_to_sheet([headers, ...data]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Penalties');
    const bySup = PenCalculator.summaryBySupplier(dataSrc);
    const sumData = [['Supplier', 'Trips', 'Late', 'On-Time', 'Total Penalty'], ...bySup.map(s => [s.supplier, s.trips, s.lateTrips, s.onTime, s.totalPenalty])];
    const ws2 = XLSX.utils.aoa_to_sheet(sumData);
    XLSX.utils.book_append_sheet(wb, ws2, 'By Supplier');
    XLSX.writeFile(wb, 'SLU_Penalties_' + new Date().toISOString().slice(0, 10) + '.xlsx');
  }

  function getLastResults() { return lastResults; }
  function getMultiResults() { return multiResults; }

  return {
    renderManualResult,
    renderMultiResults,
    showMultiDetail,
    closeMultiDetail,
    renderRateSearch,
    renderBatch,
    showMainPanel,
    showMode,
    renderRateReference,
    exportResults,
    getLastResults,
    getMultiResults,
    showResults,
    setDfMode,
    applyDateFilter,
    clearDateFilter,
    toggleRulesPopover
  };
})();
