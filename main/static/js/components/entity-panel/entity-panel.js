class EntityGalleryPanel extends TatorElement {
  constructor() {
    super();

    // Panel 
    this._main = document.createElement("div");
    this._main.setAttribute("class", "entity-panel px-3");
    this._main.style.marginTop = "-20px"
    this._shadow.appendChild(this._main);

    // Optional static image
    this._staticImage = document.createElement("img");
    this._staticImage.hidden = true;
    this._main.appendChild(this._staticImage);

    // View in media
    this._mediaLinkEl = document.createElement("a");
    this._mediaLinkEl.appendChild(document.createTextNode("View In Annotator"));
    this._mediaLinkEl.setAttribute("class", "text-gray hover-text-white f3 clickable float-right");
    this._mediaLinkEl.setAttribute("href", "#");
    this._mediaLinkEl.setAttribute("target", "_blank");
    this._main.appendChild(this._mediaLinkEl);

    // Entity Data heading
    this._entityHeading = document.createElement("h3");
    this._entityHeading.setAttribute("class", "py-3 text-semibold");
    this._entityHeading.hidden = true;
    this._main.appendChild(this._entityHeading);

    // Entity Data in Form
    this.entityData = document.createElement("entity-gallery-panel-form");
    this.entityData.hidden = true;
    this._main.appendChild(this.entityData);

    // State Data heading (if state)
    this._stateHeading = document.createElement("h3");
    this._stateHeading.setAttribute("class", "py-3 text-semibold");
    this._stateHeading.hidden = true;
    this._main.appendChild(this._stateHeading);

    // State Data in Form
    this.stateData = document.createElement("entity-gallery-panel-form");
    this.stateData.hidden = true;
    this._main.appendChild(this.stateData);

    // Go to frame icon button
    this.goToFrameButton = document.createElement("entity-frame-link-button");
    this.goToFrameButton.button.setAttribute("tooltip", "View In Annotator");
    this.goToFrameButton.button.setAttribute("target", "_blank");
    this.goToFrameButton.style.marginLeft = "8px";

    // #TODO Encapsulate this class into a LocalizationGalleryPanel
    this._mediaHeading = document.createElement("h3");
    this._mediaHeading.setAttribute("class", "py-3 text-semibold");
    this._mediaHeading.style.margintop = "10px";
    this._main.appendChild(this._mediaHeading)

    const mediaSubHeading = document.createElement("h2");
    mediaSubHeading.setAttribute("class", "f2 text-gray");
    mediaSubHeading.appendChild(document.createTextNode("Go To Frame"));
    mediaSubHeading.appendChild(this.goToFrameButton);
    this._main.appendChild(mediaSubHeading)

    this.mediaData = document.createElement("entity-gallery-panel-form");
    this._main.appendChild(this.mediaData);
  }

  /**
   * Updates both the entity and the media data with the given card object
   * @param {Object} cardObj
   */
  async init({ cardObj }) {
    this.cardObj = cardObj;
    //console.log(this.cardObj);
    // Setup linkout and the entity data for panel here
    this._mediaLink = this.cardObj.mediaLink;
    this._mediaLinkEl.setAttribute("href", this._mediaLink);
    this.goToFrameButton.button.setAttribute("href", this._mediaLink);

    // Init the forms with data
    if (!(this.cardObj.stateInfo && this.cardObj.stateType && this.cardObj.stateType == "Media")) {
      /* Panel heading with type name */
      let typeName = this.cardObj.entityType.name
      let typeNameText = document.createTextNode(typeName);
      this._entityHeading.appendChild(typeNameText);

      /* Unhide & Init panel form */
      this.showEntityData();
      this.entityData._init({
        data: this.cardObj,
        attributePanelData: this.cardObj.localization,
        associatedMedia: this.cardObj.mediaInfo.media
      });
    }

    // Any card with state information
    if (this.cardObj.stateInfo) {
      /* Panel heading with type name */
      let typeName = this.cardObj.stateInfo.entityType.name
      let typeNameText = document.createTextNode(typeName);
      this._stateHeading.appendChild(typeNameText);

      /* Unhide & Init panel form */
      this.showStateData();
      this.stateData._init({
        data: this.cardObj.stateInfo,
        attributePanelData: this.cardObj.stateInfo.state,
      });
    }

    // Any card with media information
    if (this.cardObj.mediaInfo) {
      /* Panel heading with type name */
      let typeName = this.cardObj.mediaInfo.entityType.name;
      let typeNameText = document.createTextNode(typeName);
      this._mediaHeading.appendChild(typeNameText);

      /* Init panel form */
      this.mediaData._init({
        data: this.cardObj.mediaInfo,
        attributePanelData: this.cardObj.mediaInfo.media
      });
    }
  }

  setImage(imageSource) {
    this._staticImage.setAttribute("src", imageSource);
  }

  showStateData() {
    this._stateHeading.hidden = false;
    this.stateData.hidden = false;
  }

  showEntityData() {
    this._entityHeading.hidden = false;
    this.entityData.hidden = false;
  }

  setMediaData(cardObj) {
    this.cardObj = cardObj;
    this.mediaData.setValues(this.cardObj.mediaInfo);
  }
}

customElements.define("entity-gallery-panel", EntityGalleryPanel);