/* ==========================================================================
   MODULE: PEN FILE PROCESSOR — Excel upload for bulk penalty calculation
   Tuned for SLU 3PL PENALTY FTM files (PENALTY SUMMARY sheet)
   ========================================================================== */
const PenFileProcessor = (() => {
  let storedRows = null;
  let fileName = '';

  /**
   * Header aliases. Order within each field matters for preference when
   * mapHeaders scores exact matches higher.
   * Real file columns:
   *   route (col M), Route label (col E — last segment is time code)
   *   Actual Travel time (col N), Plan travel time (col O)
   *   vehiclerier abbreviation (col R)
   *   TASKLIST, Date, STATUS, TRUCKER
   */
  const HEADER_ALIASES = {
    // prefer clean "route" over "route label"
    route: ['route', 'trip route', 'triproute', 'lane', 'od'],
    routeLabel: ['route label', 'routelabel', 'route lbl'],
    supplier: [
      'vehiclerier abbreviation', 'vehiclerier', 'vehicle carrier abbreviation',
      'vehicle carrier', 'trucker', 'truckers', 'supplier', 'service partner',
      'sp', 'vendor', 'carrier', 'abbreviation'
    ],
    supplierAlt: ['trucker name', 'carrier name'],
    planTT: [
      'plan travel time', 'planned travel time', 'plan travel', 'ptt',
      'plan tt', 'plan time', 'planned time', 'std travel time', 'standard travel time', 'plan hours'
    ],
    actualTT: [
      'actual travel time', 'actual travel', 'att', 'actual tt',
      'actual time', 'actual hours'
    ],
    rate: ['rate', 'trip rate', 'agreed rate', 'contract rate', 'price', 'effective price', 'travel time penalty'],
    id: ['tasklist', 'task list', 'task id', 'taskid', 'trip id', 'tripid', 'waybill', 'reference', 'ref', 'id'],
    date: ['date', 'trip date', 'departure date', 'ops date', 'day'],
    // Prefer exact "STATUS" (Disputed/Penalty/Broken), not "Task status"
    status: ['status'],
    depDc: ['departure dc', 'dep dc', 'origin dc'],
    destDc: ['destination dc', 'dest dc', 'arrival dc'],
    backload: ['backload', 'is backload', 'direction', 'return']
  };

  function normalizeHeader(h) {
    return String(h || '')
      .toLowerCase()
      .replace(/[\n\r]+/g, ' ')
      .replace(/[\s_\-]+/g, ' ')
      .trim();
  }

  /** Prefer exact alias match over partial includes */
  function mapHeaders(headerRow) {
    const map = {};
    const scores = {}; // field -> best score (2=exact, 1=includes)

    headerRow.forEach((h, idx) => {
      const n = normalizeHeader(h);
      if (!n) return;
      for (const [field, aliases] of Object.entries(HEADER_ALIASES)) {
        for (const a of aliases) {
          let score = 0;
          if (n === a) score = 2;
          // status must be exact ("STATUS"), never partial match on "Task status"
          else if (field !== 'status' && (n.includes(a) || a.includes(n))) score = 1;
          if (score === 0) continue;
          if (map[field] == null || score > (scores[field] || 0)) {
            map[field] = idx;
            scores[field] = score;
          }
        }
      }
    });
    return map;
  }

  /**
   * Clean route label like "490-380-1300" → "490-380"
   * (last segment is scheduled time code HHMM when length 3–4 and all digits)
   */
  function cleanRouteLabel(label) {
    if (!label) return '';
    const s = String(label).trim().toUpperCase().replace(/\s+/g, '');
    const parts = s.split(/[-/]/).filter(Boolean);
    if (parts.length >= 3) {
      const last = parts[parts.length - 1];
      if (/^\d{3,4}$/.test(last)) {
        return parts.slice(0, -1).join('-');
      }
    }
    return parts.join('-');
  }

  function pickSheet(wb) {
    const names = wb.SheetNames || [];
    const preferred = names.find(n => /penalty\s*summary/i.test(n));
    if (preferred) return preferred;
    const withRoute = names.find(n => {
      const ws = wb.Sheets[n];
      const sample = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: false, range: 0 });
      const head = (sample[0] || []).map(c => normalizeHeader(c)).join(' ');
      return head.includes('route') && (head.includes('actual') || head.includes('plan'));
    });
    return withRoute || names[0];
  }

  function parseWorkbook(arrayBuffer) {
    const wb = XLSX.read(arrayBuffer, { type: 'array', cellDates: true });
    const sheetName = pickSheet(wb);
    const ws = wb.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: false });
    if (!data.length) throw new Error('Empty sheet');

    // find header row
    let headerIdx = 0;
    for (let i = 0; i < Math.min(15, data.length); i++) {
      const row = data[i].map(c => normalizeHeader(c));
      const joined = row.join(' ');
      if (
        (joined.includes('route') || joined.includes('route label')) &&
        (joined.includes('actual') || joined.includes('plan'))
      ) {
        headerIdx = i;
        break;
      }
    }
    const headers = data[headerIdx];
    const colMap = mapHeaders(headers);

    // require route or routeLabel + times
    if (colMap.route == null && colMap.routeLabel == null && colMap.planTT == null && colMap.actualTT == null) {
      throw new Error(
        'Could not detect required columns (route / Actual Travel time / Plan travel time / vehiclerier abbreviation). ' +
        'Headers: ' + headers.filter(Boolean).slice(0, 12).join(', ')
      );
    }

    const rows = [];
    for (let i = headerIdx + 1; i < data.length; i++) {
      const raw = data[i];
      if (!raw || raw.every(c => c === '' || c == null)) continue;

      const get = (field) => {
        const idx = colMap[field];
        return idx != null ? raw[idx] : '';
      };

      // Prefer full Route label (col E) so rate uses first → second-to-last leg rule.
      // Fallback to clean "route" column (col M).
      let route = String(get('routeLabel') || '').trim();
      if (!route) {
        route = String(get('route') || '').trim();
      }
      route = route.replace(/\s+/g, '').toUpperCase();
      // If still empty, build from Departure DC + Destination DC
      if (!route) {
        const dep = String(get('depDc') || '').trim();
        const dest = String(get('destDc') || '').trim();
        if (dep && dest) route = dep + '-' + dest;
      }

      // Prefer vehiclerier abbreviation; fallback TRUCKER / supplierAlt
      let supplier = String(get('supplier') || '').trim();
      if (!supplier) supplier = String(get('supplierAlt') || '').trim();

      const planTT = get('planTT');
      const actualTT = get('actualTT');
      if (!route && planTT === '' && actualTT === '') continue;

      // Skip pure header leftovers / totals
      if (/^(carrier|total|date)$/i.test(route)) continue;

      let forceBackload = false;
      const bl = String(get('backload') || '').toLowerCase();
      if (bl === '1' || bl === 'yes' || bl === 'true' || bl === 'backload' || bl === 'return') {
        forceBackload = true;
      }

      const rateRaw = get('rate');
      let rateOverride = null;
      if (rateRaw !== '' && rateRaw != null) {
        const n = parseFloat(String(rateRaw).replace(/,/g, ''));
        if (!isNaN(n) && n > 0) rateOverride = n;
      }

      // Optional context from Departure/Destination DC if route empty
      if (!route) {
        const dep = String(get('depDc') || '').trim();
        const dest = String(get('destDc') || '').trim();
        if (dep && dest) route = dep + '-' + dest;
      }

      rows.push({
        id: String(get('id') || ''),
        date: get('date'),
        route,
        supplier,
        planTT,
        actualTT,
        rateOverride,
        forceBackload,
        status: String(get('status') || '').trim()
      });
    }
    return { rows, sheetName, colMap, headers };
  }

  function processFile(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const { rows, sheetName, colMap } = parseWorkbook(e.target.result);
          storedRows = rows;
          fileName = file.name;
          resolve({ rows, sheetName, colMap, count: rows.length, fileName });
        } catch (err) {
          reject(err);
        }
      };
      reader.onerror = () => reject(new Error('Failed to read file'));
      reader.readAsArrayBuffer(file);
    });
  }

  function getState() {
    return { storedRows, fileName };
  }

  function clear() {
    storedRows = null;
    fileName = '';
  }

  return { processFile, getState, clear, parseWorkbook, cleanRouteLabel };
})();
