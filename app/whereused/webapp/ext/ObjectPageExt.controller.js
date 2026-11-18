sap.ui.define(["sap/ui/core/mvc/ControllerExtension", "sap/ui/core/routing/HashChanger"], function (ControllerExtension, HashChanger) {
  "use strict";

  /**
   * The object page tables list Usages rows. Pressing a row opens the content item
   * behind it (the role, space, page, ... or, in "Contains", the contained item)
   * instead of a detail page of the usage itself.
   */
  return ControllerExtension.extend("be.lemtech.wz.whereused.ext.ObjectPageExt", {
    override: {
      routing: {
        onBeforeNavigation: function (parameters) {
          var context = parameters && parameters.bindingContext;
          var path = context && context.getPath();
          if (!path || !/\/(roles|pages|spaces|catalogs|groups|contains)\(/.test(path)) return false;

          var targetProperty = path.indexOf("/contains(") > -1 ? "item_ID" : "usedIn_ID";
          context.requestProperty(targetProperty).then(function (id) {
            // a plain hash change adds a browser history entry, so Back returns to the item you came from
            if (id) HashChanger.getInstance().setHash("ContentItems(" + id + ")");
          });
          return true;   // the default navigation is replaced
        }
      }
    }
  });
});
