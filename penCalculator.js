/* ==========================================================================
   MODULE: PEN CALCULATOR — single-trip & batch penalty computation
   ========================================================================== */
const PenCalculator = (() => {
  /**
   * Compute one trip.
   * @param {Object} input
   *   route, supplier, planTT, actualTT, rateOverride?, forceBackload?, id?, date?, notes?
   */
  function computeOne(input) {
    const planH = PenUtils.parseHours(input.planTT);
    const actualH = PenUtils.parseHours(input.actualTT);
    let dtH = null;
    if (planH != null && actualH != null) dtH = actualH - planH;

    let rateInfo = { rate: null, source: null, note: '' };
    if (input.rateOverride != null && input.rateOverride !== '' && !isNaN(parseFloat(input.rateOverride))) {
      rateInfo = {
        rate: parseFloat(input.rateOverride),
        source: 'Manual',
        note: 'User override',
        matchedRoute: input.route,
        matchedSupplier: input.supplier
      };
    } else {
      rateInfo = PenRates.findRate(input.route, input.supplier, input.forceBackload);
    }

    const pen = PenUtils.computePenalty(planH, dtH, rateInfo.rate);

    return {
      id: input.id || '',
      date: input.date || '',
      route: input.route || '',
      supplier: input.supplier || '',
      planTT: planH,
      actualTT: actualH,
      dt: dtH,
      rate: rateInfo.rate,
      rateSource: rateInfo.source,
      rateNote: rateInfo.note || '',
      matchedRoute: rateInfo.matchedRoute || '',
      matchedSupplier: rateInfo.matchedSupplier || '',
      isBackload: !!rateInfo.isBackload,
      penalty: pen.penalty,
      rule: pen.rule,
      category: pen.category,
      raw: input
    };
  }

  function computeBatch(rows) {
    return rows.map((r, i) => {
      const out = computeOne(r);
      if (!out.id) out.id = String(i + 1);
      return out;
    });
  }

  /** Aggregate by supplier */
  function summaryBySupplier(results) {
    const map = {};
    results.forEach(r => {
      const key = (r.supplier || 'Unknown').trim() || 'Unknown';
      if (!map[key]) {
        map[key] = { supplier: key, trips: 0, lateTrips: 0, totalPenalty: 0, totalRate: 0, onTime: 0 };
      }
      const m = map[key];
      m.trips++;
      if (r.dt != null && r.dt > 0) m.lateTrips++;
      else m.onTime++;
      m.totalPenalty += r.penalty || 0;
      if (r.rate) m.totalRate += r.rate;
    });
    return Object.values(map).sort((a, b) => b.totalPenalty - a.totalPenalty);
  }

  function grandTotal(results) {
    let trips = results.length;
    let late = 0, penalty = 0, onTime = 0;
    results.forEach(r => {
      if (r.dt != null && r.dt > 0) late++;
      else onTime++;
      penalty += r.penalty || 0;
    });
    return { trips, late, onTime, penalty };
  }

  return { computeOne, computeBatch, summaryBySupplier, grandTotal };
})();
