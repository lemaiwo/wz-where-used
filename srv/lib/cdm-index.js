/**
 * Parses a SAP Build Work Zone (standard edition) content export and builds a where-used index.
 *
 * The export format is not formally documented, so the parser is deliberately generic:
 * it walks every JSON document (also inside nested zips) and picks up every object that
 * looks like a CDM 3.x entity ({ identification: { id, entityType }, relations?, payload? }).
 * Edges come from `relations.<name>[].target`, plus a text scan of page payloads for app ids.
 */
import JSZip from 'jszip';

const IGNORED_RELATIONS = new Set(['base', 'viztypes', 'urltemplate']);
const IGNORED_LABELS = new Set(['extends']);
const PAGE_TYPES = new Set(['workpage', 'page']);
const MAX_DEPTH = 6;
const MAX_PATHS_PER_ANCESTOR = 10;

export const TYPE_LABEL = {
  businessapp: 'App', catalog: 'Catalog', group: 'Group', role: 'Role',
  space: 'Space', workpage: 'Page', page: 'Page', site: 'Site'
};

/* ---------------------------------------------------------------- reading */

/** Returns an array of parsed JSON documents found in a Buffer (zip or json). */
export async function readDocuments(buffer, depth = 0) {
  if (isZip(buffer)) {
    if (depth > 3) return [];
    const zip = await JSZip.loadAsync(buffer);
    const docs = [];
    for (const file of Object.values(zip.files)) {
      if (file.dir) continue;
      const content = await file.async('nodebuffer');
      if (/\.zip$/i.test(file.name) || isZip(content)) docs.push(...await readDocuments(content, depth + 1));
      else if (/\.json$/i.test(file.name) || looksLikeJson(content)) {
        const json = tryParse(content);
        if (json !== undefined) docs.push(json);
      }
    }
    return docs;
  }
  const json = tryParse(buffer);
  if (json === undefined) throw new Error('File is neither a zip nor a JSON document');
  return [json];
}

const isZip = b => b && b.length > 3 && b[0] === 0x50 && b[1] === 0x4b && b[2] === 0x03 && b[3] === 0x04;
const looksLikeJson = b => { const c = b.toString('utf8', 0, 64).trimStart()[0]; return c === '{' || c === '['; };
function tryParse(b) { try { return JSON.parse(b.toString('utf8').replace(/^\uFEFF/, '')); } catch { return undefined; } }

/* ---------------------------------------------------------- CDM handling */

/** Recursively collect CDM entities from any JSON structure. */
export function collectEntities(docs) {
  const found = new Map();
  const visit = (node, depth) => {
    if (!node || typeof node !== 'object' || depth > 40) return;
    if (Array.isArray(node)) { node.forEach(n => visit(n, depth + 1)); return; }
    const ident = node.identification;
    if (ident && typeof ident === 'object' && ident.id && ident.entityType) {
      const key = keyOf(ident.entityType, ident.id);
      const prev = found.get(key);
      // keep the richest version if an entity occurs more than once
      if (!prev || JSON.stringify(node).length > JSON.stringify(prev).length) found.set(key, node);
    }
    for (const v of Object.values(node)) if (v && typeof v === 'object') visit(v, depth + 1);
  };
  docs.forEach(d => visit(d, 0));

  // Spaces and pages of the "new experience" are not exported as CDM entities but as flat data rows
  // of the cep-runtime-agent (nested content.zip). Turn them into CDM-like entities and merge.
  for (const agentEntity of collectAgentEntities(docs)) {
    const { entityType, id } = agentEntity.identification;
    const key = keyOf(entityType, id);
    const cdm = found.get(key);
    if (!cdm) { found.set(key, agentEntity); continue; }
    // A CDM entity exists too: keep its texts, but add the relations / payload only the agent data has.
    const relations = { ...(cdm.relations || {}) };
    for (const [name, refs] of Object.entries(agentEntity.relations || {})) relations[name] = [...(relations[name] || []), ...refs];
    found.set(key, { ...cdm, relations, agentPayload: agentEntity.payload });
  }
  return [...found.values()];
}

/* ------------------------------------------- cep-runtime-agent data rows */

// Row shapes of agents/cep-runtime-agent/content.zip (1_DataFile_<X>.json), recognised by their keys:
const isSpaceRow = r => typeof r.id === 'string' && typeof r.language === 'string' && r.descriptor?.value && !r.contents && !('workPageVizsId' in r);
const isPageVersionRow = r => typeof r.id === 'string' && typeof r.language === 'string' && Array.isArray(r.workPageVizsId);   // WPV
const isSpacePageRow = r => typeof r.spaceId === 'string' && typeof r.workPageId === 'string';                                 // SP-WP
const isPageVizRow = r => typeof r.workPageId === 'string' && typeof r.visualizationId === 'string';                           // WP-VZ

