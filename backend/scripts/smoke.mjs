import assert from 'node:assert/strict';

import { BASE_MAX } from '../src/constants.js';
import { filterBaseMatches, __clearFilterCache } from '../src/filter.js';
import * as store from '../src/store.js';
import { createBus } from '../src/queue.js';

let failures = 0;
let checks = 0;

function check(name, fn) {
  checks += 1;
  try {
    fn();
    console.log(`  ok   ${name}`);
  } catch (error) {
    failures += 1;
    console.error(`  FAIL ${name}\n       ${error.message}`);
  }
}

async function checkAsync(name, fn) {
  checks += 1;
  try {
    await fn();
    console.log(`  ok   ${name}`);
  } catch (error) {
    failures += 1;
    console.error(`  FAIL ${name}\n       ${error.message}`);
  }
}

function bruteForceMatches(sub) {
  const out = [];
  for (let n = 1; n <= BASE_MAX; n += 1) {
    if (String(n).includes(sub)) out.push(n);
  }
  return out;
}

console.log('\n[1] Фильтр по подстроке совпадает с полным перебором');
for (const sub of ['1', '0', '9', '42', '999', '007', '100', '9999', '0000', '1000000', '55']) {
  check(`filter "${sub}"`, () => {
    const fast = filterBaseMatches(sub);
    const slow = bruteForceMatches(sub);
    assert.equal(fast.length, slow.length, `длина: fast=${fast.length} slow=${slow.length}`);
    assert.deepEqual(fast, slow, 'состав/порядок совпадений');
  });
}
check('нечисловой фильтр не даёт совпадений в базовом диапазоне', () => {
  assert.deepEqual(filterBaseMatches('abc'), []);
});
check('кеш фильтра возвращает тот же массив', () => {
  __clearFilterCache();
  const a = filterBaseMatches('777');
  const b = filterBaseMatches('777');
  assert.equal(a, b, 'должен вернуться кешированный массив');
});

console.log('\n[2] Пагинация левого списка');
check('первая страница - 1..20, total корректен', () => {
  store.reset();
  const page = store.listLeft({ offset: 0, limit: 20 });
  assert.equal(page.items.length, 20);
  assert.equal(page.items[0].id, '1');
  assert.equal(page.items[19].id, '20');
  assert.equal(page.total, BASE_MAX);
  assert.equal(page.hasMore, true);
});
check('вторая страница - 21..40', () => {
  const page = store.listLeft({ offset: 20, limit: 20 });
  assert.equal(page.items[0].id, '21');
  assert.equal(page.items[19].id, '40');
});
check('страница подгружается порциями не больше 20', () => {
  const page = store.listLeft({ offset: 999_980, limit: 20 });
  assert.equal(page.items.length, 20);
  assert.equal(page.items[page.items.length - 1].id, '1000000');
  assert.equal(page.hasMore, false);
});

console.log('\n[3] Фильтр + пагинация по 20');
check('фильтр "999": страницы по 20 и корректный total', () => {
  store.reset();
  const expected = bruteForceMatches('999');
  const first = store.listLeft({ filter: '999', offset: 0, limit: 20 });
  assert.equal(first.items.length, 20);
  assert.equal(first.total, expected.length);
  assert.equal(first.hasMore, true);
  assert.deepEqual(
    first.items.map((i) => i.id),
    expected.slice(0, 20).map(String)
  );
  const second = store.listLeft({ filter: '999', offset: 20, limit: 20 });
  assert.deepEqual(
    second.items.map((i) => i.id),
    expected.slice(20, 40).map(String)
  );
});

console.log('\n[4] Добавление элементов');
check('добавление произвольного ID и запрет дубликатов', () => {
  store.reset();
  assert.equal(store.addItem('2000000').ok, true);
  assert.equal(store.addItem('abc-42').ok, true);
  assert.equal(store.addItem('2000000').ok, false, 'повтор 2000000');
  assert.equal(store.addItem('abc-42').ok, false, 'повтор abc-42');
  assert.equal(store.addItem('42').ok, false, 'ID 42 уже есть в базовом диапазоне');
  assert.equal(store.addItem('0042').ok, false, '0042 канонизируется в 42');
  assert.equal(store.addItem('').ok, false, 'пустой ID');
});
check('добавленные ID видны в левом списке и не дублируют выбранные', () => {
  store.reset();
  store.addItem('2000000');
  store.selectItem('2000000');
  const page = store.listLeft({ filter: '2000000', offset: 0, limit: 20 });
  assert.equal(page.total, 0, 'выбранный элемент не должен быть слева');
  const right = store.listRight({ offset: 0, limit: 20 });
  assert.deepEqual(right.items.map((i) => i.id), ['2000000']);
});

