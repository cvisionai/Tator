class VideoSettingsDialog extends ModalDialog {
  constructor() {
    super();

    this._div.setAttribute("class", "modal-wrap modal-wide d-flex");
    //this._modal.setAttribute("class", "modal py-6 px-6 rounded-2");
    //this._header.setAttribute("class", "px-3 py-3");
    //this._titleDiv.setAttribute("class", "h2");
    this._title.nodeValue = "Advanced Video Settings";
    //this._main.setAttribute("class", "modal__main px-3 py-4");
    //this._titleDiv.style.marginBottom = "10px";
    //this._main.remove();

    this._gridDiv = document.createElement("div");
    this._gridDiv.setAttribute("class", "video__settings py-4 px-4 text-gray");
    this._main.appendChild(this._gridDiv);

    const gridLabel = document.createElement("div");
    gridLabel.setAttribute("class", "h3 d-flex flex-items-center text-uppercase")
    gridLabel.textContent = "Video Buffer Sources";
    gridLabel.style.gridColumn = 1;
    gridLabel.style.gridRow = 1;
    this._gridDiv.appendChild(gridLabel);

    const defaultButton = document.createElement("button");
    defaultButton.setAttribute("class", "btn btn-clear btn-charcoal col-12 btn-small");
    defaultButton.textContent = "Restore Defaults";
    defaultButton.style.gridColumn = 2;
    defaultButton.style.gridRow = 1;
    this._gridDiv.appendChild(defaultButton);

    const overlayGridDiv = document.createElement("div");
    overlayGridDiv.setAttribute("class", "video__settings py-4 px-4 text-gray");
    this._main.appendChild(overlayGridDiv);

    const overlayHeaderDiv = document.createElement("div");
    overlayHeaderDiv.style.gridColumn = 1;
    overlayHeaderDiv.style.gridRow = 1;
    overlayGridDiv.appendChild(overlayHeaderDiv);

    const overlayHeader = document.createElement("div");
    overlayHeader.textContent = "Diagnostics Overlay";
    overlayHeader.setAttribute("class", "h3 d-flex flex-items-center text-uppercase")
    overlayHeaderDiv.appendChild(overlayHeader);

    const overlaySubHeader = document.createElement("div");
    overlaySubHeader.textContent = "Toggle displaying video's ID, current frame, FPS, and source qualities";
    overlaySubHeader.setAttribute("class", "text-gray f2");
    overlayHeaderDiv.appendChild(overlaySubHeader);

    const overlayOption = document.createElement("bool-input");
    overlayOption.setAttribute("class", "col-12");
    overlayOption.style.gridColumn = 2;
    overlayOption.style.gridRow = 1;
    overlayOption.setAttribute("name", "");
    overlayOption.setAttribute("off-text", "Off");
    overlayOption.setAttribute("on-text", "On");
    overlayOption.reset();
    overlayGridDiv.appendChild(overlayOption);

    const safeModeGridDiv = document.createElement("div");
    safeModeGridDiv.setAttribute("class", "video__settings py-4 px-4 text-gray");
    this._main.appendChild(safeModeGridDiv);

    const safeModeHeaderDiv = document.createElement("div");
    safeModeHeaderDiv.style.gridColumn = 1;
    safeModeHeaderDiv.style.gridRow = 1;
    safeModeGridDiv.appendChild(safeModeHeaderDiv);

    const safeModeHeader = document.createElement("div");
    safeModeHeader.textContent = "Safe Mode";
    safeModeHeader.setAttribute("class", "h3 d-flex flex-items-center text-uppercase")
    safeModeHeaderDiv.appendChild(safeModeHeader);

    const safeModeSubHeader = document.createElement("div");
    safeModeSubHeader.textContent = "Allow safe mode to occur";
    safeModeSubHeader.setAttribute("class", "text-gray f2");
    safeModeHeaderDiv.appendChild(safeModeSubHeader);

    const safeModeOption = document.createElement("bool-input");
    safeModeOption.setAttribute("class", "col-12");
    safeModeOption.style.gridColumn = 2;
    safeModeOption.style.gridRow = 1;
    safeModeOption.setAttribute("name", "");
    safeModeOption.setAttribute("off-text", "Off");
    safeModeOption.setAttribute("on-text", "On");
    safeModeOption.setValue(true);
    safeModeGridDiv.appendChild(safeModeOption);

    const apply = document.createElement("button");
    apply.setAttribute("class", "btn btn-clear");
    apply.textContent = "Apply";
    this._footer.appendChild(apply);

    // Dispatches the event with the quality information
    apply.addEventListener("click", () => {
      this.removeAttribute("is-open");
      this.dispatchEvent(new Event("close"));
      this.dispatchEvent(new CustomEvent("applyVideoSources", {
        composed: true,
        detail: {
          playback: this.getSourceObject("play"),
          seek: this.getSourceObject("seek"),
          scrub: this.getSourceObject("scrub"),
          focusPlayback: this.getSourceObject("focusPlayback"),
          dockPlayback: this.getSourceObject("dockPlayback")
        }
      }));
    });

    // Sets all the choices to the defaults
    defaultButton.addEventListener("click", () => {
      this.applyDefaults();
    });

    // Display video diagnostics
    overlayOption.addEventListener("change", () => {
      this.dispatchEvent(new CustomEvent("displayOverlays", {
        composed: true,
        detail: {
          displayDiagnostic: overlayOption.getValue()
        }
      }));
    });

    // Enable/disable safe mode
    safeModeOption.addEventListener("change", () => {
      this.dispatchEvent(new CustomEvent("allowSafeMode", {
        composed: true,
        detail: {
          allowSafeMode: safeModeOption.getValue()
        }
      }))
    });

    this._divOptions = {};
    this._createBuffer(2, "scrub", "Scrub Buffer", "Timeline scrubbing, downloaded playback, greater than 4x playback");
    this._createBuffer(3, "seek", "Seek Quality", "Pause quality");
    this._createBuffer(4, "play", "On-Demand 1x-4x Playback", "1x-4x playback for single vidoes and grid videos");
    this._createBuffer(5, "focusPlayback", "Focused On-Demand 1x-4x Playback", "1x-4x playback for the focused video (if present)");
    this._createBuffer(6, "dockPlayback", "Docked On-Demand 1x-4x Playback", "1x-4x playback for docked videos (if present)");
  }

  _createBuffer(gridRow, id, title, description) {

    this._divOptions[id] = {};

    var textDiv = document.createElement("div");
    textDiv.style.gridColumn = 1;
    textDiv.style.gridRow = gridRow;
    this._gridDiv.appendChild(textDiv);
    this._divOptions[id].textDiv = textDiv;

    const header = document.createElement("div");
    header.textContent = title;
    header.setAttribute("class", "text-semibold text-white h3");
    textDiv.appendChild(header);

    const subHeader = document.createElement("div");
    subHeader.textContent = description;
    subHeader.setAttribute("class", "text-gray f2");
    textDiv.appendChild(subHeader);

    const choiceDiv = document.createElement("div");
    choiceDiv.style.gridColumn = 2;
    choiceDiv.style.gridRow = gridRow;
    this._gridDiv.appendChild(choiceDiv);
    this._divOptions[id].choiceDiv = choiceDiv;

    const choice = document.createElement("enum-input");
    choice.setAttribute("name", "Source");
    choiceDiv.appendChild(choice);
    this._divOptions[id].choice = choice;
  }

  applySettings(settings) {
    let settingsStr = "";

    settingsStr = this.createSourceString(settings.scrubQuality, settings.scrubFPS);
    this._divOptions["scrub"].choice.setValue(settingsStr);

    settingsStr = this.createSourceString(settings.seekQuality, settings.seekFPS);
    this._divOptions["seek"].choice.setValue(settingsStr);

    settingsStr = this.createSourceString(settings.playQuality, settings.playFPS);
    this._divOptions["play"].choice.setValue(settingsStr);

    if (this._mode == "multiview") {
      settingsStr = this.createSourceString(settings.focusedQuality, settings.focusedFPS);
      this._divOptions["focusPlayback"].choice.setValue(settingsStr);

      settingsStr = this.createSourceString(settings.dockedQuality, this._defaultSources.dockedFPS);
      this._divOptions["dockPlayback"].choice.setValue(settingsStr);
    }
  }

  applyDefaults() {
    if (this._defaultSources == undefined) {
      return;
    }

    this.applySettings(this._defaultSources);
  }

  /**
   * Generates the source string displayed to the user based on given parameters
   * @param {integer} quality
   * @param {float} fps
   * @returns {string}
   */
  createSourceString(quality, fps) {
    return `${quality}p, ${fps.toFixed(2)} FPS`;
  }

  /**
   * Generates the object describing the selected video source
   * @param {string} sourceName - source name used in this dialog and video.js / multiview
   * @returns {object} Has .fps {Number} and .quality {Number} and .name {string} properties
   */
  getSourceObject(sourceName) {

    if ((sourceName == "focusPlayback" && this._mode != "multiview") ||
        (sourceName == "dockPlayback" && this._mode != "multiview")) {
      return null;
    }

    var str = this._divOptions[sourceName].choice.getValue();
    const quality = parseInt(str.split("p")[0]);
    const fps = parseFloat(str.split(",")[1].split("FPS")[0]);

    return {
      quality: quality,
      fps: fps,
      name: sourceName
    };
  }

  /**
   * #TODO only the first entry in the given media array is used.
   *       Future versions of this should display the medias
   *
   * @param {string} mode - single|multiview
   * @param {array} medias - Array of media objects to set the display
   */
  mode(mode, medias) {
    this._mode = mode;
    this._medias = medias;
    if (this._mode == "live")
    {
      //TODO implement this
      return;
    }

    let mainVideo = this._medias[0];
    let sourceList = [];
    for (let mediaFile of mainVideo.media_files["streaming"])
    {
      let sourceStr = this.createSourceString(mediaFile.resolution[0], this._medias[0].fps);
      sourceList.push({"value": sourceStr});
    }

    this._divOptions["scrub"].choice.choices = sourceList;
    this._divOptions["seek"].choice.choices = sourceList;
    this._divOptions["play"].choice.choices = sourceList;
    this._divOptions["focusPlayback"].choice.choices = sourceList;
    this._divOptions["dockPlayback"].choice.choices = sourceList;

    if (mode == "single")
    {
      this._divOptions["focusPlayback"].textDiv.style.display = "none";
      this._divOptions["dockPlayback"].textDiv.style.display = "none";
      this._divOptions["focusPlayback"].choiceDiv.style.display = "none";
      this._divOptions["dockPlayback"].choiceDiv.style.display = "none";

    }
    else if (mode == "multiview")
    {
      this._divOptions["focusPlayback"].textDiv.style.display = "block";
      this._divOptions["dockPlayback"].textDiv.style.display = "block";
      this._divOptions["focusPlayback"].choiceDiv.style.display = "block";
      this._divOptions["dockPlayback"].choiceDiv.style.display = "block";
    }
    else if (mode == "live")
    {
      // TODO
    }
    this.applyDefaults();
  }

  /**
   * @param {object} val - source buffer info with the following properties
   *     seekQuality
   *     seekFPS
   *     scrubQuality
   *     scrubFPS
   *     playQuality
   *     playFPS
   *     focusedQuality
   *     focusedFPS
   *     dockedQuality
   *     dockedFPS
   */
  set defaultSources(val)
  {
    this._defaultSources = val;
    this.applyDefaults();
  }
}

customElements.define("video-settings-dialog", VideoSettingsDialog);
