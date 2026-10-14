import assert from 'node:assert/strict';

import { createApp } from '../src/app.js';
import { createBus } from '../src/queue.js';
import { BASE_MAX } from '../src/constants.js';

let failures = 0;
let checks = 0;

async function check(name, fn) {
  checks += 1;
  try {
    await fn();
    console.log(`  ok   ${name}`);
  } catch (error) {
    failures += 1;
    console.error(`  FAIL ${name}\n       ${error.message}`);
  }
}

const bus = createBus({ normalMs: 0, addMs: 0, graceMs: 60 });
const app = createApp(bus, { distDir: '__no_frontend__' });

const server = app.listen(0);
await new Promise((resolve) => server.once('listening', resolve));
const base = `http://127.0.0.1:${server.address().port}`;

async function request(method, urlPath, body) {
  const response = await fetch(base + urlPath, {
    method,
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await response.json().catch(() => null);
  return { status: response.status, data };
}

const get = (urlPath) => request('GET', urlPath);
const post = (urlPath, body) => request('POST', urlPath, body);
const ids = (page) => page.items.map((item) => item.id);

let customAdded = 0;

try {
  console.log('\n[1] Health и конфигурация очереди');
  await check('GET /healthz отвечает ok', async () => {
    const { status, data } = await get('/healthz');
    assert.equal(status, 200);
    assert.equal(data.ok, true);
  });
  await check('интервалы батчинга по умолчанию: 1000 мс / 10000 мс', async () => {
    const fresh = createBus();
    const { config } = fresh.stats();
    assert.equal(config.normalMs, 1000, 'получение/изменение - раз в секунду');
    assert.equal(config.addMs, 10000, 'добавление - раз в 10 секунд');
    fresh.flushAll();
  });
  await check('GET /api/stats отдаёт статистику обоих лейнов', async () => {
    const { status, data } = await get('/api/stats');
    assert.equal(status, 200);
    assert.ok(data.lanes.normal, 'лейн normal');
    assert.ok(data.lanes.add, 'лейн add');
  });

  console.log('\n[2] Левый список: пагинация по 20');
  await check('первая страница - 1..20', async () => {
    const { status, data } = await get('/api/left?offset=0&limit=20');
    assert.equal(status, 200);
    assert.equal(data.items.length, 20);
    assert.equal(data.items[0].id, '1');
    assert.equal(data.items[19].id, '20');
    assert.equal(data.total, BASE_MAX);
    assert.equal(data.hasMore, true);
  });
  await check('вторая страница - 21..40', async () => {
    const { data } = await get('/api/left?offset=20&limit=20');
    assert.equal(data.items[0].id, '21');
    assert.equal(data.items[19].id, '40');
  });
  await check('limit жёстко ограничен 20 даже при запросе большего', async () => {
    const { data } = await get('/api/left?offset=0&limit=500');
    assert.equal(data.items.length, 20);
  });

  console.log('\n[3] Фильтр по ID');
  await check('фильтр 999 отдаёт совпадения порциями по 20', async () => {
    const { data } = await get('/api/left?filter=999&offset=0&limit=20');
    assert.equal(data.items.length, 20);
    assert.ok(data.items.every((item) => item.id.includes('999')));
    assert.equal(data.items[0].id, '999');
    assert.equal(data.items[1].id, '1999');
    assert.ok(data.total > 20);
  });
  await check('фильтр по несуществующему ID даёт пустой результат', async () => {
    const { data } = await get('/api/left?filter=zzz&offset=0&limit=20');
    assert.deepEqual(ids(data), []);
    assert.equal(data.hasMore, false);
  });

  console.log('\n[4] Добавление элементов');
  await check('новый ID добавляется, повтор отклоняется с 409', async () => {
    const first = await post('/api/items', { id: '2000000' });
    assert.equal(first.status, 200);
    assert.equal(first.data.ok, true);
    customAdded += 1;

    const second = await post('/api/items', { id: '2000000' });
    assert.equal(second.status, 409);
    assert.equal(second.data.error, 'duplicate');
  });
  await check('ID из базового диапазона считается существующим', async () => {
    const { status, data } = await post('/api/items', { id: '42' });
    assert.equal(status, 409);
    assert.equal(data.error, 'duplicate');
  });
  await check('произвольный нечисловой ID допускается', async () => {
    const { status, data } = await post('/api/items', { id: 'user-777' });
    assert.equal(status, 200);
    assert.equal(data.ok, true);
    customAdded += 1;
  });
  await check('добавленный ID появляется в левом списке', async () => {
    const { data } = await get('/api/left?filter=user-777&offset=0&limit=20');
    assert.deepEqual(ids(data), ['user-777']);
  });

  console.log('\n[5] Выбор, порядок и Drag & Drop-перестановка');
  await check('select переносит элемент в правый список', async () => {
    await post('/api/select', { id: '5' });
    await post('/api/select', { id: '3' });
    await post('/api/select', { id: '9' });
    const { data } = await get('/api/right?offset=0&limit=20');
    assert.deepEqual(ids(data), ['5', '3', '9']);
    assert.equal(data.total, 3);
  });
  await check('выбранный элемент исчезает из левого списка', async () => {
    const { data } = await get('/api/left?offset=0&limit=5');
    assert.deepEqual(ids(data), ['1', '2', '4', '6', '7']);
    assert.equal(data.total, BASE_MAX + customAdded - 3);
  });
  await check('reorder: вставка перед ориентиром', async () => {
    await post('/api/reorder', { id: '9', anchorId: '5', position: 'before' });
    const { data } = await get('/api/right?offset=0&limit=20');
    assert.deepEqual(ids(data), ['9', '5', '3']);
  });
  await check('reorder: вставка после ориентира', async () => {
    await post('/api/reorder', { id: '9', anchorId: '3', position: 'after' });
    const { data } = await get('/api/right?offset=0&limit=20');
    assert.deepEqual(ids(data), ['5', '3', '9']);
  });
  await check('reorder при активном фильтре сохраняет порядок', async () => {
    await post('/api/select', { id: '99' });
    await post('/api/select', { id: '59' });
    await post('/api/reorder', { id: '9', anchorId: '5', position: 'before' });
    const filtered = await get('/api/right?filter=9&offset=0&limit=20');
    assert.deepEqual(ids(filtered.data), ['9', '99', '59']);
  });
  await check('deselect возвращает элемент в левый список', async () => {
    await post('/api/deselect', { id: '5' });
    const right = await get('/api/right?offset=0&limit=20');
    assert.ok(!ids(right.data).includes('5'));
    const left = await get('/api/left?offset=0&limit=5');
    assert.deepEqual(ids(left.data), ['1', '2', '4', '5', '6']);
  });

  console.log('\n[6] Дедупликация и батчинг через HTTP');
  await check('50 одновременных одинаковых GET выполняются одним батчем', async () => {
    const before = (await get('/api/stats')).data.lanes.normal.deduped;
    const responses = await Promise.all(
      Array.from({ length: 50 }, () => get('/api/left?filter=777&offset=0&limit=20'))
    );
    assert.ok(
      responses.every((r) => r.status === 200 && r.data.items.length > 0),
      'все ответы должны быть успешными'
    );
    const stats = (await get('/api/stats')).data.lanes.normal;
    assert.ok(stats.deduped - before >= 40, `склеено запросов: ${stats.deduped - before}`);
  });
  await check('одинаковые select дедуплицируются и не ломают порядок', async () => {
    await Promise.all(Array.from({ length: 30 }, () => post('/api/select', { id: '321' })));
    const { data } = await get('/api/right?offset=0&limit=50');
    const occurrences = ids(data).filter((id) => id === '321').length;
    assert.equal(occurrences, 1, `ID 321 встречается ${occurrences} раз`);
  });
  await check('100 одновременных добавлений одного ID -> в списке ровно один', async () => {
    const responses = await Promise.all(
      Array.from({ length: 100 }, () => post('/api/items', { id: '5000001' }))
    );
    assert.ok(responses.some((r) => r.status === 200), 'хотя бы один запрос должен пройти');
    customAdded += 1;
    const listed = await get('/api/left?filter=5000001&offset=0&limit=20');
    assert.deepEqual(ids(listed.data), ['5000001'], 'ID должен присутствовать ровно один раз');
    const again = await post('/api/items', { id: '5000001' });
    assert.equal(again.status, 409, 'повторное добавление отклоняется');
  });

  console.log('\n[7] Сохранение порядка между запросами (эмуляция перезагрузки)');
  await check('порядок выбранных читается тем же, каким был записан', async () => {
    const before = await get('/api/right?offset=0&limit=50');
    const after = await get('/api/right?offset=0&limit=50');
    assert.deepEqual(ids(after.data), ids(before.data));
  });

  console.log('\n[8] 404 и валидация');
  await check('неизвестный /api маршрут отдаёт 404 JSON', async () => {
    const { status, data } = await get('/api/nope');
    assert.equal(status, 404);
    assert.equal(data.error, 'not_found');
  });
  await check('пустой ID отклоняется с 400', async () => {
    const { status, data } = await post('/api/items', { id: '   ' });
    assert.equal(status, 400);
    assert.equal(data.error, 'invalid');
  });
  await check('select несуществующего ID отдаёт 404', async () => {
    const { status, data } = await post('/api/select', { id: 'no-such-id-at-all' });
    assert.equal(status, 404);
    assert.equal(data.error, 'not_found');
  });
} finally {
  server.close();
}

console.log(`\n${failures === 0 ? 'PASS' : 'FAIL'}: проверок ${checks}, провалено ${failures}\n`);
process.exit(failures === 0 ? 0 : 1);
