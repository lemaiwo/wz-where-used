sap.ui.define([
  "sap/m/Dialog",
  "sap/m/Button",
  "sap/m/Label",
  "sap/m/Input",
  "sap/m/Text",
  "sap/m/MessageToast",
  "sap/m/MessageBox",
  "sap/m/VBox",
  "sap/ui/unified/FileUploader"
], function (Dialog, Button, Label, Input, Text, MessageToast, MessageBox, VBox, FileUploader) {
  "use strict";

  /** Reads a File as base64 (without the data: prefix). */
  function readAsBase64(file) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function () { resolve(String(reader.result).split(",")[1] || ""); };
      reader.onerror = function () { reject(reader.error); };
      reader.readAsDataURL(file);
    });
  }

  /** Calls the unbound OData V4 action through the app's model (handles CSRF and batching). */
  function callImport(model, data) {
    var op = model.bindContext("/importExport(...)");
    op.setParameter("name", data.name);
    op.setParameter("fileName", data.fileName);
    op.setParameter("content", data.content);
    return op.invoke("$auto").then(function () { return op.getBoundContext().getObject(); });
  }

  return {
    /**
     * Custom list report action. `this` is the FE ExtensionAPI.
     */
    open: function () {
      var api = this;
      var bundle = api.getModel("i18n").getResourceBundle();
      var model = api.getModel();
      var file = null;

      var nameInput = new Input({ placeholder: bundle.getText("importSnapshotPlaceholder"), width: "100%" });
      var uploader = new FileUploader({
        width: "100%",
        fileType: ["zip", "json"],
        sameFilenameAllowed: true,
        change: function (e) {
          file = e.getParameter("files") && e.getParameter("files")[0];
          if (file && !nameInput.getValue()) nameInput.setValue(file.name.replace(/\.(zip|json)$/i, ""));
        }
      });

      var dialog = new Dialog({
        title: bundle.getText("importTitle"),
        contentWidth: "32rem",
        content: new VBox({
          items: [
            new Text({ text: bundle.getText("importHint") }).addStyleClass("sapUiSmallMarginBottom"),
            new Label({ text: bundle.getText("importFile"), labelFor: uploader, required: true }), uploader,
            new Label({ text: bundle.getText("importSnapshot"), labelFor: nameInput }).addStyleClass("sapUiSmallMarginTop"), nameInput
          ]
        }).addStyleClass("sapUiSmallMargin"),
        beginButton: new Button({
          type: "Emphasized",
          text: bundle.getText("importStart"),
          press: function () {
            if (!file) { MessageToast.show(bundle.getText("importNoFile")); return; }
            dialog.setBusyIndicatorDelay(0).setBusy(true);
            readAsBase64(file)
              .then(function (content) {
                return callImport(model, { name: nameInput.getValue() || file.name, fileName: file.name, content: content });
              })
              .then(function (snapshot) {
                dialog.close();
                MessageBox.success(bundle.getText("importDone", [snapshot && snapshot.message || ""]));
                api.refresh();
              })
              .catch(function (err) {
                MessageBox.error(bundle.getText("importFailed", [err && err.message || String(err)]));
              })
              .finally(function () { dialog.setBusy(false); });
          }
        }),
        endButton: new Button({ text: bundle.getText("importCancel"), press: function () { dialog.close(); } }),
        afterClose: function () { dialog.destroy(); }
      });

      api.addDependent ? api.addDependent(dialog) : null;
      dialog.open();
    }
  };
});
