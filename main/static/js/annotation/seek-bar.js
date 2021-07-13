class SeekBar extends TatorElement {
  constructor() {
    super();
    this.bar = document.createElement("div");
    this.bar.setAttribute("class", "range-div select-pointer");
    this._shadow.appendChild(this.bar);

    this.handle = document.createElement("div");
    this.handle.setAttribute("class", "range-handle");
    this.handle.setAttribute("tabindex", "0");
    this.handle.style.cursor = "pointer";
    this.bar.appendChild(this.handle);
    this._loadedPercentage = 0;
    this._visualType = "";

    var that = this;
    var clickHandler=function(evt)
    {
      var width = that.offsetWidth;
      if (width == 0)
      {
        width =
          that.parentElement.offsetWidth;
      }
      const percentage = (evt.offsetX/
                          width);
      that.value = Math.round((percentage * (that._max - that._min) + that._min));
      that.dispatchEvent(
        new CustomEvent("change",
                        {composed: true,
                         detail: {frame: that.value}}));
      evt.stopPropagation();
      return false;
    }
    this.bar.addEventListener("click", clickHandler);

    var sendUpdate = (evt, evt_type) => {
      // Only recalculate if it is an input, not a change
      if (evt_type == "input")
      {
        var width = that.offsetWidth;
        if (width == 0)
        {
          width = that.parentElement.offsetWidth;
        }
        var relativeX =
            Math.min(Math.max(evt.pageX - that.offsetLeft,0),
                     width);
        const percentage = Math.min(relativeX/width,
                                    that._loadedPercentage);
        that.value = Math.round((percentage * (that._max - that._min) + that._min));
      }
      that.dispatchEvent(
        new CustomEvent(evt_type,
                        {composed: true}));
      evt.stopPropagation();
      return false;
    };
    var dragHandler=function(evt)
    {
      if (evt.button == 0)
      {
        return sendUpdate(evt, "input");
      }
      evt.cancelBubble=true;
      return false;
    }
    var releaseMouse=function(evt)
    {

      document.removeEventListener("mouseup",
                                   releaseMouse);
      document.removeEventListener("mousemove",
                                   dragHandler);
      sendUpdate(evt, "change");
      that.handle.classList.remove("range-handle-selected");
      // Add back in event handler next iteration (time=0)
      setTimeout(() =>
                 {
                   that.bar.addEventListener("click", clickHandler);
                 },0);
    }
    this.handle.addEventListener("mousedown", evt =>
                                 {
                                   that.bar.removeEventListener("click", clickHandler);
                                   document.addEventListener("mouseup",
                                                             releaseMouse);
                                   document.addEventListener("mousemove",
                                                             dragHandler);
                                   this.handle.classList.add("range-handle-selected");
                                   evt.stopPropagation();
                                   return false;
                                 });



    this.loadProgress = document.createElement("div");
    this.loadProgress.setAttribute("class", "range-loaded");
    this.bar.appendChild(this.loadProgress);

    this._min = 0;
    this._max = 100;
    this._value = 0;
  }

  changeVisualType(visualType) {
    if (visualType == "zoom") {
      this.visualType = "zoom";
      this.bar.setAttribute("class", "zoom-range-div select-pointer");
      this.loadProgress.setAttribute("class", "zoom-range-loaded");
    }
  }

  updateVisuals()
  {
    const percentage = ((this._value-this._min)/(this._max - this._min))*100;
    if (percentage > 100 || percentage < 0) {
      this.handle.style.display = "none";
    }
    else {
      this.handle.style.display = "block";
      this.handle.style.left = `${percentage}%`;
    }
  }

  attributeChangedCallback(name, oldValue, newValue)
  {
    switch(name)
    {
      case 'min':
      this._min = Number(newValue);
      break;
      case 'max':
      this._max = Number(newValue);
      break;
    }
    this.updateVisuals();
  }

  set value(val)
  {
    this._value=val;
    this.updateVisuals();
  }

  get value()
  {
    return this._value;
  }

  onBufferLoaded(evt)
  {
    this._loadedPercentage = evt.detail['percent_complete'];
    const percent_complete = evt.detail['percent_complete']*100;
    this.loadProgress.style.width=`${percent_complete}%`;
  }

  /**
   * Alternative to onBufferLoaded. Uses a passed in frame
   */
  setLoadProgress(frame) {
    const percentage = ((frame-this._min)/(this._max - this._min));
    if (percentage > 1) {
      this.onBufferLoaded({detail: {percent_complete: 1.0}});
    }
    else if (percentage < 0) {
      this.onBufferLoaded({detail: {percent_complete: 0.0}});
    }
    else {
      this.onBufferLoaded({detail: {percent_complete: percentage}});
    }
  }

  static get observedAttributes() { return ['min', 'max']; }
}

customElements.define("seek-bar", SeekBar);
