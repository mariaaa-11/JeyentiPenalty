/* ==========================================================================
   MODULE: PEN UTILS — shared helpers for Penalties Analyzer
   ========================================================================== */
const PenUtils = (() => {
  function pad2(n) { return String(n).padStart(2, '0'); }

  /** Parse time input to hours (decimal). Accepts:
   *  - number (already hours)
   *  - "12.5" / 12.5
   *  - "12:30" / "12:30:00"
   *  - Excel serial (fraction of day) if < 3
   *  - "12h 30m" style loosely
   */
  function parseHours(val) {
    if (val == null || val === '') return null;
    if (typeof val === 'number') {
      if (val < 3 && val > 0 && !Number.isInteger(val)) {
        // likely Excel time serial (fraction of day)
        return val * 24;
      }
      return val;
    }
    let s = String(val).trim().toLowerCase();
    if (!s) return null;
    // HH:MM or HH:MM:SS
    const colon = s.match(/^(\d+):(\d{1,2})(?::(\d{1,2}))?$/);
    if (colon) {
      const h = parseInt(colon[1], 10);
      const m = parseInt(colon[2], 10);
      const sec = colon[3] ? parseInt(colon[3], 10) : 0;
      return h + m / 60 + sec / 3600;
    }
    // 12h30m / 12 hrs 30 min
    const hm = s.match(/(\d+(?:\.\d+)?)\s*h(?:ours?)?\s*(?:(\d+(?:\.\d+)?)\s*m(?:in(?:utes?)?)?)?/);
    if (hm) {
      return parseFloat(hm[1]) + (hm[2] ? parseFloat(hm[2]) / 60 : 0);
    }
    // plain number
    const n = parseFloat(s.replace(/,/g, ''));
    if (!isNaN(n)) return n;
    return null;
  }

  function formatHours(h) {
    if (h == null || isNaN(h)) return '—';
    if (h < 0) return '0';
    const totalMin = Math.round(h * 60);
    const hrs = Math.floor(totalMin / 60);
    const mins = totalMin % 60;
    if (hrs === 0) return mins + ' min';
    if (mins === 0) return hrs + ' hr' + (hrs > 1 ? 's' : '');
    return hrs + 'h ' + mins + 'm';
  }

  function formatMoney(n) {
    if (n == null || isNaN(n)) return '—';
    return '₱' + Number(n).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function formatPct(n) {
    if (n == null || isNaN(n)) return '—';
    return (n * 100).toFixed(1) + '%';
  }

  /**
   * Core penalty rules with STATUS override:
   *  - Disputed → ₱0
   *  - Broken   → 20% of rate
   *  - Penalty  → normal travel-time rules
   *  - (blank / other) → normal travel-time rules
   */
  function computePenalty(pttHours, dtHours, rate, status) {
    const st = String(status || '').trim().toLowerCase();

    // STATUS: Disputed → no penalty
    if (st === 'disputed') {
      return { penalty: 0, rule: 'STATUS: Disputed → no penalty', category: 'disputed' };
    }

    // STATUS: Broken → 20% of rate
    if (st === 'broken') {
      if (rate == null || rate <= 0) {
        return { penalty: 0, rule: 'STATUS: Broken but no rate found for 20%', category: 'broken-no-rate' };
      }
      const pen = Math.round(rate * 0.20 * 100) / 100;
      return { penalty: pen, rule: 'STATUS: Broken → 20% of rate', category: 'broken-20pct', rateUsed: rate };
    }

    // STATUS: Penalty (or blank) → travel-time rules
    if (pttHours == null || dtHours == null) {
      return { penalty: 0, rule: 'Missing PTT or DT', category: null };
    }
    if (dtHours <= 0) {
      return { penalty: 0, rule: 'On time / early (DT ≤ 0)', category: 'on-time' };
    }

    const ptt = pttHours;
    const dt = dtHours;

    if (ptt > 12) {
      if (dt <= 2) {
        return { penalty: 3000, rule: 'PTT > 12h & DT 1min–2h → ₱3,000', category: 'long-fixed-low' };
      }
      return { penalty: 5000, rule: 'PTT > 12h & DT > 2h → ₱5,000', category: 'long-fixed-high' };
    }

    if (rate == null || rate <= 0) {
      return { penalty: 0, rule: 'PTT ≤ 12h but no rate found for % calculation', category: 'no-rate' };
    }
    if (dt <= 0.5) {
      const pen = rate * 0.02;
      return { penalty: Math.round(pen * 100) / 100, rule: 'PTT ≤ 12h & DT 1min–30min → 2% of rate', category: 'short-2pct', rateUsed: rate };
    }
    const pen = rate * 0.05;
    return { penalty: Math.round(pen * 100) / 100, rule: 'PTT ≤ 12h & DT > 30min → 5% of rate', category: 'short-5pct', rateUsed: rate };
  }

  function escapeHtml(s) {
    if (s == null) return '';
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  return {
    parseHours,
    formatHours,
    formatMoney,
    formatPct,
    computePenalty,
    escapeHtml,
    pad2
  };
})();
