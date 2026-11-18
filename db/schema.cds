namespace wzwu;

using { cuid, managed } from '@sap/cds/common';

/** One imported Work Zone Content Manager export (e.g. one per subaccount / landscape). */
entity Snapshots : cuid, managed {
  name          : String(100);   // e.g. "my-subaccount-dev"
  fileName      : String(255);
  itemCount     : Integer;
  relationCount : Integer;
  message       : String(1000);
  items         : Composition of many ContentItems on items.snapshot = $self;
}

/** A content item found in the export: app, catalog, group, role, space, page, ... */
entity ContentItems : cuid {
  snapshot     : Association to Snapshots;
  itemId       : String(255);    // Work Zone id, e.g. saas_approuter_com.example.x.y
  itemType     : String(30);     // businessapp | catalog | group | role | space | workpage | page | ...
  title        : String(255);
  description  : String(1000);
  providerId   : String(255);
  roleCount    : Integer default 0;  // number of roles that (directly or indirectly) contain this item
  isOrphan     : Boolean default false;

  usages       : Association to many Usages on usages.item = $self;
  roles        : Association to many Usages on roles.item = $self and roles.usedInType = 'role';
  catalogs     : Association to many Usages on catalogs.item = $self and catalogs.usedInType = 'catalog';
  groups       : Association to many Usages on groups.item = $self and groups.usedInType = 'group';
  spaces       : Association to many Usages on spaces.item = $self and spaces.usedInType = 'space';
  pages        : Association to many Usages on pages.item = $self and (pages.usedInType = 'workpage' or pages.usedInType = 'page');
  contains     : Association to many Usages on contains.usedIn = $self and contains.direct = true;
}

/** "item is used in usedIn", directly or through a path (e.g. catalog -> role). */
entity Usages : cuid {
  snapshot   : Association to Snapshots;
  item       : Association to ContentItems;
  usedIn     : Association to ContentItems;
  usedInId   : String(255);
  usedInType : String(30);
  usedInTitle: String(255);
  itemTitle  : String(255);
  itemType   : String(30);
  direct     : Boolean;
  depth      : Integer;
  path       : String(2000);    // human readable path, e.g. "Catalog: FI Reporting > Role: WZ_LOCAL_REPORTING"
  relation   : String(50);      // relation name of the first hop (apps, viz, spaces, workpages, pageContent, ...)
}
