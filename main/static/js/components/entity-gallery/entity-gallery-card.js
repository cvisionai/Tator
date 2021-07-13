class EntityCard extends TatorElement {
    constructor() {
      super();

      // Entity Card

      // - @this._name Title text
      // - Card is list element; Parent can be UL element, or see: EntityCardGallery
      // - Card links out to one destination
      // Optional: 
      // - @this.descDiv Div can contain anything else, desc or other (HIDDEN)
      // - @this._ext Detail text
      // - @this._pos_text Pagination position text
      // - @this._more Menu (HIDDEN)
      // - @this.getAttribute('thumb-gif') Gif for hover effect

      // List element (card)
      this._li = document.createElement("li");
      this._li.setAttribute("class", "entity-card rounded-2 clickable");
      this._shadow.appendChild(this._li);
  
      // Link
      this._link = document.createElement("a");
      this._link.setAttribute("class", "entity-card__link file__link d-flex flex-items-center text-white");
      this._link.setAttribute("href", "#");
      this._li.appendChild(this._link);
  
      // Image, spinner until SRC set
      this._img = document.createElement("img");
      this._img.setAttribute("src", "/static/images/spinner-transparent.svg");
      this._img.setAttribute("class", "entity-card__image rounded-1");
      this._link.appendChild(this._img);
  
      // containing div for li element (styling)
      this._styledDiv = document.createElement("div");
      this._styledDiv.setAttribute("class", "entity-card__title__container py-2 px-2 lh-default");
      this._li.appendChild(this._styledDiv);
  
      // Title Div
      this.titleDiv = document.createElement("div");
      this.titleDiv.setAttribute("class", "entity-card__title py-1");
      this._styledDiv.appendChild(this.titleDiv);
  
      // Text for Title Div
      this._name = document.createElement("a");
      this._name.setAttribute("class", "text-semibold text-white css-truncate");
      this._name.setAttribute("href", "#");
      this.titleDiv.appendChild(this._name);

      // OPTIONAL Description Div
      this.descDiv = document.createElement("div");
      this.descDiv.setAttribute("class", "entity-card__description py-1 f2");
      this._styledDiv.appendChild(this.descDiv);
      this.descDiv.hidden = true; // HIDDEN default
  
      // "More" (three dots) menu (OPTIONAL)
      this._more = document.createElement("media-more");
      this._more.setAttribute("class", "entity-card__more position-relative");
      this._more.style.opacity = 0;
      this.titleDiv.appendChild(this._more); 
      this._more.hidden = true; // HIDDEN default

      // OPTIONAL pagination + id display
      this._bottom = document.createElement("div");
      this._bottom.setAttribute("class", "f3 d-flex flex-justify-between");
      this._styledDiv.appendChild(this._bottom);

      // OPTIONAL Detail text (ie file extension)
      this._ext = document.createElement("span");
      this._ext.setAttribute("class", "f3 text-gray");
      this._ext.hidden = true;
      this._bottom.appendChild(this._ext);
      
      // OPTIONAL Pagination position
      this._pos_text = document.createElement("span");
      this._pos_text.setAttribute("class", "f3 text-gray pr-2");
      
      this._bottom.appendChild(this._pos_text);

      // OPTIONAL ID data
      this._id_text = document.createElement("span");
      this._id_text.setAttribute("class", "f3 text-gray px-2");
      this._bottom.appendChild(this._id_text);
  
      // More menu styling (if included)
      this.addEventListener("mouseenter", () => {
        this._more.style.opacity = 1;
      });

      this.addEventListener("mouseleave", () => {
        this._more.style.opacity = 0;
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
   
  }
  
  customElements.define("entity-card", EntityCard);  