const AGENT_REF_CONTEXT = { id: 'SUB_ACCOUNT', type: 'SUB_ACCOUNT' };
const agentRef = (entityType, id) => ({ label: 'ref', target: { id, context: AGENT_REF_CONTEXT, entityType } });

/** Rows exist once per language; "master" (or its "raw" copy) holds the default texts. */
const LANGUAGE_RANK = l => (l === 'master' ? 0 : l === 'raw' ? 1 : /^en/i.test(l) ? 2 : 3);
function pickLanguageRow(rows) {
  return rows.reduce((best, r) => (!best || LANGUAGE_RANK(r.language) < LANGUAGE_RANK(best.language) ? r : best), null);
}

/** Convert cep-runtime-agent space / page rows into CDM-like entities ({ identification, relations, payload }). */
export function collectAgentEntities(docs) {
  const spaceRows = new Map(), pageRows = new Map(), spacePages = [], pageVizs = [];
  const group = (map, r) => { if (!map.has(r.id)) map.set(r.id, []); map.get(r.id).push(r); };
  const visit = (node, depth) => {
    if (!node || typeof node !== 'object' || depth > 40) return;
    if (Array.isArray(node)) { node.forEach(n => visit(n, depth + 1)); return; }
    if (node.identification) return;   // CDM entity, handled elsewhere
    if (isPageVersionRow(node)) return group(pageRows, node);
    if (isSpaceRow(node)) return group(spaceRows, node);
    if (isSpacePageRow(node)) return spacePages.push(node);
    if (isPageVizRow(node)) return pageVizs.push(node);
    for (const v of Object.values(node)) if (v && typeof v === 'object') visit(v, depth + 1);
  };
  docs.forEach(d => visit(d, 0));

  const entities = [];
  for (const [id, rows] of spaceRows) {
    const row = pickLanguageRow(rows);
    const text = row.descriptor.value;
    const pages = spacePages.filter(sp => sp.spaceId === id)
      .sort((a, b) => (a.sortNumber ?? 0) - (b.sortNumber ?? 0))
      .map(sp => agentRef('workpage', sp.workPageId));
    entities.push({
      identification: { id, entityType: 'space', title: text.title, description: text.description, providerId: row.providerId },
      relations: { workpages: pages }
    });
  }
  // spaces referenced only via SP-WP still get their page relation (title stays a placeholder)
  for (const sp of spacePages) {
    if (spaceRows.has(sp.spaceId)) continue;
    let e = entities.find(x => x.identification.entityType === 'space' && x.identification.id === sp.spaceId);
    if (!e) entities.push(e = { identification: { id: sp.spaceId, entityType: 'space', title: sp.spaceId, placeholderTitle: true }, relations: { workpages: [] } });
    e.relations.workpages.push(agentRef('workpage', sp.workPageId));
  }

  const pageIds = new Set([...pageRows.keys(), ...spacePages.map(sp => sp.workPageId), ...pageVizs.map(v => v.workPageId)]);
  for (const id of pageIds) {
    const rows = pageRows.get(id) || [];
    const row = pickLanguageRow(rows);
    const text = row?.contents?.descriptor?.value || row?.mergedEntity?.descriptor?.value || {};
    const vizIds = new Set([...rows.flatMap(r => r.workPageVizsId || []), ...pageVizs.filter(v => v.workPageId === id).map(v => v.visualizationId)]);
    entities.push({
      identification: { id, entityType: 'workpage', title: text.title || id, description: text.description, providerId: row?.providerId, placeholderTitle: !text.title },
      payload: { workPageVizsId: [...vizIds], rows: row?.contents?.rows || [] }
    });
  }
  return entities;
}

export const keyOf = (type, id) => `${type}:${id}`;

/** Resolve "{{key}}" placeholders against both CDM text formats. */
export function resolveText(entity, value) {
  if (typeof value !== 'string') return value;
  const m = value.match(/^\{\{(.+)\}\}$/);
  if (!m) return value;
  const key = m[1];
  const texts = entity.texts;
  if (!texts) return value;
  if (Array.isArray(texts)) {   // [{ locale, textDictionary: { key: value } }]
    const t = texts.find(t => !t.locale) || texts.find(t => /^en/i.test(t.locale || '')) || texts[0];
    return (t && t.textDictionary && t.textDictionary[key]) || value;
  }
  const entry = texts[key];     // { "cdm|identification|title": { value: { "": "..." } } }
  if (entry && entry.value) return entry.value[''] ?? entry.value.en ?? Object.values(entry.value)[0] ?? value;
  return value;
}

/* ----------------------------------------------------------------- index */

/**
 * Build the where-used index.
 * @returns {{ items: Map<string, Item>, usages: Usage[], edgeCount: number }}
 *   Item  = { key, id, type, title, description, providerId, placeholder }
 *   Usage = { itemKey, usedInKey, direct, depth, path, relation }
 */
