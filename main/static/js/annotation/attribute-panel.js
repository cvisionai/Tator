class AttributePanel extends TatorElement {
  constructor() {
    super();

    this._div = document.createElement("div");
    this._div.setAttribute("class", "annotation__panel-group py-2 text-gray f2");
    this._shadow.appendChild(this._div);
    this._emitChanges=true;

    this._idWidget = document.createElement("text-input");
    this._idWidget.permission = "View Only";
    this._idWidget.setAttribute("name", "ID");
    this._div.appendChild(this._idWidget);

    this._createdByWidget = document.createElement("text-input");
    this._createdByWidget.permission = "View Only";
    this._createdByWidget.setAttribute("name", "Created By");
    this._div.appendChild(this._createdByWidget);

    this._userList = [];
  }

  static get observedAttributes() {
    return ["in-entity-browser"];
  }

  attributeChangedCallback(name, oldValue, newValue) {
    switch (name) {
      case "in-entity-browser":
        this._div.classList.add("px-4");
    }
  }

  set permission(val) {
    this._permission = val;
    for (const widget of this._div.children) {
      // Specific attribute fields in this panel are always disabled
      if (widget.getAttribute("name") != "ID" && widget.getAttribute("name") != "Created By") {
        // Widget may have been marked as disabled, and its permission have already been
        // set appropriately.
        if (!widget.disabled) {
          widget.permission = val;
        }
      }
    }
  }

  set dataType(val) {
    this._dataType = val;
    if (val.isTrack) {
      const div = document.createElement("div");
      div.setAttribute("class", "annotation__panel-group px-4 py-3 text-gray f2");
      this._shadow.insertBefore(div, this._div);

      var sliderDiv = document.createElement("div");
      sliderDiv.setAttribute("class", "d-flex flex-items-center flex-justify-between py-1");
      div.appendChild(sliderDiv);

      this._slider = document.createElement("input");
      this._slider.setAttribute("class", "range flex-grow");
      this._slider.setAttribute("type", "range");
      this._slider.setAttribute("step", "1");
      this._slider.setAttribute("value", "0");
      sliderDiv.appendChild(this._slider);

      this._slider.addEventListener("input", () => {
        if (this._emitChanges) {
          this.dispatchEvent(new CustomEvent("frameChange", {
            detail: {frame: this._frames[this._slider.value],
                     track: this._track},
            composed: true
          }));
        }
      });

      this._currentFrame = 0;
    }
    else {
      const div = document.createElement("div");
      div.setAttribute("class", "annotation__panel-group px-4 py-3 text-gray f2");
      this._shadow.insertBefore(div, this._div);

      var goToTrackDiv = document.createElement("div");
      goToTrackDiv.setAttribute("class", "d-flex flex-items-center py-1");
      this._goToTrack = div;
      div.appendChild(goToTrackDiv);

      var label = document.createElement("legend");
      this._goToTrackLabel = label;
      goToTrackDiv.append(label);

      var goToTrackButton = document.createElement("entity-track-button");
      goToTrackButton.style.marginLeft = "16px";
      goToTrackButton.addEventListener("click", () => {
        this.dispatchEvent(new CustomEvent("goToTrack", {
          detail: {track: this._associatedTrack},
          composed: true
        }
        ));
      });
      goToTrackDiv.appendChild(goToTrackButton);
      this.displayGoToTrack(false);
    }

    const sorted = val.attribute_types.sort((a, b) => {
      return a.order - b.order || a.name - b.name;
    });
    for (const column of sorted) {
      let widget;
      var ignorePermission = false;

      if (column.dtype == "bool") {
        widget = document.createElement("bool-input");
        widget.setAttribute("name", column.name);
        widget.setAttribute("on-text", "Yes");
        widget.setAttribute("off-text", "No");
      } else if (column.dtype == "enum") {
        widget = document.createElement("enum-input");
        widget.setAttribute("name", column.name);
        let choices = [];
        for (let idx = 0; idx < column.choices.length; idx++)
        {
          let choice = {'value': column.choices[idx]};
          if (column.labels)
          {
            choice.label = column.labels[idx];
          }
          choices.push(choice);
        }
        widget.choices = choices;
      } else if (column.style) {
        const style_options = column.style.split(' ');
        if (column.dtype == "string" && style_options.includes("long_string")) {
          widget = document.createElement("text-area");
          widget.setAttribute("name", column.name);
          widget.setAttribute("type", column.dtype);
        } else {
          widget = document.createElement("text-input");
          widget.setAttribute("name", column.name);
          widget.setAttribute("type", column.dtype);
          widget.autocomplete = column.autocomplete;
        }

        if (style_options.includes("disabled")) {
          widget.permission = "View Only";
          widget.disabled = true;
          ignorePermission = true;
        }
      }
      else {
        // TODO: Implement a better datetime widget
        // TODO: Implement a better geopos widget
        widget = document.createElement("text-input");
        widget.setAttribute("name", column.name);
        widget.setAttribute("type", column.dtype);
        widget.autocomplete = column.autocomplete;
      }

      // Hide attributes that are less than 0
      if (column.order < 0)
      {
        widget.style.display = "none";
      }

      // Set whether this widget is required
      if (typeof column.required === "undefined") {
        widget.required = false;
      } else {
        widget.required = column.required;
      }

      if (typeof this._permission !== "undefined" && !ignorePermission) {
        widget.permission = this._permission;
      }
      this._div.appendChild(widget);
      if (column.default) {
        widget.default = column.default;
      }
      widget.reset();

      widget.addEventListener("change", () => {
        if (this._emitChanges) {
          this.dispatchEvent(new Event("change"));
        }
      });
    }
  }

  getValues() {
    let values = {};
    for (const widget of this._div.children) {
      if (widget.getAttribute("name") != "ID" && widget.getAttribute("name") != "Created By") {
        const val = widget.getValue();
        if ((val === null) && (widget.required)) {
          values = null;
          break;
        } else if (val !== null) {
          values[widget.getAttribute("name")] = val;
        }
      }
    }
    return values;
  }

  setFrame(frame) {
    this._currentFrame = frame;
    let sliderData = {};
    sliderData.currentFrame = this._currentFrame;
    this.setSlider(sliderData);
  }

  /**
   * @param {boolean} display - True if it's displayed. False to hide it.
   */
  displayGoToTrack(display) {
    if (this._goToTrack) {
      if (display) {
        this._goToTrack.style.display = "block";
      }
      else {
        this._goToTrack.style.display = "none";
      }
    }
  }

  displaySlider(display) {
    if (this._slider){
      if (display) {
        this._slider.style.display = "block";
      }
      else {
        this._slider.style.display = "none";
      }
    }
  }

  setSlider(data) {
    // If there's no slider as a part of this panel, then just ignored this call.
    if (!this._slider){ return; }

    // Set the slider max and corresponding frame index list if
    // the track frame segments are provided (which are start/end pairs)
    if (data.segments){
      this._trackSegments = data.segments;
      this._frames = [];
      for (const [start, end] of data.segments) {
        for (let i = start; i <= end; i++) {
          this._frames.push(i);
        }
      }
      this._slider.max = this._frames.length - 1;
      this._frame_max = Math.max(...this._frames);
    }

    // Set the current value of the slider based on the provided frame
    // If no frame is provided, then just pick the beginning
    if (data.currentFrame && this._frames) {
      let slider_index = this._frames.indexOf(data.currentFrame);

      // Current frame is not part of this track's frameset. Set the slider
      // based on the current frame number by picking the closest entry
      // (without going over)
      if (slider_index == -1) {
        for (let i = 0; i < this._frames.length; i++) {
          if (this._frames[i] <= data.currentFrame) {
            slider_index = i;
          }
        }
      }

      this._slider.value = slider_index;
    }
    else {
      this._slider.value = 0;
    }
  }

  _getUsername(userId) {
    if (userId){
      fetch("/rest/User/" + userId, {
        method: "GET",
        credentials: "same-origin",
        headers: {
          "X-CSRFToken": getCookie("csrftoken"),
          "Accept": "application/json",
          "Content-Type": "application/json"
        }
      })
      .then(response => { return response.json(); })
      .then(result => {
        this._userList.push({result});
        this._createdByWidget.setValue(result.username);
      });
    }
  }

  /**
   * Sets frame range if there are attributes with "start_frame"
   * and "end_frame" associated with it
   *
   * #TODO Should probably refactor finding the widget and setting the value
   */
  setFrameRange(startFrame, endFrame) {
    for (const attr of this._dataType.attribute_types) {
      if (attr.style === "start_frame") {
        for (const widget of this._div.children) {
          const name = widget.getAttribute("name");
          if (name == attr.name) {
            widget.setValue(startFrame);
            break;
          }
        }
      }
      else if (attr.style === "end_frame") {
        for (const widget of this._div.children) {
          const name = widget.getAttribute("name");
          if (name == attr.name) {
            widget.setValue(endFrame);
            break;
          }
        }
      }
    }
  }

  setValues(values, associatedTrack, associatedTrackType) {
    // Set the ID widget
    this._idWidget.setValue(values.id);

    // Set the user widget
    var createdByUsername = null;
    var foundUser = false;
    for (let index = 0; index < this._userList.length; index++) {
      if (this._userList[index].id == values.created_by) {
        foundUser = true;
        createdByUsername = this._userList[index].username;
        break;
      }
    }

    if (!foundUser) {
      this._getUsername(values.created_by);
    }
    else {
      this._createdByWidget.setValue(createdByUsername);
    }

    // Check if the slider needs to be updated if there's different track data now.
    // If so, then update it.
    let trackSegmentsUpdated = false;
    if (this._trackSegments && values.segments){
       trackSegmentsUpdated = this._trackSegments != values.segments;
    }

    // Skip resetting slider if we already display this track
    if (this._track && this._track.id == values.id && !trackSegmentsUpdated)
    {
      return;
    }

    this._emitChanges = false;

    // only relevant if we are dealing with objects
    // with ids
    if (this._dataType.isTrack)
    {
      this._track = values;
    }

    let sliderData = {};
    sliderData.segments = values.segments;
    sliderData.currentFrame = this._currentFrame;
    this.setSlider(sliderData);

    // If the provided values contain a track association ID, then display
    // the go to track button. Otherwise, hide it.
    if (associatedTrack != undefined && associatedTrackType != undefined)
    {
      this._goToTrackLabel.textContent = "View Associated " + associatedTrackType.name;
      this._associatedTrack = associatedTrack;
      this.displayGoToTrack(true);
    }
    else
    {
      this.displayGoToTrack(false);
    }

    for (const widget of this._div.children) {
      const name = widget.getAttribute("name");
      const value = values.attributes[name];
      if (!["ID", "Created By"].includes(name)) {
        widget.setValue(values.attributes[name]);
      }
    }
    this._emitChanges = true;
  }

  reset() {
    // Sets all widgets to default
    for (const widget of this._div.children) {
      widget.reset();
    }
  }
}

customElements.define("attribute-panel", AttributePanel);
