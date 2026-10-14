import { Router } from 'express';
import * as store from './store.js';
import { MAX_FILTER_LEN, PAGE_SIZE } from './constants.js';

function readInt(value, fallback, min, max) {
  const n = Number.parseInt(value ?? '', 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(Math.max(n, min), max);
}

function readFilter(value) {
  return typeof value === 'string' ? value.slice(0, MAX_FILTER_LEN) : '';
}

export function createRouter(bus) {
  const router = Router();

  router.get('/left', (req, res, next) => {
    const filter = readFilter(req.query.filter);
    const offset = readInt(req.query.offset, 0, 0, Number.MAX_SAFE_INTEGER);
    const limit = readInt(req.query.limit, PAGE_SIZE, 1, PAGE_SIZE);
    const key = `left|${filter}|${offset}|${limit}`;

    bus.enqueue('normal', key, () => store.listLeft({ filter, offset, limit })).then(
      (result) => res.json(result),
      next
    );
  });

  router.get('/right', (req, res, next) => {
    const filter = readFilter(req.query.filter);
    const offset = readInt(req.query.offset, 0, 0, Number.MAX_SAFE_INTEGER);
    const limit = readInt(req.query.limit, PAGE_SIZE, 1, PAGE_SIZE);
    const key = `right|${filter}|${offset}|${limit}`;

    bus.enqueue('normal', key, () => store.listRight({ filter, offset, limit })).then(
      (result) => res.json(result),
      next
    );
  });

  router.post('/items', (req, res, next) => {
    const id = store.normalizeId(req.body?.id);
    if (id === null) {
      res.status(400).json({ ok: false, error: 'invalid' });
      return;
    }
    const key = `add|${id}`;
    bus.enqueue('add', key, () => store.addItem(id)).then((result) => {
      res.status(result.ok ? 200 : 409).json(result);
    }, next);
  });

  router.post('/select', (req, res, next) => {
    const id = store.normalizeId(req.body?.id);
    if (id === null) {
      res.status(400).json({ ok: false, error: 'invalid' });
      return;
    }
    const key = `select|${id}`;
    bus.enqueue('normal', key, () => store.selectItem(id)).then((result) => {
      res.status(result.ok ? 200 : 404).json(result);
    }, next);
  });

  router.post('/deselect', (req, res, next) => {
    const id = store.normalizeId(req.body?.id);
    if (id === null) {
      res.status(400).json({ ok: false, error: 'invalid' });
      return;
    }
    const key = `deselect|${id}`;
    bus.enqueue('normal', key, () => store.deselectItem(id)).then((result) => {
      res.status(result.ok ? 200 : 404).json(result);
    }, next);
  });

  router.post('/reorder', (req, res, next) => {
    const id = store.normalizeId(req.body?.id);
    if (id === null) {
      res.status(400).json({ ok: false, error: 'invalid' });
      return;
    }
    const rawAnchor = req.body?.anchorId;
    const anchorId = rawAnchor === null || rawAnchor === undefined ? null : store.normalizeId(rawAnchor);
    const position = req.body?.position === 'after' ? 'after' : 'before';
    const key = `reorder|${id}|${anchorId}|${position}`;

    bus.enqueue('normal', key, () => store.reorderItem(id, anchorId, position)).then((result) => {
      res.status(result.ok ? 200 : 404).json(result);
    }, next);
  });

  return router;
}
