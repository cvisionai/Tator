class SaveDialog extends TatorElement {
  constructor() {
    super();

    this._div = document.createElement("div");
    this._div.setAttribute("class", "annotation__panel--popup annotation__panel px-4 rounded-2");
    this._div.style.zIndex = 3;
    this._shadow.appendChild(this._div);

    const header = document.createElement("div");
    header.setAttribute("class", "d-flex flex-items-center flex-justify-between py-3");
    this._div.appendChild(header);

    this._span = document.createElement("span");
    this._span.setAttribute("class", "text-semibold");
    header.appendChild(this._span);

    this._type = document.createElement("enum-input");
    this._type.setAttribute("name", "Type");
    this._div.appendChild(this._type);

    this._attributes = document.createElement("attribute-panel");
    this._div.appendChild(this._attributes);

    const favesDiv = document.createElement("div");
    favesDiv.setAttribute("class", "annotation__panel-group py-2 text-gray f2");
    this._div.appendChild(favesDiv);

    this._favorites = document.createElement("favorites-panel");
    favesDiv.appendChild(this._favorites);

    const buttons = document.createElement("div");
    buttons.setAttribute("class", "d-flex flex-items-center py-4");
    this._div.appendChild(buttons);

    this._save = document.createElement("button");
    this._save.setAttribute("class", "btn btn-clear");
    this._save.setAttribute("disabled", "");
    this._save.textContent = "Save";
    buttons.appendChild(this._save);

    const cancel = document.createElement("button");
    cancel.setAttribute("class", "btn-clear px-4 text-gray hover-text-white");
    cancel.textContent = "Cancel";
    buttons.appendChild(cancel);

    this._attributes.addEventListener("change", () => {
      this._values = this._attributes.getValues();
      if (this._values === null) {
        this._save.setAttribute("disabled", "");
      } else {
        this._save.removeAttribute("disabled");
      }
    });

    this._favorites.addEventListener("load", evt => {
      this._attributes.setValues({attributes: evt.detail});
    });

    this._favorites.addEventListener("store", evt => {
      this._favorites.store(this._values);
    });

    this._save.addEventListener("click", () => {
      this._values = this._attributes.getValues();
      this.saveObject(this._requestObj, this._values)
      if (this._metaMode)
      {
        // Update the meta cache
        this._metaCache = Object.assign({},this._values)
      }
      this._attributes.reset();
      this._trackId = null;
    });

    cancel.addEventListener("click", () => {
      this.dispatchEvent(new Event("cancel"));
      this._attributes.reset();
    });

    // Used for continuous track append.
    this._trackId = null;
  }

  init(projectId, mediaId, dataTypes, defaultType, undo, version, favorites) {

    this._projectId = projectId;
    this._mediaId = mediaId;
    this._undo = undo;
    this._version = version;
    this._favoritesData = favorites;

    // For the save dialog, the track search bar doesn't need to be shown.
    // The user only needs to modify the attributes in the dialog window.
    this._attributes.displaySlider(false);
    this._attributes.displayGoToLocalization(false);
    this._attributes.displayGoToTrack(false);

    // Set choices on type selector.
    this._type.choices = dataTypes.map(type => {return {label: type.name,
                                                        value: JSON.stringify(type)}});
    this._type.addEventListener("change", this._setDataType.bind(this));
    this._type.default = defaultType.name;
    this._type.reset();
    this._setDataType();

    // Hide the type selector if there is only one type.
    if (dataTypes.length == 1) {
      this._type.style.display = "none";
    }

    this._attributes.dispatchEvent(new Event("change"));
  }

  set stateMediaIds(val) {
    this._stateMediaIds = val;
  }

  // Save the underlying object to the database
  saveObject(requestObj, values)
  {
    // Defensively program against null attribute values
    if (values == undefined || values == null)
    {
      values = {};
    }

    this.dispatchEvent(new CustomEvent("save", {
      detail: values
    }));

    if (this._dataType.isTrack && typeof requestObj.localization_ids === "undefined") {
      const localizationBody = {
        type: Number(this._dataType.localizationType.id.split("_")[1]),
        name: this._dataType.localizationType.name,
        version: this._version.id,
        media_id: this._mediaId,
        ...requestObj,
        ...values,
      };
      this._undo.post("Localizations", localizationBody, this._dataType.localizationType)
      .then(localizationResponse => {
        if (this._trackId === null) {
          // Track needs to be created.
          const trackBody = {
            type: Number(this._dataType.id.split("_")[1]),
            name: this._dataType.name,
            version: this._version.id,
            media_ids: [this._mediaId],
            localization_ids: localizationResponse[0].id,
            ...values,
          };
          return this._undo.post("States", trackBody, this._dataType);
        } else {
          this.dispatchEvent(new CustomEvent("addDetectionToTrack", {
            detail: {localizationType: this._dataType.localizationType.id,
                     trackType: this._dataType.id,
                     frame: requestObj.frame,
                     mainTrackId: this._trackId,
                     detectionId: localizationResponse[0].id[0],
                     selectTrack: false}
          }));
        }
      })
      .then(trackResponse => {
        if (trackResponse) {
          this._trackId = trackResponse[0].id[0];
        }
      })

    } else {
      var body = {
        type: Number(this._dataType.id.split("_")[1]),
        name: this._dataType.name,
        version: this._version.id,
        ...requestObj,
        ...values,
      };

      if (this._dataType.dtype.includes("state")) {
        if (this._stateMediaIds) {
          body.media_ids = this._stateMediaIds;
        }
        else {
          body.media_ids = [this._mediaId];
        }
        this._undo.post("States", body, this._dataType);
      }
      else {
        body.media_id = this._mediaId
        this._undo.post("Localizations", body, this._dataType);
      }
    }
  }

  set version(val) {
    this._version = val;
  }

  set canvasPosition(val) {
    this._canvasPosition = val;
    this._updatePosition();
  }

  set dragInfo(val) {
    this._dragInfo = val;
    this._updatePosition();
  }

  set metaMode(val) {
    this._metaMode = val;
    if (val == false)
    {
      this._metaCache = null;
    }
  }

  get metaMode() {
    return this._metaMode;
  }

  get metaCache() {
    return this._metaCache;
  }

  set requestObj(val) {
    this._requestObj = val;

    if (this._dataType.interpolation == "attr_style_range") {
      this._attributes.setFrameRange(val.frame, val.frame);
    }
  }

  addRecent(val) {
    this._recent.add(val);
  }

  _updatePosition() {
    const dragDefined = typeof this._dragInfo !== "undefined";
    const canvasDefined = typeof this._canvasPosition !== "undefined";
    if (dragDefined && canvasDefined) {
      const boxTop = Math.min(this._dragInfo.start.y, this._dragInfo.end.y) - 2;
      const boxRight = Math.max(this._dragInfo.start.x, this._dragInfo.end.x);
      let thisTop = boxTop + this._canvasPosition.top;
      let thisLeft = boxRight + 20 + this._canvasPosition.left;
      if ((thisLeft + this.clientWidth) > window.innerWidth) {
        const boxLeft = Math.min(this._dragInfo.start.x, this._dragInfo.end.x);
        thisLeft = boxLeft - 20 - this.clientWidth + this._canvasPosition.left;
      }
      if ((thisTop + this.clientHeight) > window.innerHeight) {
        const boxBottom = Math.max(this._dragInfo.start.y, this._dragInfo.end.y) + 2;
        thisTop = boxBottom - this.clientHeight + this._canvasPosition.top + 16;
      }
      // Prevent being drawn off screen
      thisTop = Math.max(thisTop, 50);
      thisLeft = Math.max(thisLeft, 50);
      this.style.top = thisTop + "px";
      this.style.left = thisLeft + "px";
    }
  }

  _setDataType() {
    this._dataType = JSON.parse(this._type.getValue());
    this._span.textContent = this._dataType.name;
    this._attributes.dataType = this._dataType;
    this._favorites.init(this._dataType, this._favoritesData);
  }
}

customElements.define("save-dialog", SaveDialog);
