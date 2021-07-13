class ConfirmRunAlgorithm extends ModalDialog {
  constructor() {
    super();

    const icon = document.createElement("modal-warning");
    this._header.insertBefore(icon, this._titleDiv);

    this._message = document.createElement("p");
    this._message.setAttribute("class", "text-semibold py-3 text-center");
    this._main.appendChild(this._message);

    this._accept = document.createElement("button");
    this._accept.setAttribute("class", "btn btn-clear btn-purple");
    this._accept.textContent = "Yes";
    this._footer.appendChild(this._accept);
    
    this._cancel = document.createElement("button");
    this._cancel.setAttribute("class", "btn btn-clear btn-charcoal");
    this._cancel.textContent = "No";
    this._footer.appendChild(this._cancel);

    this._cancel.addEventListener("click", () => {
      this.dispatchEvent(
        new CustomEvent("close",
          {composed: true,
           detail: {
             confirm: false}}));
    });

    this._accept.addEventListener("click", () => {
      this.dispatchEvent(
        new CustomEvent("close",
          {composed: true,
           detail: {
             confirm: true,
             projectId: this._projectId,
             mediaIds: this._mediaIds,
             mediaQuery: this._mediaQuery,
             algorithmName: this._algorithmName,
             extraParameters: this._extraParameters}}));
    });
  }

  /**
   * Initialize the dialog window with the algorithm information prior
   * to displaying it
   * 
   * @param {integer} projectId Project ID associate with algorithm
   * @param {string} algorithmName Name of algorithm to run
   * @param {array} mediaIds List of media IDs to process
   * @param {string} mediaQuery Media query string when launching algorithm
   * @param {array} extraParameters #TODO add useful info
   */
  init(algorithmName, projectId, mediaIds, mediaQuery, extraParameters)
  {
    this._title.nodeValue = "Run Algorithm";
    this._message.textContent = "Do you want to run " + algorithmName + "?";
    this._algorithmName = algorithmName;
    this._projectId = projectId;
    this._mediaIds = mediaIds;
    this._mediaQuery = mediaQuery;
    this._extraParameters = extraParameters;
  }

  static get observedAttributes() {
    return ModalDialog.observedAttributes;
  }

  attributeChangedCallback(name, oldValue, newValue) {
    ModalDialog.prototype.attributeChangedCallback.call(this, name, oldValue, newValue);
  }
}

customElements.define("confirm-run-algorithm", ConfirmRunAlgorithm);
