class EntitySelector extends TatorElement {
  constructor() {
    super();

    this._div = document.createElement("div");
    this._div.setAttribute("class", "d-flex flex-items-center flex-justify-between position-relative entity__selector");
    this._shadow.appendChild(this._div);

    this._expand = document.createElement("button");
    this._expand.setAttribute("class", "annotation__entity btn-clear px-4 col-12 css-truncate text-white");
    this._div.appendChild(this._expand);

    this._name = document.createElement("span");
    this._name.setAttribute("class", "text-semibold");
    this._expand.appendChild(this._name);

    this._count = document.createElement("span");
    this._count.setAttribute("class", "px-1 text-gray");
    this._expand.appendChild(this._count);

    const controls = document.createElement("div");
    controls.setAttribute("class", "annotation__entity-count d-flex flex-items-center px-4");
    this._div.appendChild(controls);

    const prev = document.createElement("entity-prev-button");
    controls.appendChild(prev);

    const details = document.createElement("details");
    details.setAttribute("class", "position-relative");
    controls.appendChild(details);

    const summary = document.createElement("summary");
    summary.setAttribute("class", "d-flex flex-items-center px-1");
    summary.style.cursor = "pointer";
    details.appendChild(summary);

    this._current = document.createElement("span");
    this._current.setAttribute("class", "px-1 text-gray");
    this._current.textContent = "1";
    summary.appendChild(this._current);

    const styleDiv = document.createElement("div");
    styleDiv.setAttribute("class", "files__main files-wrap");
    details.appendChild(styleDiv);

    const div = document.createElement("div");
    div.setAttribute("class", "more d-flex flex-column f2 py-3 px-2");
    styleDiv.appendChild(div);

    this._slider = document.createElement("input");
    this._slider.setAttribute("class", "range flex-grow");
    this._slider.setAttribute("type", "range");
    this._slider.setAttribute("step", "1");
    this._slider.setAttribute("min", "0");
    this._slider.setAttribute("value", "0");
    div.appendChild(this._slider);

    const next = document.createElement("entity-next-button");
    controls.appendChild(next);

    this._goToFrameButton = document.createElement("entity-frame-button");
    this._goToFrameButton.style.marginLeft = "8px";
    controls.appendChild(this._goToFrameButton);

    this._del = document.createElement("entity-delete-button");
    this._del.style.marginLeft = "8px";
    this._del.style.display = "none";
    controls.appendChild(this._del);

    const capture = document.createElement("button");
    capture.setAttribute("class", "btn-clear d-flex flex-justify-center px-2 py-2 rounded-2 f2 text-white entity__button");
    capture.style.marginLeft="8px";
    capture.style.display="none";
    controls.appendChild(capture);

    const svg = document.createElementNS(svgNamespace, "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("height", "1em");
    svg.setAttribute("width", "1em");
    svg.setAttribute("stroke", "currentColor");
    svg.setAttribute("stroke-width", "2");
    svg.setAttribute("stroke-linejoin", "round");
    svg.setAttribute("stroke-linecap", "round");
    svg.setAttribute("fill", "none");
    // override CSS for this icon
    svg.style.fill = "none";
    capture.appendChild(svg);

    const title = document.createElementNS(svgNamespace, "title");
    title.textContent = "Capture View";
    svg.appendChild(title);

    const path = document.createElementNS(svgNamespace, "path");
    path.setAttribute("d", "M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z");
    svg.appendChild(path);

    const circle = document.createElementNS(svgNamespace, "circle");
    circle.setAttribute("cx", "12");
    circle.setAttribute("cy", "13");
    circle.setAttribute("r", "4");
    svg.appendChild(circle);
    capture.appendChild(svg);

    const redraw = document.createElement("entity-redraw-button");
    redraw.style.marginLeft="8px";
    redraw.style.display="none";
    controls.appendChild(redraw);

    const more = document.createElement("entity-more");
    controls.appendChild(more);

    this._autoGoToEntityFrame = false;

    this._expand.addEventListener("click", () => {
      this._div.classList.toggle("is-open");
      if (this._div.classList.contains("is-open")) {
        this.dispatchEvent(new Event("open"));
        this._emitSelection(true, true, this._autoGoToEntityFrame);
      } else {
        this.dispatchEvent(new Event("close"));
      }
    });

    prev.addEventListener("click", () => {
      const index = parseInt(this._current.textContent) - 1;
      if (index > 0) {
        this._current.textContent = String(index);
      }
      this._emitSelection(true, true, this._autoGoToEntityFrame);
    });

    next.addEventListener("click", () => {
      const index = parseInt(this._current.textContent) + 1;
      if (index <= this._data.length) {
        this._current.textContent = String(index);
      }
      this._emitSelection(true, true, this._autoGoToEntityFrame);
    });

    this._goToFrameButton.addEventListener("click", () => {
      this._emitSelection(true, true, true);
    })

    capture.addEventListener("click", () => {
      capture.blur();
      this._emitCapture();
    });

    this._del.addEventListener("click", () => {
      let endpoint;
      const index = parseInt(this._current.textContent) - 1;
      if (this._dataType.isLocalization) {
        endpoint = "Localization";
        this._canvas.deleteLocalization(this._data[index]);
      } else {
        endpoint = "State";
        this._undo.del(endpoint, this._data[index].id, this._dataType).then(() => {
          if (this._dataType.delete_child_localizations) {
            this._canvas.updateAllLocalizations();
          }
        });
      }

    });

    redraw.addEventListener("click", () => {
      const index = parseInt(this._current.textContent) - 1;
      this.dispatchEvent(new CustomEvent("patchMeta", {
        detail: {typeId: this._dataType.id,
                 obj: this._data[index]},
        composed: true,
      }));
    });

    more.addEventListener("click", () => {
      if (capture.style.display == "none") {
        if (hasPermission(this._permission, "Can Edit")) {
          this._del.style.display = "block";
          redraw.style.display = "block";
        } else {
          this._del.style.display = "none";
          redraw.style.display = "none";
        }
        // Clear out the display regardless of whether this is a localization or state (e.g. track)
        capture.style.display = null;
      } else {
        this._del.style.display = "none";
        capture.style.display = "none";
        redraw.style.display = "none";
      }
    });

    details.addEventListener("click", () => {
      const detailsClosed = !details.hasAttribute("open");
      const attributesClosed = !this._div.classList.contains("is-open");
      if (detailsClosed && attributesClosed) {
        this._expand.click();
      }
      setTimeout(() => this._slider.focus(), 0);
    });

    this._slider.addEventListener("input", () => {
      this._current.textContent = String(Number(this._slider.value) + 1);
      this._emitSelection(true, true, this._autoGoToEntityFrame);
    });
  }

  static get observedAttributes() {
    return ["name"];
  }

  attributeChangedCallback(name, oldValue, newValue) {
    switch (name) {
      case "name":
        this._name.textContent = newValue;
        break;
    }
  }

  set canvas(val)
  {
    this._canvas = val;
  }
  set permission(val) {
    this._permission = val;
  }

  /**
   * @param {bool} val - True if frame jump should be emitted if next/prev is selected.
   *                     False won't auto frame jump. User has to explicitly use the
   *                     track slider or frame jump button
   */
  set autoGoToFrame(val) {
    this._autoGoToEntityFrame = val;
  }

  get data() {
    const index = parseInt(this._current.textContent) - 1;
    return this._data[index];
  }

  set dataType(val) {
    this._dataType = val;
  }

  set undoBuffer(val) {
    this._undo = val;
  }

  set noFrames(val) {
    this._noFrames = val;
    if (this._noFrames) {
      this._goToFrameButton.style.display = "none";
    }
    else {
      this._goToFrameButton.style.display = "block";
    }
  }

  set globalDataBuffer(val) {
    this._globalData = val;
  }

  update(data) {
    this._data = data;
    this._count.textContent = String(data.length);
    const haveData = data.length > 0;
    const current = parseInt(this._current.textContent);
    this._slider.max = data.length - 1;
    if (haveData && (current == 0)) {
      this._current.textContent = "0";
      this._slider.value = 0;
    }
    if (haveData && (current > data.length)) {
      this._current.textContent = String(data.length);
      this._slider.value = data.length - 1;
    }

    if (this._selectAttempt) {
      this.selectEntity(this._selectAttempt, true);
    }

    this._emitSelection(false, true, false);
  }

  /**
   * Potentially could condense with selectEntity
   */
  selectEntityWithId(id, emitSelectEvent) {
    var selectedObject = false;
    for (const [index, data] of this._data.entries()) {
      if (data.id == id) {
        this._div.classList.add("is-open");
        this.dispatchEvent(new Event("open"));
        this._current.textContent = String(index + 1);
        this._slider.value = index;
        selectedObject = true;
        break;
      }
    }

    if (emitSelectEvent && selectedObject) {
      this._emitSelection(true, true, true);
    }
  }

  selectEntity(obj, attemptPrevSelect) {
    var selectedObject = false;
    for (const [index, data] of this._data.entries()) {
      if (data.id == obj.id) {
        this._div.classList.add("is-open");
        this.dispatchEvent(new Event("open"));
        this._current.textContent = String(index + 1);
        this._slider.value = index;
        selectedObject = true;
        break;
      }
    }

    if (attemptPrevSelect) {
      this._selectAttempt = null;
      return;
    }

    // If the object was attempted to be selected, it might not have been
    // a part of the data entries yet. Save it and when the data buffer is updated,
    // attempt to select it.
    if (!selectedObject) {
      this._selectAttempt = obj;
    }

    this._emitSelection(false, false, false);
  }

  _emitSelection(byUser, composed, goToEntityFrame) {
    var index = parseInt(this._current.textContent) - 1;
    index = Math.max(index, 0);

    // If this entity utilizes the last frame / start frame style, set the
    // entity's frame as the last frame first, then attempt to set it using the start frame.
    // Only bother doing this if the associated canvas is a video
    if (this._canvas._numFrames) {

      var endFrameCheck;
      var endFrame = -1;
      var currentEndFrame;
      var startFrameCheck;
      var startFrame = -1;

      //#TODO Adjust this to handle range_set / attr_style_range cases

      for (const attrType of this._dataType.attribute_types) {
        if (attrType.style) {
          const styleOptions = attrType.style.split(' ');
          if (styleOptions.includes("end_frame_check")) {
            endFrameCheck = this._data[index].attributes[attrType.name];
          }
          else if (styleOptions.includes("end_frame")) {
            currentEndFrame = this._data[index].attributes[attrType.name];
            if (currentEndFrame > endFrame) {
              endFrame = currentEndFrame;
            }
          }
          else if (styleOptions.includes("start_frame_check")) {
            startFrameCheck = this._data[index].attributes[attrType.name];
          }
          else if (styleOptions.includes("start_frame")) {
            startFrame = this._data[index].attributes[attrType.name];
          }
        }
      }

      if (endFrameCheck === false) {
        this._data[index].frame = this._canvas._numFrames;
      }
      else if (endFrame > -1) {
        this._data[index].frame = endFrame;
      }
      else if (startFrameCheck === false) {
        this._data[index].frame = 0;
      }
      else if (startFrame > -1) {
        this._data[index].frame = startFrame;
      }
    }

    // If this is a localization, see if it's associated with a track.
    // If it's associated, pass along the associated track information
    var associatedState = null;
    var associatedStateType = null;

    var dataList = this._globalData._dataByType.get(this._data[index].meta);
    const elemIndex = dataList.findIndex(elem => elem.id === this._data[index].id);
    if (elemIndex > -1)
    {
      const data = dataList[elemIndex];
      const isLocalization = data.meta.includes("box") || data.meta.includes("line") || data.meta.includes("dot");
      if (isLocalization)
      {
        if (data.id in this._globalData._trackDb)
        {
          associatedState = this._globalData._trackDb[data.id];
          associatedStateType = this._globalData._dataTypes[associatedState.meta];
        }
      }
    }

    this.dispatchEvent(new CustomEvent("select", {
      detail: {
        data: this._data[index],
        dataType: this._dataType,
        byUser: byUser,
        goToEntityFrame: goToEntityFrame,
        associatedState: associatedState,
        associatedStateType: associatedStateType
      },
      composed: composed,
    }));
  }

  _emitCapture() {
    const index = parseInt(this._current.textContent) - 1;
    this.dispatchEvent(new CustomEvent("capture", {
      detail: {
        data: this._data[index],
        dataType: this._dataType,
      },
      composed: true,
    }));
  }
}

customElements.define("entity-selector", EntitySelector);
