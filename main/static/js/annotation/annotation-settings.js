class AnnotationSettings extends TatorElement {
  constructor() {
    super();

    const div = document.createElement("div");
    div.setAttribute("class", "annotation__settings d-flex f2");
    this._shadow.appendChild(div);

    this._zoom = document.createElement("zoom-control");
    div.appendChild(this._zoom);

    this._lock = document.createElement("lock-button");
    div.appendChild(this._lock);

    this._capture = document.createElement("media-capture-button");
    div.appendChild(this._capture);

    this._bookmark = document.createElement("bookmark-button");
    div.appendChild(this._bookmark);

    this._link = document.createElement("media-link-button");
    div.appendChild(this._link);

    this._fill_boxes = document.createElement("fill-boxes-button")
    div.appendChild(this._fill_boxes)

    this._toggle_text = document.createElement("toggle-text-button")
    div.appendChild(this._toggle_text)

    this._link.addEventListener("click", () => {
      const searchParams = new URLSearchParams(window.location.search);
      let url = window.location.origin + window.location.pathname;
      url += "?" + this._queryParams(searchParams).toString();
      const text = document.createElement("textarea");
      text.textContent = url;
      text.style.opacity = 0;
      document.body.appendChild(text);
      text.select();
      document.execCommand("copy");
      document.body.removeChild(text);
    });

  }

  static get observedAttributes() {
    return ["zoom"];
  }

  attributeChangedCallback(name, oldValue, newValue) {
    switch (name) {
      case "zoom":
        this._zoom.setAttribute("zoom", newValue);
        break;
    }
  }

  _typeParams() {
    let params = null;
    if (this.hasAttribute("type-id")) {
      params = this.getAttribute("type-id");
    }
    return params;
  }

  _queryParams(params) {
    if (params == undefined)
    {
      params = new URLSearchParams(window.location.search)
    }
    if (this.hasAttribute("entity-id")) {
      params.set("selected_entity", this.getAttribute("entity-id"));
    }
    if (this._typeParams()) {
      params.set("selected_type", this._typeParams());
    }
    if (this.hasAttribute("frame")) {
      params.set("frame", this.getAttribute("frame"));
    }
    if (this.hasAttribute("version")) {
      params.set("version", this.getAttribute("version"));
    }
    if (this._lock._pathLocked.style.display == "block") {
      params.set("lock", 1);
    } else {
      params.set("lock", 0);
    }
    if (this._fill_boxes.current_state == "fill") {
      params.set("fill_boxes", 1);
    } else {
      params.set("fill_boxes", 0);
    }
    if (this._toggle_text.current_state == "on") {
      params.set("toggle_text", 1);
    } else {
      params.set("toggle_text", 0);
    }
    return params;
  }
}

customElements.define("annotation-settings", AnnotationSettings);
