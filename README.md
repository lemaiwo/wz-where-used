# Work Zone Where-Used

Shows where SAP Build Work Zone (standard edition) content is used: for an app (or catalog, group, space or page) it lists the roles, pages, spaces, catalogs and groups that contain it, directly or through a path such as `Catalog > Role` or `Page > Space > Role`. It also flags content that isn't in any role.

The data comes from an imported **Content Manager export**. The live `/semantic/graphql` API is internal and undocumented, and it only answers on the Work Zone admin host, so this app doesn't call it.

## How it works

1. In Content Manager, select the content (roles, or everything) and choose **Export**.
2. In the app, choose **Import Export File** and upload the zip. Give it a snapshot name, for example the subaccount. Importing again with the same name replaces that snapshot.
3. Search for an item and open it to see where it's used.

The parser (`srv/lib/cdm-index.js`) is generic. It reads every JSON file in the zip, including nested zips, and picks up every CDM 3.x entity (`identification.id` + `entityType`). It builds edges from `relations.*[].target` and skips `base` / `extends`. Page layouts are scanned for app ids, because pages don't always store their tiles as relations.

## Run locally

```bash
npm i && (cd app/whereused && npm i)
cds watch                                  # http://localhost:4004  (users: admin/admin, viewer/viewer)
npm test                                   # parser unit tests
```

`cds watch` also serves the UI through `cds-plugin-ui5`: http://localhost:4004/be.lemtech.wz.whereused/index.html. The app's relative `odata/` URL reaches CAP through the proxy middleware in `app/whereused/ui5.yaml`, which points at port 4004.

## Deploy

```bash
mbt build && cf deploy mta_archives/wz-where-used_1.0.0.mtar
```

After deploying:

- Assign the role collections `WhereUsedViewer (...)` / `WhereUsedAdmin (...)`.
- In Work Zone, refresh the **HTML5 Apps** channel and add *Work Zone Where-Used* to a role.

Needs HANA Cloud (HDI) in the space.

## Limits

- **Snapshot only.** The data is as fresh as the last import.
- **Untested against a real export.** The export format isn't documented, so the parser has only been tested on fixtures built from CDM documents returned by the Work Zone design-time API. Check the import message (entities read / items indexed) on the first real export.
- **Page placement isn't the same as visibility.** A `Page > Space > Role` path means the tile is placed on a page of that role. Users only see the tile if the app is also assigned to the role.
- **Role collections aren't in the export.** Work Zone generates a role collection with the same name as the role.
- **Upload size.** Exports are sent base64-encoded. CAP accepts up to 100 MB (`cds.server.body_parser.limit`). The approuter may apply its own limit.
