using WhereUsedService as service from '../../srv/where-used-service';

/* ------------------------------------------------------------------ labels */

annotate service.ContentItems with {
  ID                @UI.Hidden;
  snapshot          @UI.Hidden;
  orphanCriticality @UI.Hidden;
  title             @title: 'Title';
  itemId            @title: 'ID';
  itemTypeText      @title: 'Type' @UI.Hidden;
  itemType          @title: 'Type'
                    @Common.Text: itemTypeText @Common.TextArrangement: #TextOnly
                    @Common.ValueListWithFixedValues
                    @Common.ValueList: {
                      CollectionPath: 'ItemTypes',
                      Parameters: [{ $Type: 'Common.ValueListParameterInOut', LocalDataProperty: itemType, ValueListProperty: 'itemType' }]
                    };
  description       @title: 'Description';
  providerId        @title: 'Provider';
  roleCount         @title: 'Roles';
  isOrphan          @title: 'Not in any role';
  snapshotName      @title: 'Snapshot'
                    @Common.ValueListWithFixedValues
                    @Common.ValueList: {
                      CollectionPath: 'Snapshots',
                      Parameters: [{ $Type: 'Common.ValueListParameterInOut', LocalDataProperty: snapshotName, ValueListProperty: 'name' }]
                    };
}

annotate service.ItemTypes with { itemType @title: 'Type' };

annotate service.Usages with {
  ID          @UI.Hidden;
  item        @UI.Hidden;
  usedIn      @UI.Hidden;
  snapshot    @UI.Hidden;
  usedInTitle @title: 'Used in';
  usedInId    @title: 'ID';
  usedInType  @title: 'Type';
  itemTitle   @title: 'Item';
  itemType    @title: 'Type';
  direct      @title: 'Direct';
  assignmentCriticality @UI.Hidden;
  assignment  @title: 'Assignment';
  depth       @title: 'Depth';
  path        @title: 'Path';
  relation    @title: 'Relation';
}

annotate service.Snapshots with {
  name          @title: 'Snapshot';
  fileName      @title: 'File';
  itemCount     @title: 'Items';
  relationCount @title: 'Relations';
  message       @title: 'Import result';
  createdAt     @title: 'Imported at';
  createdBy     @title: 'Imported by';
}

/* -------------------------------------------------------------- list page */

annotate service.ContentItems with @(
  UI.SelectionFields: [ itemType, isOrphan, snapshotName, roleCount ],

  UI.LineItem: [
    { Value: title, ![@UI.Importance]: #High },
    { Value: itemType, ![@UI.Importance]: #High },
    { Value: itemId },
    { Value: roleCount, Criticality: orphanCriticality, ![@UI.Importance]: #High },
    { Value: isOrphan, Criticality: orphanCriticality },
    { Value: providerId },
    { Value: snapshotName }
  ],

  UI.PresentationVariant: {
    SortOrder: [{ Property: title }],
    Visualizations: [ '@UI.LineItem' ]
  },

  /* ------------------------------------------------------------ object page */

  UI.HeaderInfo: {
    TypeName: 'Content Item',
    TypeNamePlural: 'Content Items',
    Title: { Value: title },
    Description: { Value: itemId }
  },

  UI.HeaderFacets: [
    { $Type: 'UI.ReferenceFacet', Target: '@UI.DataPoint#roleCount' },
    { $Type: 'UI.ReferenceFacet', Target: '@UI.FieldGroup#Header' }
  ],
  UI.DataPoint #roleCount: { Value: roleCount, Title: 'Roles', Criticality: orphanCriticality },
  UI.FieldGroup #Header: { Data: [ { Value: itemType }, { Value: snapshotName } ] },

  UI.FieldGroup #General: { Data: [
    { Value: title }, { Value: itemId }, { Value: itemType }, { Value: description }, { Value: providerId }
  ]},

  UI.Facets: [
    { $Type: 'UI.ReferenceFacet', ID: 'Roles',    Label: 'Roles',    Target: 'roles/@UI.LineItem' },
    { $Type: 'UI.ReferenceFacet', ID: 'Pages',    Label: 'Pages',    Target: 'pages/@UI.LineItem' },
    { $Type: 'UI.ReferenceFacet', ID: 'Spaces',   Label: 'Spaces',   Target: 'spaces/@UI.LineItem' },
    { $Type: 'UI.ReferenceFacet', ID: 'Catalogs', Label: 'Catalogs', Target: 'catalogs/@UI.LineItem' },
    { $Type: 'UI.ReferenceFacet', ID: 'Groups',   Label: 'Groups',   Target: 'groups/@UI.LineItem' },
    { $Type: 'UI.ReferenceFacet', ID: 'Contains', Label: 'Contains', Target: 'contains/@UI.LineItem#Contains' },
    { $Type: 'UI.ReferenceFacet', ID: 'General',  Label: 'General',  Target: '@UI.FieldGroup#General' }
  ]
);

/* where-used rows (item -> used in) */
annotate service.Usages with @(
  UI.LineItem: [
    { Value: usedInTitle, ![@UI.Importance]: #High },
    { Value: usedInId },
    { Value: assignment, Criticality: assignmentCriticality, ![@UI.Importance]: #High },
    { Value: path, ![@UI.Importance]: #High }
  ],
  UI.LineItem #Contains: [
    { Value: itemTitle, ![@UI.Importance]: #High },
    { Value: itemType, ![@UI.Importance]: #High },
    { Value: relation }
  ],
  UI.PresentationVariant: { SortOrder: [{ Property: depth }, { Property: usedInTitle }], Visualizations: [ '@UI.LineItem' ] }
);
