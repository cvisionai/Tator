class EntityGalleryPanelForm extends TatorElement {
  constructor() {
    super();

    // @TODO what can be reused for this?
    // this.todo = document.createElement("div");
    // this._shadow.appendChild(this.todo);

    this._div = document.createElement("div");
    this._shadow.appendChild(this._div);

    // #TODO This is a band-aid. We need to modify attribute-panel to not include
    // specific REST calls or utilize a modified form of the SettingsHelper
    this._attributes = document.createElement("attribute-panel");
    this._attributes.enableBuiltInAttributes = true;
    this._attributes.enableHiddenAttributes = true;
    this._attributes.permission = "View Only"; // start as view only - controlled by lock
    this._div.appendChild(this._attributes);

    this._attributes.addEventListener("change", this._emitChangedData.bind(this));
  }

  static get observedAttributes() {
    return ["permission"];
  }

  attributeChangedCallback(name, oldValue, newValue) {
    switch (name) {
      case "permission":
        this._attributes.permission = newValue; // start as view only - controlled by lock
        break;
    }
  }

  /**
   * #TODO In the future, we might want to actually display multiple types (e.g. media + loc)
   * @param {object} data - cardData (add more info)
   * @param {Media/Localization} attributePanelData
   */
  _init({ data, attributePanelData, associatedMedia }) {
    if (data.entityType) data.entityType.isTrack = false;
    this._attributes.dataType = data.entityType;
    this._attributes.displaySlider(false);
    this._attributes.displayGoToTrack(false);
    this._attributes.displayGoToLocalization(false);

    if (associatedMedia) {
      this._attributes.associatedMedia = associatedMedia;
    }

    this._data = data;
    this._attributes.setValues(attributePanelData);
    this._attributes.style.display = "block";
  }

  _emitChangedData() {
    var values = this._attributes.getValues();
    if (values !== null) {
      const detail = {
        detail: {
          id: this._data.id,
          values: values
        }
      };
      this.dispatchEvent(new CustomEvent("save", detail));
    }
  }

  updateValues({ newValues }) {
    this._attributes.setValues(newValues);
  }

  setValues(data) {
    this._attributes.setValues(data);
  }
}

customElements.define("entity-gallery-panel-form", EntityGalleryPanelForm);