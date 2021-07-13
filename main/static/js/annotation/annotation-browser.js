class AnnotationBrowser extends TatorElement {
  constructor() {
    super();

    this._panels = document.createElement("div");
    this._panels.setAttribute("class", "annotation__panels py-3 px-3");
    this._shadow.appendChild(this._panels);

    this._media = document.createElement("media-panel");
    this._panels.appendChild(this._media);

    this._framePanels = {};
    this._entityPanels = {};
    this._selectEntity = null;

    this._media.addEventListener("open", evt => {
      const typeId = evt.detail.typeId;
      this._openForTypeId(typeId);
    });
  }

  init(dataTypes, version, stateMediaIds, isVideo) {
    this._version = version;
    this._media.dataTypes = dataTypes;
    for (const dataType of dataTypes) {
      if (dataType.visible) {
        const entity = document.createElement("entity-browser");
        entity.dataType = dataType;
        entity.canvas = this._canvas;
        entity.noFrames = !isVideo;
        if (typeof this._permission !== "undefined") {
          entity.permission = this._permission;
        }
        entity.undoBuffer = this._undo;
        entity.annotationData = this._data;
        entity.style.display = "none";
        this._panels.appendChild(entity);
        this._entityPanels[dataType.id] = entity;
        entity.addEventListener("close", evt => {
          this._media.style.display = "block";
          for (const typeId in this._framePanels) {
            this._framePanels[typeId].style.display = "block";
          }
        });

        entity.addEventListener("goToTrack", evt => {
          this.selectEntity(evt.detail.track, true);
        });

        entity.addEventListener("goToLocalization", evt => {
          this.selectLocalizationFromTrack(evt.detail.track, evt.detail.frame);
        });
      }
    }
    for (const dataType of dataTypes) {
      const isFrameState = dataType.association == "Frame";
      const isInterpolated = dataType.interpolation !== "none";
      if (isFrameState && isInterpolated) {
        if (dataType.interpolation === "latest"){
          const frame = document.createElement("frame-panel");
          frame.setAttribute("media-id", this._mediaId);

          if (stateMediaIds) {
            frame.stateMediaIds = stateMediaIds;
          }

          frame.undoBuffer = this._undo;
          frame.annotationData = this._data;
          frame.version = this._version;
          frame.dataType = dataType;
          if (typeof this._permission !== "undefined") {
            frame.permission = this._permission;
          }
          this._panels.appendChild(frame);
          this._framePanels[dataType.id] = frame;
        }
      }
    }
  }

  selectEntityOnUpdate(entityId, entityTypeId) {
    for (const typeId in this._entityPanels) {
      if (typeId == entityTypeId) {
        this._entityPanels[typeId].selectEntityOnUpdate(entityId);
      }
    }
  }

  set canvas(val) {
    this._canvas = val;
  }

  set permission(val) {
    this._permission = val;
    for (const key in this._framePanels) {
      this._framePanels[key].permission = val;
    }
    for (const key in this._entityPanels) {
      this._entityPanels[key].permission = val;
    }
    this._media.permission = val;
  }

  set mediaInfo(val) {
    this._media.mediaInfo = val;
    this._mediaId = val.id;
  }

  set mediaType(val) {
    this._media.mediaType = val;
  }

  set undoBuffer(val) {
    this._undo = val;
    this._media.undoBuffer = val;
  }

  set annotationData(val) {
    this._data = val;
    this._media.annotationData = val;
  }

  set version(val) {
    this._version = val;
    for (const key in this._framePanels) {
      this._framePanels[key].version = val;
    }
  }

  _openForTypeId(typeId) {
    for (const key in this._framePanels) {
      if (key == typeId) {
        this._framePanels[key].style.display = "block";
      } else {
        this._framePanels[key].style.display = "none";
      }
    }
    for (const key in this._entityPanels) {
      if (key == typeId) {
        this._media.style.display = "none";
        this._entityPanels[key].style.display = "block";
      } else {
        this._entityPanels[key].style.display = "none";
      }
    }
  }

  frameChange(frame) {
    for (const typeId in this._framePanels) {
      this._framePanels[typeId].frameChange(frame);
    }
    for (const typeId in this._entityPanels) {
      this._entityPanels[typeId].frameChange(frame);
    }
  }

  selectLocalizationFromTrack(track, frame) {
    for (const dataTypeId in this._data._dataTypes) {
      const dataType = this._data._dataTypes[dataTypeId];
      if (!dataType.isTrack) {
        const data = this._data._dataByType.get(dataTypeId);

        // Note: This is a candidate for optimization in the future.
        for (const loc of data) {
          if (track.localizations.includes(loc.id)) {
            if (loc.frame == frame) {
              this.selectEntity(loc, true, true);
            }
          }
        }
      }
    }
  }

  /**
   *
   * @param {Object} obj
   * @param {bool} forceOpen
   * @param {bool} forceLocalization - only valid if forceOpen is true
   */
  selectEntity(obj, forceOpen = false, forceLocalization = false) {

    var typeId = obj.meta;
    var objDataType = this._data._dataTypes[typeId];
    var selectObj = obj;

    // Find the associated track if the given object is a localization
    var associatedState = null;
    if (objDataType.isLocalization && obj.id in this._data._trackDb)
    {
      associatedState = this._data._trackDb[obj.id];
    }

    // This variable can be changed in the future if there's a project setting to
    // force a default behavior when selecting a track
    var selectTrackInstead = !forceLocalization;
    if (!forceOpen)
    {
      // If the user has a state panel open and a track's localization was selected,
      // the panel should not be changed. It should stay on the state panel.
      //
      // If the user has the localization panel open and a track was selected,
      // the panel should not be changed. It should stay on the localization panel.
      for (const key in this._entityPanels)
      {
        const panel = this._entityPanels[key];
        const dataType = this._data._dataTypes[key];
        if (dataType.isTrack && panel.style.display == "block" && associatedState != null)
        {
          typeId = associatedState.meta;
          selectObj = associatedState;
          selectTrackInstead = false;
          break;
        }
        else if (dataType.isLocalization && panel.style.display == "block" && associatedState != null)
        {
          selectTrackInstead = false;
          break;
        }
      }
    }

    if (selectTrackInstead && associatedState != null)
    {
      typeId = associatedState.meta;
      selectObj = associatedState;
    }

    this._openForTypeId(typeId);
    if (typeId in this._entityPanels)
    {
      this._entityPanels[typeId].selectEntity(selectObj);
    }
    else
    {
      console.warn("No entity browser for object.");
    }
  }
}

customElements.define("annotation-browser", AnnotationBrowser);