console.log('\n[5] Выбор и порядок');
check('select добавляет в конец, deselect убирает', () => {
  store.reset();
  store.selectItem('5');
  store.selectItem('3');
  store.selectItem('9');
  assert.deepEqual(store.getSelected(), ['5', '3', '9']);
  assert.equal(store.listLeft({ offset: 0, limit: 3 }).items.map((i) => i.id).join(','), '1,2,4');
  store.deselectItem('3');
  assert.deepEqual(store.getSelected(), ['5', '9']);
});
check('reorder по anchor + position', () => {
  store.reset();
  ['1', '2', '3', '4'].forEach((id) => store.selectItem(id));
  store.reorderItem('4', '1', 'before');
  assert.deepEqual(store.getSelected(), ['4', '1', '2', '3']);
  store.reorderItem('4', '2', 'after');
  assert.deepEqual(store.getSelected(), ['1', '2', '4', '3']);
  store.reorderItem('1', null, 'after');
  assert.deepEqual(store.getSelected(), ['2', '4', '3', '1']);
});
check('фильтр правого списка сохраняет порядок выбранных', () => {
  store.reset();
  ['21', '5', '212', '7'].forEach((id) => store.selectItem(id));
  const page = store.listRight({ filter: '2', offset: 0, limit: 20 });
  assert.deepEqual(page.items.map((i) => i.id), ['21', '212']);
  assert.equal(page.total, 2);
});

console.log('\n[6] Очередь: дедупликация и батчинг');
await checkAsync('50 одинаковых чтений выполняются один раз', async () => {
  const bus = createBus({ normalMs: 0, addMs: 0, graceMs: 5 });
  let calls = 0;
  const promises = [];
  for (let i = 0; i < 50; i += 1) {
    promises.push(bus.enqueue('normal', 'same-key', () => {
      calls += 1;
      return { value: 42 };
    }));
  }
  const results = await Promise.all(promises);
  assert.equal(calls, 1, `функция вызвана ${calls} раз`);
  assert.ok(results.every((r) => r.value === 42));
  assert.equal(bus.stats().lanes.normal.deduped, 49);
  assert.equal(bus.stats().lanes.normal.flushes, 1);
  bus.flushAll();
});

await checkAsync('10 разных чтений склеиваются в один батч', async () => {
  const bus = createBus({ normalMs: 1000, addMs: 1000, graceMs: 20 });
  const promises = [];
  for (let i = 0; i < 10; i += 1) {
    promises.push(bus.enqueue('normal', `key-${i}`, () => i));
  }
  await Promise.all(promises);
  const stats = bus.stats().lanes.normal;
  assert.equal(stats.flushes, 1, `флешей: ${stats.flushes}`);
  assert.equal(stats.lastBatchSize, 10, `размер батча: ${stats.lastBatchSize}`);
});

await checkAsync('гарантия: 200 разных запросов на один ID -> добавлен один раз', async () => {
  store.reset();
  const bus = createBus({ normalMs: 0, addMs: 0, graceMs: 5 });
  const promises = [];
  for (let i = 0; i < 200; i += 1) {
    promises.push(bus.enqueue('add', `add|unique-${i}`, () => store.addItem('7777777')));
  }
  const results = await Promise.all(promises);
  const okCount = results.filter((r) => r.ok).length;
  assert.equal(okCount, 1, `успешных добавлений: ${okCount}`);
  assert.equal(results.filter((r) => r.error === 'duplicate').length, 199);
  const listed = store.listLeft({ filter: '7777777', offset: 0, limit: 20 });
  assert.equal(listed.total, 1, 'в списке должен быть ровно один элемент');
  bus.flushAll();
});

await checkAsync('лейн добавления батчится отдельно от лейна normal', async () => {
  store.reset();
  const bus = createBus({ normalMs: 1000, addMs: 10000, graceMs: 20 });
  const reads = [bus.enqueue('normal', 'r1', () => 'read')];
  const adds = [bus.enqueue('add', 'a1', () => 'add')];
  const [readResult, addResult] = await Promise.all([Promise.all(reads), Promise.all(adds)]);
  assert.equal(readResult[0], 'read');
  assert.equal(addResult[0], 'add');
  const stats = bus.stats();
  assert.equal(stats.lanes.normal.flushes, 1);
  assert.equal(stats.lanes.add.flushes, 1);
});

console.log(`\n${failures === 0 ? 'PASS' : 'FAIL'}: проверок ${checks}, провалено ${failures}\n`);
if (failures > 0) process.exit(1);
