import cds from '@sap/cds';
import { indexExport } from './lib/cdm-index.js';

const LOG = cds.log('where-used');
const CHUNK = 1000;

export default class WhereUsedService extends cds.ApplicationService {
  init() {
    const { Snapshots, ContentItems, Usages } = cds.entities('wzwu');

    this.on('importExport', async req => {
      const { name, fileName, content } = req.data;
      if (!content) return req.error(400, 'No file content received');
      const snapshotName = (name || fileName || 'default').trim().slice(0, 100);

      let index;
      try {
        index = await indexExport(Buffer.from(content, 'base64'));
      } catch (e) {
        return req.error(400, `Could not read export: ${e.message}`);
      }

      await deleteSnapshot(snapshotName);

      const snapshotId = cds.utils.uuid();
      const ids = new Map();   // item key -> ContentItems.ID
      const itemRows = [...index.items.values()].map(i => {
        const ID = cds.utils.uuid();
        ids.set(i.key, ID);
        return {
          ID, snapshot_ID: snapshotId, itemId: i.id, itemType: i.type,
          title: i.title?.slice(0, 255), description: i.description?.slice(0, 1000),
          providerId: i.providerId, roleCount: i.roleCount, isOrphan: i.isOrphan
        };
      });
      const usageRows = index.usages.map(u => {
        const item = index.items.get(u.itemKey), usedIn = index.items.get(u.usedInKey);
        return {
          ID: cds.utils.uuid(), snapshot_ID: snapshotId,
          item_ID: ids.get(u.itemKey), usedIn_ID: ids.get(u.usedInKey),
          itemTitle: item.title?.slice(0, 255), itemType: item.type,
          usedInId: usedIn.id, usedInType: usedIn.type, usedInTitle: usedIn.title?.slice(0, 255),
          direct: u.direct, depth: u.depth, path: u.path.slice(0, 2000), relation: u.relation
        };
      });

      const placeholders = [...index.items.values()].filter(i => i.placeholder).length;
      const message = `${index.entityCount} entities read, ${itemRows.length} items indexed`
        + (placeholders ? ` (${placeholders} referenced but not part of the export)` : '')
        + `, ${index.edgeCount} relations, ${usageRows.length} where-used entries`;

      await INSERT.into(Snapshots).entries({
        ID: snapshotId, name: snapshotName, fileName,
        itemCount: itemRows.length, relationCount: index.edgeCount, message
      });
      for (let i = 0; i < itemRows.length; i += CHUNK) await INSERT.into(ContentItems).entries(itemRows.slice(i, i + CHUNK));
      for (let i = 0; i < usageRows.length; i += CHUNK) await INSERT.into(Usages).entries(usageRows.slice(i, i + CHUNK));

      LOG.info(`Snapshot "${snapshotName}": ${message}`);
      req.info(message);
      return SELECT.one.from(this.entities.Snapshots, snapshotId);
    });

    this.on('deleteSnapshot', req => deleteSnapshot(req.data.name));

    async function deleteSnapshot(name) {
      const old = await SELECT.from(Snapshots).columns('ID').where({ name });
      for (const { ID } of old) {
        await DELETE.from(Usages).where({ snapshot_ID: ID });
        await DELETE.from(ContentItems).where({ snapshot_ID: ID });
        await DELETE.from(Snapshots).where({ ID });
      }
      return old.length;
    }

    return super.init();
  }
}
