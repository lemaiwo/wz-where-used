// Real (anonymized) Work Zone "Content Transport" export of one role -> space -> page.
// The space has a page, so Work Zone exports it ONLY in the nested
// agents/cep-runtime-agent/content.zip (1_DataFile_SP / SP-WP / WP / WPV) — there is no CDM space entity.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import JSZip from 'jszip';
import { indexExport } from '../srv/lib/cdm-index.js';

const DATA = path.join(import.meta.dirname, 'data', 'content-transport-space-page');
const AGENT_CONTENT = 'agents/cep-runtime-agent/content';

const SPACE = 'ce128938-a5bb-4c91-befa-8d23eb3cdf06';
const PAGE = '9ad10910-215e-4f05-924a-c08ecd04fec8';
const APP = 'cf569959-63c0-447a-89e9-4caf5cdd80e2';

const filesIn = dir => fs.readdirSync(dir, { recursive: true, withFileTypes: true })
  .filter(f => f.isFile())
  .map(f => path.relative(dir, path.join(f.parentPath, f.name)).split(path.sep).join('/'));

/** Rebuild the export zip the way Work Zone packs it (agent content as nested content.zip). */
async function buildExport() {
  const inner = new JSZip();
  for (const f of filesIn(path.join(DATA, AGENT_CONTENT))) inner.file(f, fs.readFileSync(path.join(DATA, AGENT_CONTENT, f)));
  const outer = new JSZip();
  for (const f of filesIn(DATA)) if (!f.startsWith(`${AGENT_CONTENT}/`)) outer.file(f, fs.readFileSync(path.join(DATA, f)));
  outer.file('agents/cep-runtime-agent/content.zip', await inner.generateAsync({ type: 'nodebuffer' }));
  return outer.generateAsync({ type: 'nodebuffer' });
}

test('CDM entities of the export are indexed', async () => {
  const { items } = await indexExport(await buildExport());
  assert.equal(items.get('role:Employee').title, 'Employee');
  assert.equal(items.get(`businessapp:${APP}`).title, 'Sample App');
});

test('space name is resolved from the cep-runtime-agent data file', async () => {
  const { items } = await indexExport(await buildExport());
  const space = items.get(`space:${SPACE}`);
  assert.equal(space.placeholder, false);
  assert.equal(space.title, 'My Space');          // "master" row, not "Mein Bereich" (de_DE)
});

test('page from the data files is linked to its space and role', async () => {
  const index = await indexExport(await buildExport());
  const page = index.items.get(`workpage:${PAGE}`);
  assert.ok(page, 'page item exists');
  assert.equal(page.title, 'My Page');            // "master" row, not "Meine Seite" (de_DE)
  const viaRole = index.usages.find(u => u.itemKey === `workpage:${PAGE}` && u.usedInKey === 'role:Employee');
  assert.equal(viaRole?.path, 'Space: My Space > Role: Employee');
});

test('app placed on an agent page is used via page > space > role; CDM space is merged', async () => {
  const { buildIndex, collectEntities } = await import('../srv/lib/cdm-index.js');
  const ref = (entityType, id) => ({ label: 'ref', target: { id, entityType } });
  const cdm = [
    { identification: { id: 'R1', entityType: 'role', title: 'Role 1' }, relations: { spaces: [ref('space', 'S1')] } },
    { identification: { id: 'A1', entityType: 'businessapp', title: 'App 1' } },
    // CDM space without pages (as in site exports) — agent rows must add the page relation
    { identification: { id: 'S1', entityType: 'space', title: 'CDM Space' }, relations: { workpages: [] } }
  ];
  const agent = [
    [{ id: 'S1', language: 'de_DE', descriptor: { value: { title: 'Bereich' } } },
     { id: 'S1', language: 'master', descriptor: { value: { title: 'Space' } } }],
    [{ spaceId: 'S1', workPageId: 'P1', sortNumber: 0 }],
    [{ id: 'P1', language: 'master', workPageVizsId: [], contents: { descriptor: { value: { title: 'Page 1' } }, rows: [] } }],
    [{ workPageId: 'P1', visualizationId: 'A1#A1-display' }]
  ];
  const index = buildIndex(collectEntities([cdm, ...agent]));
  assert.equal(index.items.get('space:S1').title, 'CDM Space');   // CDM texts win when both exist
  assert.equal(index.items.get('workpage:P1').title, 'Page 1');
  const u = index.usages.find(x => x.itemKey === 'businessapp:A1' && x.usedInKey === 'role:R1');
  assert.equal(u?.path, 'Page: Page 1 > Space: CDM Space > Role: Role 1');
});
