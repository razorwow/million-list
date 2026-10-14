const DEFAULTS = {
  normalMs: 1000,
  addMs: 10000,
  graceMs: 30,
};

function readInterval(value, fallback) {
  const n = Number.parseInt(value ?? '', 10);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

class Lane {
  constructor(name, interval, graceMs) {
    this.name = name;
    this.interval = interval;
    this.graceMs = graceMs;
    this.pending = new Map();
    this.timer = null;
    this.lastFlush = 0;
    this.flushes = 0;
    this.deduped = 0;
    this.applied = 0;
    this.lastBatchSize = 0;
  }
}

export function createBus(options = {}) {
  const normalMs = readInterval(process.env.BATCH_NORMAL_MS ?? options.normalMs, DEFAULTS.normalMs);
  const addMs = readInterval(process.env.BATCH_ADD_MS ?? options.addMs, DEFAULTS.addMs);
  const graceMs = readInterval(process.env.BATCH_GRACE_MS ?? options.graceMs, DEFAULTS.graceMs);

  const lanes = {
    normal: new Lane('normal', normalMs, graceMs),
    add: new Lane('add', addMs, graceMs),
  };

  function schedule(lane) {
    if (lane.timer !== null) return;
    const now = Date.now();
    const earliest = lane.lastFlush + lane.interval;
    const delay = now >= earliest ? lane.graceMs : Math.max(0, earliest - now);
    lane.timer = setTimeout(() => flushLane(lane), delay);
  }

  function flushLane(lane) {
    if (lane.timer !== null) {
      clearTimeout(lane.timer);
      lane.timer = null;
    }
    if (lane.pending.size === 0) return;

    const batch = lane.pending;
    lane.pending = new Map();
    lane.lastFlush = Date.now();
    lane.flushes += 1;
    lane.applied += batch.size;
    lane.lastBatchSize = batch.size;

    for (const entry of batch.values()) {
      let result;
      try {
        result = entry.fn();
      } catch (error) {
        for (const resolver of entry.resolvers) resolver.reject(error);
        continue;
      }
      for (const resolver of entry.resolvers) resolver.resolve(result);
    }
  }

  function enqueue(laneName, key, fn) {
    const lane = lanes[laneName];
    if (!lane) throw new Error(`unknown lane: ${laneName}`);

    return new Promise((resolve, reject) => {
      const existing = lane.pending.get(key);
      if (existing) {
        lane.deduped += 1;
        existing.resolvers.push({ resolve, reject });
        return;
      }
      lane.pending.set(key, { fn, resolvers: [{ resolve, reject }] });
      schedule(lane);
    });
  }

  function flushAll() {
    flushLane(lanes.normal);
    flushLane(lanes.add);
  }

  function stats() {
    const result = { config: { normalMs, addMs, graceMs }, lanes: {} };
    for (const lane of Object.values(lanes)) {
      result.lanes[lane.name] = {
        intervalMs: lane.interval,
        pending: lane.pending.size,
        flushes: lane.flushes,
        applied: lane.applied,
        deduped: lane.deduped,
        lastBatchSize: lane.lastBatchSize,
      };
    }
    return result;
  }

  return { enqueue, flushAll, stats, lanes };
}