export function buildIndex(entities) {
  const items = new Map();
  const addItem = (type, id, data = {}) => {
    const key = keyOf(type, id);
    if (!items.has(key)) items.set(key, { key, id, type, title: id, description: '', providerId: null, placeholder: true });
    const item = items.get(key);
    if (!data.placeholder) Object.assign(item, data, { placeholder: false });
    return item;
  };

  for (const e of entities) {
    const ident = e.identification;
    if (ident.placeholderTitle) { addItem(ident.entityType, ident.id, { placeholder: true }); continue; }
    addItem(ident.entityType, ident.id, {
      title: clean(resolveText(e, ident.title)) || ident.id,
      description: clean(resolveText(e, ident.description)) || '',
      providerId: ident.providerId || null
    });
  }

  // parent -> child edges
  const parentsOf = new Map();   // childKey -> [{ parentKey, relation }]
  const edgeSet = new Set();
  const addEdge = (parentKey, childKey, relation) => {
    if (parentKey === childKey) return;
    const sig = `${parentKey}>${childKey}`;
    if (edgeSet.has(sig)) return;
    edgeSet.add(sig);
    if (!parentsOf.has(childKey)) parentsOf.set(childKey, []);
    parentsOf.get(childKey).push({ parentKey, relation });
  };

  for (const e of entities) {
    const parentKey = keyOf(e.identification.entityType, e.identification.id);
    for (const [relation, refs] of Object.entries(e.relations || {})) {
      if (IGNORED_RELATIONS.has(relation) || !Array.isArray(refs)) continue;
      for (const ref of refs) {
        const t = ref && ref.target;
        if (!t || !t.id || !t.entityType || IGNORED_LABELS.has(ref.label)) continue;
        addItem(t.entityType, t.id, { placeholder: true });
        addEdge(parentKey, keyOf(t.entityType, t.id), relation);
      }
    }
  }

  // Page layouts are not always expressed as relations: scan page payloads for app ids.
  const appIds = [...items.values()].filter(i => i.type === 'businessapp').map(i => i.id);
  for (const e of entities) {
    if (!PAGE_TYPES.has(e.identification.entityType) || !(e.payload || e.agentPayload)) continue;
    const parentKey = keyOf(e.identification.entityType, e.identification.id);
    const text = JSON.stringify([e.payload, e.agentPayload]);
    for (const appId of appIds) {
      if (text.includes(`"${appId}"`) || text.includes(`"${appId}#`)) addEdge(parentKey, keyOf('businessapp', appId), 'pageContent');
    }
  }

  // Walk upwards from every item and record all ancestors with their path.
  const label = key => { const i = items.get(key); return `${TYPE_LABEL[i.type] || i.type}: ${i.title}`; };
  const usages = [];
  for (const item of items.values()) {
    const pathsPerAncestor = new Map();
    const queue = [{ key: item.key, depth: 0, trail: [], relation: null }];
    while (queue.length) {
      const { key, depth, trail, relation } = queue.shift();
      if (depth >= MAX_DEPTH) continue;
      for (const p of parentsOf.get(key) || []) {
        if (p.parentKey === item.key || trail.includes(p.parentKey)) continue;   // cycle
        const newTrail = [...trail, p.parentKey];
        const firstRelation = relation || p.relation;
        const count = pathsPerAncestor.get(p.parentKey) || 0;
        if (count < MAX_PATHS_PER_ANCESTOR) {
          pathsPerAncestor.set(p.parentKey, count + 1);
          usages.push({
            itemKey: item.key, usedInKey: p.parentKey, direct: depth === 0, depth: depth + 1,
            path: newTrail.map(label).join(' > '), relation: firstRelation
          });
        }
        queue.push({ key: p.parentKey, depth: depth + 1, trail: newTrail, relation: firstRelation });
      }
    }
  }

  // role counts / orphans
  const rolesOf = new Map();
  for (const u of usages) {
    if (items.get(u.usedInKey).type !== 'role') continue;
    if (!rolesOf.has(u.itemKey)) rolesOf.set(u.itemKey, new Set());
    rolesOf.get(u.itemKey).add(u.usedInKey);
  }
  for (const item of items.values()) {
    const roles = rolesOf.get(item.key) || new Set();
    item.roleCount = roles.size;
    item.isOrphan = item.type !== 'role' && item.type !== 'site' && roles.size === 0;
  }

  return { items, usages, edgeCount: edgeSet.size };
}

const clean = s => (typeof s === 'string' ? s.trim() : s);

/** Convenience: buffer in, index out. */
export async function indexExport(buffer) {
  const docs = await readDocuments(buffer);
  const entities = collectEntities(docs);
  if (!entities.length) throw new Error('No CDM entities found in the file. Is this a Work Zone Content Manager export?');
  return { entityCount: entities.length, ...buildIndex(entities) };
}
