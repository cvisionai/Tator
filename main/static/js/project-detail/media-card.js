class MediaCard extends TatorElement {
  constructor() {
    super();

    this._li = document.createElement("li");
    this._li.setAttribute("class", "project__file rounded-2");
    this._shadow.appendChild(this._li);

    this._link = document.createElement("a");
    this._link.setAttribute("class", "file__link d-flex flex-items-center text-white");
    this._link.setAttribute("href", "#");
    this._li.appendChild(this._link);

    this._img = document.createElement("img");
    this._img.setAttribute("src", "/static/images/spinner-transparent.svg");
    this._img.setAttribute("class", "col-12 rounded-1");
    this._link.appendChild(this._img);

    const div = document.createElement("div");
    div.setAttribute("class", "flex-column py-2 px-2 lh-default");
    this._li.appendChild(div);

    const titleDiv = document.createElement("div");
    titleDiv.setAttribute("class", "py-1 d-flex flex-justify-between");
    div.appendChild(titleDiv);

    this._name = document.createElement("a");
    this._name.setAttribute("class", "text-semibold text-white css-truncate");
    this._name.setAttribute("href", "#");
    titleDiv.appendChild(this._name);

    this._more = document.createElement("media-more");
    this._more.setAttribute("class", "position-relative");
    this._more.style.opacity = 0;
    titleDiv.appendChild(this._more);

    const lowerDiv = document.createElement("div");
    lowerDiv.setAttribute("class", "d-flex flex-justify-between");
    div.appendChild(lowerDiv);

    const extDiv = document.createElement("div");
    extDiv.setAttribute("class", "d-flex flex-items-center");
    lowerDiv.appendChild(extDiv);

    this._ext = document.createElement("span");
    this._ext.setAttribute("class", "f3 text-gray");
    extDiv.appendChild(this._ext);

    this._pos_text = document.createElement("span");
    this._pos_text.setAttribute("class", "f3 text-gray px-2");
    extDiv.appendChild(this._pos_text);

    this._emblemDiv = document.createElement("div");
    lowerDiv.appendChild(this._emblemDiv);

    this._attachmentButton = document.createElement("button");
    this._attachmentButton.setAttribute("class", "px-0 btn-clear h2 text-gray hover-text-white");
    this._attachmentButton.style.display = "none";
    this._emblemDiv.appendChild(this._attachmentButton);

    const svg = document.createElementNS(svgNamespace, "svg");
    svg.setAttribute("width", "16");
    svg.setAttribute("height", "16");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("stroke", "currentColor");
    svg.setAttribute("stroke-width", "2");
    svg.setAttribute("stroke-linecap", "round");
    svg.setAttribute("stroke-linejoin", "round");
    svg.style.fill = "none";
    this._attachmentButton.appendChild(svg);

    const path = document.createElementNS(svgNamespace, "path");
    path.setAttribute("d", "M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48");
    svg.appendChild(path);

    this.addEventListener("mouseenter", () => {
      this._more.style.opacity = 1;
    });

    this.addEventListener("mouseleave", () => {
      this._more.style.opacity = 0;
    });

    this._more.addEventListener("algorithmMenu", evt => {
      this.dispatchEvent(
        new CustomEvent("runAlgorithm",
          {composed: true,
          detail: {
            algorithmName: evt.detail.algorithmName,
            mediaIds: [Number(this.getAttribute("media-id"))],
            projectId: this._more._project.id,
          }}));
    });

    this._more.addEventListener("annotations", evt => {
      this.dispatchEvent(new CustomEvent("downloadAnnotations", {
        detail: {
          mediaIds: this.getAttribute("media-id"),
          annotations: true
        },
        composed: true
      }));
    });

    this._more.addEventListener("rename", evt => {
      const input = document.createElement("input");
      input.setAttribute("class", "form-control input-sm1 f1");
      input.setAttribute("value", this._name.textContent);
      titleDiv.replaceChild(input, this._name);
      input.addEventListener("focus", evt => {
        evt.target.select();
      });
      input.addEventListener("keydown", evt => {
        if (evt.keyCode == 13) {
          evt.preventDefault();
          input.blur();
        }
      });
      input.addEventListener("blur", evt => {
        if (evt.target.value !== "") {
          this._name.textContent = evt.target.value;
          const full = evt.target.value + this._ext.textContent;
          this._li.setAttribute("title", full);
        }
        fetch("/rest/Media/" + this.getAttribute("media-id"), {
          method: "PATCH",
          credentials: "same-origin",
          headers: {
            "X-CSRFToken": getCookie("csrftoken"),
            "Accept": "application/json",
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            name: `${this._name.textContent}.${this._ext.textContent}`,
          }),
        })
        .catch(err => console.error("Failed to change name: " + err));
        titleDiv.replaceChild(this._name, evt.target);
      });
      input.focus();
    });

    this._more.addEventListener("delete", evt => {
      this.dispatchEvent(new CustomEvent("deleteFile", {
        detail: {
          mediaId: this.getAttribute("media-id"),
          mediaName: this._name.textContent
        },
        composed: true
      }));
    });

    this._attachmentButton.addEventListener("click", () => {
      this.dispatchEvent(new CustomEvent("attachments", {
        composed: true,
        detail: this._attachments,
      }));
    });
  }

  static get observedAttributes() {
    return ["thumb", "thumb-gif", "name", "processing", "pos-text"];
  }

  attributeChangedCallback(name, oldValue, newValue) {
    switch (name) {
      case "thumb":
        if (this._thumb != newValue) {
          this._img.setAttribute("src", newValue);
          this._img.onload = () => {this.dispatchEvent(new Event("loaded"))};
          this._thumb = newValue;
        }
        break;
      case "thumb-gif":
        if (this._thumbGif != newValue) {
          this._thumbGif = newValue;
          this._li.addEventListener("mouseenter", () => {
            if (this.hasAttribute("thumb-gif")) {
              this._img.setAttribute("src", this.getAttribute("thumb-gif"));
            }
          });
          this._li.addEventListener("mouseleave", () => {
            if (this.hasAttribute("thumb")) {
              this._img.setAttribute("src", this.getAttribute("thumb"));
            }
          });
        }
        break;
      case "name":
        const dot = Math.max(0, newValue.lastIndexOf(".") || Infinity);
        const ext = newValue.slice(dot + 1);
        this._ext.textContent = ext.toUpperCase();
        this._name.textContent = newValue.slice(0, dot);
        this._li.setAttribute("title", newValue);
        this._more.setAttribute("name", newValue);
        break;
      case "processing":
        if (newValue === null) {
          this._more.removeAttribute("processing");
        } else {
          this._more.setAttribute("processing", "");
        }
        break;
      case "pos-text":
        this._pos_text.textContent = newValue;
    }
  }

  set project(val) {
    if (!hasPermission(val.permission, "Can Edit")) {
      this._more.style.display = "none";
    }
    this._more.project = val;
  }

  set algorithms(val) {
    this._more.algorithms = val;
  }

  set mediaParams(val) {
    this._mediaParams = val;
  }

  set media(val) {
    this._media = val;
    this._more.media = val;
    let valid = false;
    if (this._media.media_files)
    {
      if ('streaming' in this._media.media_files ||
          'layout' in this._media.media_files ||
          'image' in this._media.media_files)
      {
        valid = true;
      }
      if (!('thumbnail' in this._media.media_files) && 'live' in this._media.media_files)
      {
        // Default to tator thumbnail
        // TODO: Have some visual indication if stream is active.
        this._img.setAttribute("src", "/static/images/live-thumb.png");

      }
    }
    if (valid == false)
    {
      this._name.style.opacity = 0.35;
      this._link.style.opacity = 0.35;
      this._name.style.cursor = "not-allowed";
      this._link.style.cursor = "not-allowed";
    }
    else
    {
      let project = val.project;
      if(typeof(val.project) == "undefined") {
        project = val.project_id;
      }
      var uri = `/${project}/annotation/${val.id}?${this._mediaParams.toString()}`;
      this._name.setAttribute("href", uri);
      this._link.setAttribute("href", uri);
      this._name.style.opacity = 1;
      this._link.style.opacity = 1;
      this._name.style.cursor = "pointer";
      this._link.style.cursor = "pointer";
    }
  }

  get media() {
    return this._media;
  }

  set attachments(val) {
    this._attachments = val;
    if (val.length > 0) {
      this._attachmentButton.style.display = "flex";
    } else {
      this._attachmentButton.style.display = "none";
    }
  }
}

customElements.define("media-card", MediaCard);
