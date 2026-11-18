using { wzwu as db } from '../db/schema';

@path: '/odata/v4/where-used'
@requires: 'WhereUsedViewer'
service WhereUsedService {

  @readonly
  @cds.redirection.target
  @cds.search: { title, itemId, description }
  entity ContentItems as projection on db.ContentItems {
    *,
    snapshot.name as snapshotName : String(100),
    case when isOrphan = true then 1 else 3 end as orphanCriticality : Integer,
    case itemType
      when 'businessapp' then 'App'   when 'catalog' then 'Catalog' when 'group' then 'Group'
      when 'role'        then 'Role'  when 'space'   then 'Space'   when 'workpage' then 'Page'
      when 'page'        then 'Page'  else itemType end as itemTypeText : String(30)
  };

  @readonly
  entity Usages as projection on db.Usages {
    *,
    case when direct = true then 'Direct' else 'Indirect' end as assignment : String(10),
    case when direct = true then 3 else 0 end as assignmentCriticality : Integer
  };

  @readonly
  entity Snapshots as projection on db.Snapshots excluding { items };

  /** value help helpers */
  @readonly
  entity ItemTypes as select from db.ContentItems { key itemType } group by itemType;

  /**
   * Import a Content Manager export (zip or json), base64 encoded.
   * Replaces an existing snapshot with the same name.
   */
  @requires: 'WhereUsedAdmin'
  action importExport(name : String(100), fileName : String(255), content : LargeString) returns Snapshots;

  @requires: 'WhereUsedAdmin'
  action deleteSnapshot(name : String(100)) returns Integer;
}
