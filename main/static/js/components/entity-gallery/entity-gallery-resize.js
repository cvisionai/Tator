class EntityCardResize extends TatorElement {
  constructor() {
    super();

    // SVGS
    let shrink = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="no-fill"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="8" y1="11" x2="14" y2="11"/></svg>`; 
    let grow = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="no-fill"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="11" y1="8" x2="11" y2="14"/><line x1="8" y1="11" x2="14" y2="11"/></svg>`;

    // Slide Range container for resize range
    this._sliderContainer = document.createElement("div");
    this._sliderContainer.setAttribute("class", "entity-resize float-right");
    this._shadow.appendChild(this._sliderContainer);

    // Container Label for spans - / +
    this._slideInputLabel = document.createElement("label");
    this._slideInputLabel.setAttribute("for", "resizeAnnotationImages");
    this._sliderContainer.appendChild(this._slideInputLabel);

    // Resize label text
    //this._resizeLabel = document.createElement("span");
    //this._resizeLabel.setAttribute("class", "text-gray entity-resize__label f2 text-top");
    //let resize = document.createTextNode("Resize ");
    //this._resizeLabel.appendChild();
    //this._slideInputLabel.appendChild(this._resizeLabel);

    // Minus span
     this._minusTextSpan = document.createElement("span");
     this._minusTextSpan.setAttribute("class", "text-top text-gray ");
     this._minusTextSpan.innerHTML = shrink;
    // this._minusText = document.createTextNode("-");
    // this._minusTextSpan.appendChild(this._minusText);
     this._slideInputLabel.appendChild(this._minusTextSpan);

    // Range element min: 50, max: 250
    this._slideInput = document.createElement("input");
    this._slideInput.setAttribute("type", "range");
    this._slideInput.setAttribute("min", "50");
    this._slideInput.setAttribute("max", "250");
    this._slideInput.setAttribute("value", "150");
    this._slideInput.setAttribute("class", "range-div select-pointer");
    this._slideInput.setAttribute("id", "resizeAnnotationImages");
    this._slideInputLabel.appendChild(this._slideInput);

    // Plus span
     this._plusTextSpan = document.createElement("span");
     this._plusTextSpan.setAttribute("class", "text-top text-gray");
     this._plusTextSpan.innerHTML = grow;
    // this._plusText = document.createTextNode("+");
    // this._plusTextSpan.appendChild(this._plusText);
     this._slideInputLabel.appendChild(this._plusTextSpan);

    // Init THIS var for gallery UL
    this._gallery = document.createElement("ul");

    // Allow label clicks to +/-
    this._minusTextSpan.addEventListener("click", this.handlerMinusClick.bind(this));
    this._plusTextSpan.addEventListener("click", this.handlerPlusClick.bind(this));
  
    // This can be overriden, default column width for start
    this.defaultMinMax = 300;
    this.newMinMax = this.defaultMinMax;

  }

  _initGallery(galleryUL, colWidth = 272) {
    // Setup this gallery from parent for use in handler
    this._gallery = galleryUL
    this.defaultMinMax = colWidth;

    // Listen to slide changes on init
    this._slideInput.addEventListener("change", (e) => {
      this._rangeHandler(e.target.value);
    });
  }

  _rangeHandler(resizeValue) {
    let resizeValuePerc = parseFloat(resizeValue / 100);

    // Gallery UL by default
    // * grid-template-columns: repeat(auto-fill,minmax(272px,1fr));
    this.newMinMax = this.defaultMinMax * resizeValuePerc;

    // Img height by default .project__file img
    // height: 130px - Changed in Gallery
    // handled in GALLERY with access to card element

    return this.setGalleryTo(this.newMinMax);
  }

  setGalleryTo(size){
    //console.log("Gallery resized");
    return this._gallery.style.gridTemplateColumns = `repeat(auto-fill,minmax(${size}px,1fr))`;
  }

  handlerMinusClick() {
    let smaller = Number(this._slideInput.value) - 10;
    if(smaller >= this._slideInput.min) {
      this._slideInput.value = smaller ;
    } else {
      this._slideInput.value = this._slideInput.min;
    }
    let evt = new Event("change");
    return this._slideInput.dispatchEvent(evt);
  }

  handlerPlusClick() {
    let bigger = Number(this._slideInput.value) + 10;
    if(bigger <= this._slideInput.max) {
      this._slideInput.value = bigger ;
    } else {
      this._slideInput.value = this._slideInput.max;
    }

    let evt = new Event("change");
    return this._slideInput.dispatchEvent(evt);
  }

}

customElements.define("entity-card-resize", EntityCardResize);  