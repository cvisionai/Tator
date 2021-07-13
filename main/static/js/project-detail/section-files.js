class SectionFiles extends TatorElement {
  constructor() {
    super();

    this._main = document.createElement("ul");
    this._main.setAttribute("class", "project__files d-flex");
    this._shadow.appendChild(this._main);
  }

  static get observedAttributes() {
    return ["project-id", "username", "token", "section"];
  }

  set project(val) {
    this._project = val;
  }

  set mediaParams(val) {
    this._mediaParams = val;
  }

  set numMedia(val) {
    this._numMedia = val;
  }

  set startMediaIndex(val) {
    this._startMediaIndex = val;
  }

  set cardInfo(val) {
    this._makeCards(val);
  }

  set mediaIds(val) {
    this._media = val.map(id => {return {id: id}});
    this._updateNumCards();
  }

  set algorithms(val) {
    this._algorithms = val;
  }

  _updateCard(card, media, pos_text) {
    card.setAttribute("media-id", media.id);

    card.setAttribute("thumb", "/static/images/spinner-transparent.svg");
    if (media.media_files) {
      if (media.media_files.thumbnail) {
        card.setAttribute("thumb", media.media_files.thumbnail[0].path);
      }
    }
    card.removeAttribute("thumb-gif");
    if (media.media_files) {
      if (media.media_files.thumbnail_gif) {
        card.setAttribute("thumb-gif", media.media_files.thumbnail_gif[0].path);
      }
    }
    if (media.media_files) {
      if (media.media_files.attachment) {
        card.attachments = media.media_files.attachment;
      } else {
        card.attachments = [];
      }
    }
    card.mediaParams = this._mediaParams();
    card.media = media;
    card.style.display = "block";
    card.setAttribute("name", media.name);
    card.setAttribute("project-id", this.getAttribute("project-id"));
    card.setAttribute("pos-text", pos_text)
  }

  _makeCards(cardInfo) {
    const hasAlgorithms = typeof this._algorithms !== "undefined";
    const hasProject = this.hasAttribute("project-id");
    if (hasAlgorithms && hasProject) {
      const children = this._main.children;
      for (const [index, media] of cardInfo.entries()) {
        const newCard = index >= children.length;
        let card;
        if (newCard) {
          card = document.createElement("media-card");
          card.project = this._project;
          card.algorithms = this._algorithms;
          card.addEventListener("mouseenter", () => {
            if (card.hasAttribute("media-id")) {
              this.dispatchEvent(new CustomEvent("cardMouseover", {
                detail: {media: card.media}
              }));
            }
          });
          card.addEventListener("mouseleave", () => {
            if (card.hasAttribute("media-id")) {
              this.dispatchEvent(new Event("cardMouseexit"));
            }
          });
        } else {
          card = children[index];
        }

        const pos_text = `(${this._startMediaIndex + index + 1} of ${this._numMedia})`;
        this._updateCard(card, media, pos_text);
        if (newCard) {
          this._main.appendChild(card);
        }
      }
      if (children.length > cardInfo.length) {
        const len = children.length;
        for (let idx = len - 1; idx >= cardInfo.length; idx--) {
          children[idx].style.display = "none";
        }
      }
    }
  }
}

customElements.define("section-files", SectionFiles);
