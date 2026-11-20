/* ==========================================================================
   MODULE: PEN FILE PROCESSOR — Excel upload for bulk penalty calculation
   ========================================================================== */
const PenFileProcessor = (() => {
  let storedRows = null;
  let fileName = '';

  const HEADER_ALIASES = {
    route: ['route', 'trip route', 'triproute', 'lane', 'od', 'origin-destination', 'routing'],
    // trucker column in ops file is often "vehiclerier abbreviation" (vehicle carrier abbr.)
    supplier: [
      'vehiclerier abbreviation', 'vehiclerier', 'vehicle carrier abbreviation', 'vehicle carrier',
      'supplier', 'trucker', 'truckers', 'service partner', 'sp', 'vendor', 'carrier', '3pl', 'provider',
      'abbreviation', 'truck abbr', 'carrier abbr', 'vehicle abbreviation'
    ],
    planTT: ['plan travel time', 'planned travel time', 'ptt', 'plan tt', 'plan time', 'planned time', 'std travel time', 'standard travel time', 'plan hours'],
    actualTT: ['actual travel time', 'att', 'actual tt', 'actual time', 'travel time', 'actual hours'],
    rate: ['rate', 'trip rate', 'agreed rate', 'contract rate', 'price', 'effective price'],
    id: ['id', 'task id', 'taskid', 'trip id', 'tripid', 'waybill', 'reference', 'ref'],
    date: ['date', 'trip date', 'departure date', 'ops date', 'day'],
    backload: ['backload', 'is backload', 'direction', 'return']
  };

  function normalizeHeader(h) {
    return String(h || '').toLowerCase().replace(/[\s_\-]+/g, ' ').trim();
  }

  function mapHeaders(headerRow) {
    const map = {};
    headerRow.forEach((h, idx) => {
      const n = normalizeHeader(h);
      for (const [field, aliases] of Object.entries(HEADER_ALIASES)) {
        if (aliases.some(a => n === a || n.includes(a))) {
          if (map[field] == null) map[field] = idx;
        }
      }
    });
    return map;
  }

  function parseWorkbook(arrayBuffer) {
    const wb = XLSX.read(arrayBuffer, { type: 'array', cellDates: true });
    const sheetName = wb.SheetNames[0];
    const ws = wb.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: false });
    if (!data.length) throw new Error('Empty sheet');

    // find header row (first non-empty with likely keywords)
    let headerIdx = 0;
    for (let i = 0; i < Math.min(10, data.length); i++) {
      const row = data[i].map(c => normalizeHeader(c));
      if (row.some(c => c.includes('route') || c.includes('supplier') || c.includes('trucker') || c.includes('vehiclerier') || c.includes('plan') || c.includes('actual'))) {
        headerIdx = i;
        break;
      }
    }
    const headers = data[headerIdx];
    const colMap = mapHeaders(headers);
    if (colMap.route == null && colMap.planTT == null) {
      throw new Error('Could not detect required columns (need at least Route or Plan Travel Time). Headers: ' + headers.slice(0, 8).join(', '));
    }

    const rows = [];
    for (let i = headerIdx + 1; i < data.length; i++) {
      const raw = data[i];
      if (!raw || raw.every(c => c === '' || c == null)) continue;
      const get = (field) => {
        const idx = colMap[field];
        return idx != null ? raw[idx] : '';
      };
      const route = String(get('route') || '').trim();
      const supplier = String(get('supplier') || '').trim();
      const planTT = get('planTT');
      const actualTT = get('actualTT');
      if (!route && !planTT && !actualTT) continue;

      let forceBackload = false;
      const bl = String(get('backload') || '').toLowerCase();
      if (bl === '1' || bl === 'yes' || bl === 'true' || bl === 'backload' || bl === 'return') forceBackload = true;

      const rateRaw = get('rate');
      let rateOverride = null;
      if (rateRaw !== '' && rateRaw != null) {
        const n = parseFloat(String(rateRaw).replace(/,/g, ''));
        if (!isNaN(n)) rateOverride = n;
      }

      rows.push({
        id: String(get('id') || ''),
        date: get('date'),
        route,
        supplier,
        planTT,
        actualTT,
        rateOverride,
        forceBackload
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

  return { processFile, getState, clear, parseWorkbook };
})();
