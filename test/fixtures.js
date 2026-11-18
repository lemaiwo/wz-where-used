// Fixtures modelled on CDM 3.x documents returned by the Work Zone design-time API
// (role / space / catalog use the "cdm|identification|title" text format,
//  business apps use the texts[].textDictionary format).
const ctx = { id: 'SUB_ACCOUNT', type: 'SUB_ACCOUNT' };
const ref = (entityType, id, properties) => ({ label: 'ref', target: { id, context: ctx, entityType, ...(properties && { properties }) } });
const cdmTexts = (title, description = '') => ({
  'cdm|identification|title': { type: 'XTIT', value: { '': title } },
  'cdm|identification|description': { type: 'XTIT', value: { '': description } }
});
const ident = (entityType, id) => ({ id, title: '{{cdm|identification|title}}', entityType, description: '{{cdm|identification|description}}' });

export const app = (id, title) => ({
  texts: [{ locale: '', textDictionary: { appTitle: title, appDescription: title } }],
  payload: { defaultViz: `${id}-display`, visualizations: {} },
  _version: '3.0',
  relations: { viztypes: [], urltemplate: [], base: [{ label: 'extends', target: { id: id.replace('saas_approuter_', ''), context: { id: 'saas_approuter_my-subaccount-dev', type: 'SNAPSHOT' }, entityType: 'businessapp' } }] },
  identification: { id, title: '{{appTitle}}', entityType: 'businessapp', description: '{{appDescription}}', providerId: 'saas_approuter' }
});

export const QA = 'saas_approuter_com.example.tools.qareview';
export const FEED = 'saas_approuter_com.example.finance.feed';
export const RUNS = 'saas_approuter_com.example.finance.runs';
export const ORPHAN = 'saas_approuter_com.example.orphan';
export const SPACE = '7ab32153-b8a2-46ae-8798-079dd6279394';
export const CATALOG = '0acf108a-8c6a-49bb-9859-92d0ffa550c7';
export const PAGE = '952b7b87-1beb-4f70-9dd8-73386fbe0547';

export const entities = [
  { texts: cdmTexts('Developer tools'), payload: { apps: [] }, _version: '3.0',
    relations: { apps: [ref('businessapp', QA)], spaces: [ref('space', SPACE)] }, identification: ident('role', 'Developer_tools') },
  { texts: cdmTexts('WZ_LOCAL_REPORTING'), payload: { apps: [] }, _version: '3.0',
    relations: { apps: [ref('businessapp', FEED), ref('businessapp', RUNS)] }, identification: ident('role', 'WZ_LOCAL_REPORTING') },
  { texts: cdmTexts('Finance role'), payload: {}, _version: '3.0',
    relations: { catalogs: [ref('catalog', CATALOG)], spaces: [ref('space', SPACE)] }, identification: ident('role', 'WZ_LOCAL_FINANCE') },
  { texts: cdmTexts('Developer tools'), payload: { spaceConfig: {} }, _version: '3.0',
    relations: { pages: [], workpages: [ref('workpage', PAGE)] }, identification: ident('space', SPACE) },
  { texts: cdmTexts('FI Reporting'), payload: { viz: [] }, _version: '3.0',
    relations: { viz: [ref('businessapp', FEED, { vizId: 'Feed-display' }), ref('businessapp', RUNS, { vizId: 'Run-display' })] },
    identification: ident('catalog', CATALOG) },
  // page whose layout references an app only inside its payload (no relation)
  { texts: cdmTexts('Custom apps TEMP'), _version: '3.2.0', relations: { viz: [] },
    payload: { rows: [{ columns: [{ cells: [{ widgets: [{ visualization: { id: `${QA}#qareview-display` } }] }] }] }] },
    identification: ident('workpage', PAGE) },
  app(QA, 'SAP Technical QA Review'),
  app(FEED, 'Feed preview'),
  app(RUNS, 'Report Runs'),
  app(ORPHAN, 'Nobody uses me')
];
