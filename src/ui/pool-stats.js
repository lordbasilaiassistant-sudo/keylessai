// Updates the aggregator pool stats strip on the hero.
// Shows: (a) live verified endpoints + models from listAllModels(),
//        (b) upstream-tracked counts from providers/_catalog.json.

const CATALOG_URL = "./providers/_catalog.json";

export async function updatePoolStats(liveGroups) {
  try {
    const liveProviders = (liveGroups || []).filter((g) => g.models.length).length;
    const liveModels = (liveGroups || []).reduce(
      (a, g) => a + g.models.length,
      0
    );
    const $lp = document.getElementById("pool-live-providers");
    const $lm = document.getElementById("pool-live-models");
    const $tp = document.getElementById("pool-tracked-providers");
    const $tm = document.getElementById("pool-tracked-models");
    const $wrap = document.getElementById("pool-stats");
    if ($lp) $lp.textContent = String(liveProviders);
    if ($lm) $lm.textContent = String(liveModels);

    try {
      const res = await fetch(CATALOG_URL, { cache: "no-store" });
      if (res.ok) {
        const cat = await res.json();
        const providers = Object.keys(cat.providers || {}).length;
        const models = Object.values(cat.providers || {}).reduce(
          (a, arr) => a + (Array.isArray(arr) ? arr.length : 0),
          0
        );
        if ($tp) $tp.textContent = String(providers);
        if ($tm) $tm.textContent = String(models);
      }
    } catch {
      // catalog may be missing on fork without the sync workflow yet
    }

    if ($wrap) $wrap.hidden = false;
  } catch {
    // fail silent — stats are cosmetic
  }
}
