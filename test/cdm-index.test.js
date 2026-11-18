import { test } from 'node:test';
import assert from 'node:assert/strict';
import JSZip from 'jszip';
import { indexExport, buildIndex, collectEntities } from '../srv/lib/cdm-index.js';
import { entities, QA, FEED, RUNS, ORPHAN, CATALOG, PAGE } from './fixtures.js';

const usagesOf = (index, type, id) => index.usages.filter(u => u.itemKey === `${type}:${id}`);
const rolesOf = (index, id) => [...new Set(usagesOf(index, 'businessapp', id)
  .filter(u => u.usedInKey.startsWith('role:')).map(u => u.usedInKey.slice(5)))].sort();

test('titles resolve for both CDM text formats', () => {
  const { items } = buildIndex(entities);
  assert.equal(items.get(`businessapp:${QA}`).title, 'SAP Technical QA Review');
  assert.equal(items.get(`catalog:${CATALOG}`).title, 'FI Reporting');
  assert.equal(items.get('role:Developer_tools').title, 'Developer tools');
});

test('direct role assignment', () => {
  const index = buildIndex(entities);
  const direct = usagesOf(index, 'businessapp', QA).filter(u => u.direct && u.usedInKey.startsWith('role:'));
  assert.deepEqual(direct.map(u => u.usedInKey), ['role:Developer_tools']);
});

test('role via catalog', () => {
  const index = buildIndex(entities);
  assert.deepEqual(rolesOf(index, FEED), ['WZ_LOCAL_FINANCE', 'WZ_LOCAL_REPORTING']);
  const viaCatalog = usagesOf(index, 'businessapp', FEED).find(u => u.usedInKey === 'role:WZ_LOCAL_FINANCE');
  assert.equal(viaCatalog.direct, false);
  assert.equal(viaCatalog.path, 'Catalog: FI Reporting > Role: Finance role');
});

test('page placement is found from the page payload, and leads to space and roles', () => {
  const index = buildIndex(entities);
  const u = usagesOf(index, 'businessapp', QA);
  assert.ok(u.some(x => x.usedInKey === `workpage:${PAGE}` && x.direct && x.relation === 'pageContent'));
  assert.ok(u.some(x => x.usedInKey === 'role:WZ_LOCAL_FINANCE' && x.path === 'Page: Custom apps TEMP > Space: Developer tools > Role: Finance role'));
});

test('extends (base app) is not counted as usage', () => {
  const index = buildIndex(entities);
  assert.ok(!index.usages.some(u => u.usedInKey === `businessapp:${QA}` || u.itemKey.endsWith('com.example.tools.qareview') && u.usedInKey.startsWith('businessapp:')));
});

test('orphans and role counts', () => {
  const { items } = buildIndex(entities);
  assert.equal(items.get(`businessapp:${ORPHAN}`).isOrphan, true);
  assert.equal(items.get(`businessapp:${RUNS}`).roleCount, 2);
  assert.equal(items.get('role:Developer_tools').isOrphan, false);
});

test('reads nested zip with wrapped / array documents', async () => {
  const inner = new JSZip();
  inner.file('roles.json', JSON.stringify({ content: { roles: entities.slice(0, 3) } }));
  inner.file('other.json', JSON.stringify(entities.slice(3)));
  const outer = new JSZip();
  outer.file('export/content.zip', await inner.generateAsync({ type: 'nodebuffer' }));
  outer.file('readme.txt', 'not json');
  const result = await indexExport(await outer.generateAsync({ type: 'nodebuffer' }));
  assert.equal(result.entityCount, entities.length);
  assert.deepEqual(rolesOf(result, FEED), ['WZ_LOCAL_FINANCE', 'WZ_LOCAL_REPORTING']);
});

test('plain json works, garbage fails clearly', async () => {
  const r = await indexExport(Buffer.from(JSON.stringify(entities)));
  assert.equal(r.entityCount, entities.length);
  await assert.rejects(indexExport(Buffer.from('{"hello":1}')), /No CDM entities/);
  await assert.rejects(indexExport(Buffer.from('nope')), /neither a zip nor a JSON/);
});

test('duplicates keep the richest version', () => {
  const dup = { identification: { id: 'Developer_tools', entityType: 'role' } };
  assert.equal(collectEntities([[dup, ...entities]]).filter(e => e.identification.id === 'Developer_tools')[0].relations !== undefined, true);
});
