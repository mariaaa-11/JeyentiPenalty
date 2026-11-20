  /* ==========================================================================
     MODULE: PEN APP — Penalties Analyzer coordinator
     ========================================================================== */
  const PenApp = (() => {
    function init() {
      // main tabs
      document.querySelectorAll('.pen-main-tab').forEach(btn => {
        btn.addEventListener('click', () => {
          PenUIManager.showMainPanel(btn.getAttribute('data-main'));
        });
      });
  
      // single / multi mode
      document.querySelectorAll('.mode-tab').forEach(btn => {
        btn.addEventListener('click', () => {
          PenUIManager.showMode(btn.getAttribute('data-mode'));
        });
      });
  
      // single form
      const form = document.getElementById('manualForm');
      if (form) {
        form.addEventListener('submit', (e) => {
          e.preventDefault();
          runManual();
        });
      }
      document.getElementById('btnManualCalc')?.addEventListener('click', runManual);
      document.getElementById('btnManualClear')?.addEventListener('click', () => {
        form?.reset();
        PenUIManager.renderManualResult(null);
        const prev = document.getElementById('ratePreview');
        if (prev) prev.textContent = 'Enter route to preview matched rate';
      });
  
      // live rate preview on single form
      ['inputRoute', 'inputSupplier', 'inputForceBack'].forEach(id => {
        document.getElementById(id)?.addEventListener('change', previewRate);
        document.getElementById(id)?.addEventListener('input', previewRate);
      });
  
      // multi paste
      document.getElementById('btnMultiCalc')?.addEventListener('click', runMulti);
      document.getElementById('btnMultiClear')?.addEventListener('click', () => {
        const ta = document.getElementById('multiPasteArea');
        if (ta) ta.value = '';
        PenUIManager.renderMultiResults([]);
      });
      document.getElementById('btnCloseDetail')?.addEventListener('click', () => PenUIManager.closeMultiDetail());
      document.getElementById('btnMultiExport')?.addEventListener('click', () => PenUIManager.exportResults(true));
  
      // rate search
      const searchInput = document.getElementById('rateSearchInput');
      document.getElementById('btnRateSearch')?.addEventListener('click', () => {
        PenUIManager.renderRateSearch(searchInput?.value);
      });
      document.getElementById('btnClearSearch')?.addEventListener('click', () => {
        if (searchInput) searchInput.value = '';
        PenUIManager.renderRateSearch('');
      });
      searchInput?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          PenUIManager.renderRateSearch(searchInput.value);
        }
      });
      // optional: live search after short pause
      let searchTimer = null;
      searchInput?.addEventListener('input', () => {
        clearTimeout(searchTimer);
        searchTimer = setTimeout(() => {
          if (searchInput.value.trim().length >= 2) {
            PenUIManager.renderRateSearch(searchInput.value);
          } else if (!searchInput.value.trim()) {
            PenUIManager.renderRateSearch('');
          }
        }, 280);
      });
  
      // upload
      const dropZone = document.getElementById('dropZone');
      const fileInput = document.getElementById('fileInput');
      if (dropZone && fileInput) {
        dropZone.addEventListener('click', () => fileInput.click());
        dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.classList.add('dragover'); });
        dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));
        dropZone.addEventListener('drop', (e) => {
          e.preventDefault();
          dropZone.classList.remove('dragover');
          if (e.dataTransfer.files.length) handleFile(e.dataTransfer.files[0]);
        });
        fileInput.addEventListener('change', () => {
          if (fileInput.files.length) handleFile(fileInput.files[0]);
        });
      }
  
      document.getElementById('btnExport')?.addEventListener('click', () => PenUIManager.exportResults(false));
  
      // datalists
      const dl = document.getElementById('supplierList');
      if (dl) {
        PenRates.listSuppliers().forEach(s => {
          const opt = document.createElement('option');
          opt.value = s;
          dl.appendChild(opt);
        });
      }
      const routeDl = document.getElementById('routeList');
      if (routeDl) {
        PenRates.listVisMinRoutes().forEach(r => {
          const opt = document.createElement('option');
          opt.value = r;
          routeDl.appendChild(opt);
        });
      }
  
      PenUIManager.showMainPanel('manual');
      PenUIManager.showMode('single');
    }
  
    function previewRate() {
      const route = document.getElementById('inputRoute')?.value || '';
      const supplier = document.getElementById('inputSupplier')?.value || '';
      const force = document.getElementById('inputForceBack')?.checked;
      const info = PenRates.findRate(route, supplier, force || undefined);
      const el = document.getElementById('ratePreview');
      if (!el) return;
      if (!route) {
        el.textContent = 'Enter route to preview matched rate';
        return;
      }
      if (info.rate != null) {
        el.innerHTML = `Matched: <strong>${PenUtils.formatMoney(info.rate)}</strong> (${info.source}) — ${PenUtils.escapeHtml(info.note || '')} ${info.matchedSupplier ? '· ' + PenUtils.escapeHtml(info.matchedSupplier) : ''}`;
      } else {
        el.textContent = info.note || 'No rate found';
      }
    }
  
    function runManual() {
      const route = document.getElementById('inputRoute')?.value?.trim() || '';
      const supplier = document.getElementById('inputSupplier')?.value?.trim() || '';
      const planTT = document.getElementById('inputPlanTT')?.value;
      const actualTT = document.getElementById('inputActualTT')?.value;
      const rateOverride = document.getElementById('inputRateOverride')?.value;
      const forceBack = document.getElementById('inputForceBack')?.checked;
  
      if (!route && !planTT) {
        alert('Please enter at least Route and Plan / Actual travel times.');
        return;
      }
      const result = PenCalculator.computeOne({
        route, supplier, planTT, actualTT,
        rateOverride: rateOverride || null,
        forceBackload: forceBack
      });
      PenUIManager.renderManualResult(result);
    }
  
    /**
     * Parse multi-line paste.
     * Accepts separators: |  ,  tab
     * Columns (in order): Route | Actual TT | Plan TT | Trucker [, Rate]
     */
    function parseMultiPaste(text) {
      const lines = String(text || '').split(/\r?\n/).map(l => l.trim()).filter(Boolean);
      const rows = [];
      for (const line of lines) {
        // skip header-like lines
        const lower = line.toLowerCase();
        if (lower.startsWith('route') && (lower.includes('actual') || lower.includes('plan') || lower.includes('trucker') || lower.includes('supplier'))) continue;

        let parts;
        if (line.includes('|')) {
          parts = line.split('|').map(p => p.trim());
        } else if (line.includes('\t')) {
          parts = line.split('\t').map(p => p.trim());
        } else {
          parts = line.split(',').map(p => p.trim());
        }
        if (parts.length < 3) continue;

        // Order: Route | Actual TT | Plan TT | Trucker [, Rate]
        const route = parts[0] || '';
        const actualTT = parts[1] || '';
        const planTT = parts[2] || '';
        const supplier = parts[3] || '';
        let rateOverride = null;
        if (parts[4] != null && parts[4] !== '') {
          const n = parseFloat(String(parts[4]).replace(/,/g, ''));
          if (!isNaN(n)) rateOverride = n;
        }
        if (!route && !planTT && !actualTT) continue;
        rows.push({ route, supplier, planTT, actualTT, rateOverride });
      }
      return rows;
    }

    function runMulti() {
      const text = document.getElementById('multiPasteArea')?.value || '';
      const rows = parseMultiPaste(text);
      if (!rows.length) {
        alert('No valid lines found. Use format:\nRoute | Actual TT | Plan TT | Trucker\n(one per line)');
        return;
      }
      const results = PenCalculator.computeBatch(rows);
      PenUIManager.renderMultiResults(results);
    }
  
    async function handleFile(file) {
      if (!file) return;
      const loading = document.getElementById('loading');
      const results = document.getElementById('results');
      if (loading) loading.classList.remove('hidden');
      if (results) results.classList.add('hidden');
      try {
        const { rows, count, fileName } = await PenFileProcessor.processFile(file);
        if (!count) {
          alert('No usable rows found in the file.');
          if (loading) loading.classList.add('hidden');
          return;
        }
        const computed = PenCalculator.computeBatch(rows);
        const info = document.getElementById('fileInfo');
        if (info) info.textContent = `${fileName} · ${count} trips processed`;
        PenUIManager.renderBatch(computed);
      } catch (err) {
        console.error(err);
        alert('Error processing file: ' + err.message);
      } finally {
        if (loading) loading.classList.add('hidden');
      }
    }
  
    return { init, runManual, runMulti, handleFile };
  })();
  
  document.addEventListener('DOMContentLoaded', () => PenApp.init());
