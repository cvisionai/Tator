class ModifyTrackDialog extends TatorElement {
  constructor() {
    super();

    this._div = document.createElement("div");
    this._div.setAttribute("class", "annotation__panel--popup annotation__panel px-4 rounded-2");
    this._shadow.appendChild(this._div);

    const header = document.createElement("div");
    header.setAttribute("class", "d-flex flex-items-center flex-justify-between py-3");
    this._div.appendChild(header);

    this._span = document.createElement("span");
    this._span.setAttribute("class", "text-white");
    header.appendChild(this._span);

    this._contentDiv = document.createElement("div");
    this._contentDiv.setAttribute("class", "d-flex flex-items-center flex-justify-between annotation__panel-group py-3");
    this._div.appendChild(this._contentDiv);

    this._createExtendDialogDiv();
    this._resetUI();

    const buttons = document.createElement("div");
    buttons.setAttribute("class", "d-flex flex-items-center py-4");
    this._div.appendChild(buttons);

    this._yesButton = document.createElement("button");
    this._yesButton.setAttribute("class", "btn btn-clear");
    this._yesButton.setAttribute("disabled", "");
    this._yesButton.textContent = "Extend";
    buttons.appendChild(this._yesButton);

    const cancel = document.createElement("button");
    cancel.setAttribute("class", "btn-clear px-4 text-gray hover-text-white");
    cancel.textContent = "Cancel";
    buttons.appendChild(cancel);

    this._yesButton.addEventListener("click", () => {
      this.dispatchEvent(new Event("cancel"));
    });

    cancel.addEventListener("click", () => {
      this.dispatchEvent(new Event("cancel"));
    });
  }

  _createClipDialogDiv() {

    const div = document.createElement("div");
    this._clipDirection = document.createElement("enum-input");
    let choices = [];
    choices.push({'value': 'Forward'});
    choices.push({'value': 'Backward'});
    this._clipDirection.choices = choices;
    div.appendChild(this._clipDirection);

    this._clipDiv = div;
    this._contentDiv.appendChild(div);
  }

  _createMergeDialogDiv() {

    const div = document.createElement("div");
    this._span = document.createElement("span");
    this._mergeDiv = div;
    this._contentDiv.appendChild(div);
  }

  _createExtendDialogDiv() {

    const div = document.createElement("div");
    this._extendMethod = document.createElement("enum-input");
    this._extendMethod.setAttribute("name", "Method");
    let choices = [];
    choices.push({'value': 'Auto-track'});
    choices.push({'value': 'Duplicate'});
    this._extendMethod.choices = choices;
    div.appendChild(this._extendMethod);

    this._extendDirection = document.createElement("enum-input");
    this._extendDirection.setAttribute("name", "Direction");
    choices = [];
    choices.push({'value': 'Forward'});
    choices.push({'value': 'Backward'});
    this._extendDirection.choices = choices;
    div.appendChild(this._extendDirection);

    this._extendFrames = document.createElement("text-input");
    this._extendFrames.setAttribute("name", "Number of frames");
    div.appendChild(this._extendFrames);

    this._extendDiv = div;
    this._contentDiv.appendChild(div);
  }

  _resetUI() {
    this._span.textContent = "";
    this._extendDiv.style.display = "none";
    this._mergeDiv.style.display = "none";
    this._clipDiv.style.display = "none";
  }

  _setToExtendUI() {
    this._span.textContent = "Extend Track";
    this._extendDiv.style.display = "block";
  }

  _setToMergeUI() {
    this._span.textContent = "Merge Tracks";
    this._mergeDiv.style.display = "block";
  }

  _setToClipUI() {
    this._span.textContent = "Clip Track End";
    this._clipDiv.style.display = "block";
  }

  setUI(dialogType) {
    this._resetUI();
    if (dialogType == "extend")
    {
      this._setToExtendUI();
    }
    else if(dialogType == "merge")
    {
      this._setToMergeUI();
    }
    else if (dialogType == "clip")
    {
      this._setToClipUI();
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

  set requestObj(val) {
    this._requestObj = val;
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
}

customElements.define("modify-track-dialog", ModifyTrackDialog);
