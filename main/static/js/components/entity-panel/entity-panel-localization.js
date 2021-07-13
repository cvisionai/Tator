class GalleryPanelLocalization extends TatorElement {
  constructor() {
    super();

    // @TODO
    this._main = document.createElement("main");
    this._undo = document.createElement("undo-buffer");
    this._data = document.createElement("annotation-data");
    this._versionLookup = {};

    // data
    // #TODO define this outside component
    this.panelData = document.createElement("annotation-panel-data");

    //
    this.savedMediaData = {};
  }

  init({ pageModal, modelData, panelContainer }) {
    this.pageModal = pageModal;
    this.modelData = modelData;
    this.panelContainer = panelContainer;
    this.panelData.init(modelData);
  }

  initAndShowData({ cardObj }) {
    // Identitifier used to get the canvas' media data
    const mediaId = cardObj.mediaId;
    const locId = cardObj.id;

    // Make a copy since we will be modifying this for annotator object
    this._localization = Object.assign({}, cardObj.localization);

    // @TODO optimize later - only init this the first time
    if (typeof this.savedMediaData[mediaId] !== "undefined" && this.savedMediaData[mediaId] !== null) {
      //  --> init the canvas from saved data
      let data = this.savedMediaData[mediaId];
      let dtype = this.savedMediaData[mediaId].mediaTypeData.dtype;

      this._setupCanvas({ dtype, mediaId, data });

    } else {
      // --> Get mediaData and save it to this card object
      this.panelData.getMediaData(mediaId).then((data) => {
        let dtype = data.mediaTypeData.dtype;
        this._setupCanvas({ dtype, mediaId, locId, data });

        // save this data in local memory until we need it again
        this.savedMediaData[mediaId] = data;
      });
    }
  }

  _setupCanvas({ dtype, mediaId, locId, data }) {
    this._player = (dtype == "image") ? this._setupImageCanvas() : this._setupVideoCanvas();
    this._player.addDomParent({
      "object": this.panelContainer,
      "alignTo": this._shadow
    });

    this._player.mediaType = data.mediaTypeData;
    this._player.mediaInfo = data.mediaInfo;
    this._getData();
  }

  _clearExistingCanvas() {
    if (typeof this._imageCanvas != "undefined") {
      this._imageCanvas.remove();
    }
    if (typeof this._videoCanvas != "undefined") {
      this._videoCanvas.remove();
    }
  }

  _setupImageCanvas() {

    this._clearExistingCanvas();

    this._imageCanvas = document.createElement("annotation-image");
    this._imageCanvas.annotationData = this._data;
    this._imageCanvas.undoBuffer = this._undo;
    this._shadow.appendChild(this._imageCanvas);

    this._player = this._imageCanvas;

    return this._imageCanvas;
  }

  _setupVideoCanvas() {

    this._clearExistingCanvas();

    this._videoCanvas = document.createElement("annotation-player");
    this._videoCanvas.disableAutoDownloads();
    this._videoCanvas.hideVideoControls();
    this._videoCanvas.hideVideoText();
    this._videoCanvas.disableShortcuts();
    this._videoCanvas.annotationData = this._data;
    this._videoCanvas.undoBuffer = this._undo;
    this._shadow.appendChild(this._videoCanvas);

    this._player = this._videoCanvas;

    return this._videoCanvas;
  }

  _popModalWithPlayer(e, modal = this.pageModal) {
    e.preventDefault();

    if (typeof modal == "undefined") this.pageModal = document.createElement("modal-dialog");

    // Title
    let text = document.createTextNode("test");
    this.pageModal._titleDiv.append(text);

    // Main Body
    this.pageModal._main.appendChild(this._shadow);

    // When we close modal, remove the player
    this.pageModal.addEventListener("close", this._removePlayer.bind(this));

    this.pageModal.setAttribute("is-open", "true")
  }

  _removePlayer() {
    // Clear this panel player and title from modal
    this.pageModal._titleDiv.innerHTML = "";
    this.pageModal._main.innerHTML = "";
  }

  _getData() {

    var dataTypes = [];
    var locTypes = this.modelData.getStoredLocalizationTypes();
    for (const locType of locTypes) {
      dataTypes.push(Object.assign({}, locType));
    }
    var versions = this.modelData.getStoredVersions();

    // Replace the data type IDs so they are guaranteed to be unique.
    for (let dataType of dataTypes) {
      dataType.id = dataType.dtype + "_" + dataType.id;
      dataType.isLocalization = true;
      dataType.isTrack = false;
      dataType.isTLState = false;
    }

    // Get the version object associated with this localization
    versions = versions.filter(version => version.number >= 0);
    for (const version of versions) {
      this._versionLookup[version.id] = version;
    }

    let selected_version;
    for (const version of versions) {
      if (version.id == this._localization.version) {
        selected_version = this._versionLookup[version.id];
      }
    }

    // Annotation data acquires the localization slightly differently.
    // Retrieve the localization from this buffer because the annotator assumes
    // the localization is in that format.
    var locDataType;
    for (let dataType of dataTypes) {
      if (dataType.id.split("_")[1] == this._localization.meta) {
        this._localization.meta = dataType.id;
        locDataType = dataType;
        break;
      }
    }
  if(locDataType){
        this._data.init(dataTypes, selected_version, this.modelData.getProjectId(), this._localization.media, false, false);
    this._player.undoBuffer = this._undo;
    this._player.annotationData = this._data;
    this._data.updateTypeWithData(locDataType, this._localization)

    this._player.addEventListener("canvasReady", () => {
        this._player.selectLocalization(this._localization);
    });
  }


  }
}
customElements.define("entity-panel-localization", GalleryPanelLocalization);