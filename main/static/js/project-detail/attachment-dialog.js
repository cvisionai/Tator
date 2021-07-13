class AttachmentDialog extends ModalDialog {
  constructor() {
    super();
   
    // Rework the styles 
    this._div.setAttribute("class", "modal-wrap modal-wide d-flex");
    this._modal.setAttribute("class", "modal py-6 px-6 rounded-2");
    this._header.setAttribute("class", "px-3 py-3");
    this._titleDiv.setAttribute("class", "h2");
    this._title.nodeValue = "Attachments";
    this._main.remove();
    this._footer.remove();

    const tableDiv = document.createElement("div");
    tableDiv.setAttribute("class", "py-4 annotation__attachment-list");
    this._header.appendChild(tableDiv);

    this._table = document.createElement("table");
    this._table.setAttribute("class", "table col-12");
    tableDiv.appendChild(this._table);

    const thead = document.createElement("thead");
    thead.setAttribute("class", "f3 text-left text-gray text-uppercase text-semibold");
    this._table.appendChild(thead);

    const tr = document.createElement("tr");
    thead.appendChild(tr);

    const thName = document.createElement("th");
    thName.setAttribute("class", "py-3 col-11");
    thName.textContent = "Attachment";
    tr.appendChild(thName);

    const thDownload = document.createElement("th");
    tr.appendChild(thDownload);

    const spanDownload = document.createElement("span");
    spanDownload.setAttribute("class", "sr-only");
    spanDownload.textContent = "Download";
    thDownload.appendChild(spanDownload);

    this._tbodies = [];
  }

  init(attachments) {
    // Initializes the dialog.
    // attachments: returned object from Attachment endpoint.

    // Start by removing previous attachments.
    for (const tbody of this._tbodies) {
      this._table.removeChild(tbody);
    }
    this._tbodies = [];

    // Add new attachments.
    for (const attachment of attachments) {
      const tbody = document.createElement("tbody");
      this._table.appendChild(tbody);
      this._tbodies.push(tbody);

      const tr = document.createElement("tr");
      tbody.appendChild(tr);

      const tdName = document.createElement("td");
      tdName.textContent = attachment.name;
      tr.appendChild(tdName);

      const tdDownload = document.createElement("td");
      tdDownload.setAttribute("class", "px-2");
      tr.appendChild(tdDownload);

      const download = document.createElement("download-button");
      download.setAttribute("text", "");
      download.setAttribute("url", attachment.path);
      download.setAttribute("name", attachment.name);
      download.setAttribute("class", "btn-clear h2 text-gray hover-text-white");
      tdDownload.appendChild(download);
    }
  }
}

customElements.define("attachment-dialog", AttachmentDialog);
