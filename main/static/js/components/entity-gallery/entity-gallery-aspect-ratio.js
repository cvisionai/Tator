class EntityGalleryAspectRatio extends TatorElement {
  constructor() {
    super();

    let imageSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="feather feather-image"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>`;
    let localizationBoxSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="feather feather-layout"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="9" y1="21" x2="9" y2="9"/></svg>`;

    // Tool to toggle class which styles cards as aspect ratio
    this._slider = document.createElement("bool-input")
    //this._slider.prepend(imageSvg);
    this._slider.setAttribute("name", " ");
    this._slider.innerHTML = `${imageSvg} ${this._slider.innerHTML} ${localizationBoxSvg}`;
    this._slider.setAttribute("on-text", `Aspect`);
    this._slider.setAttribute("off-text", `Fill`);
    //this._slider.prepend(localizationBoxSvg);

    // Add element
    this._shadow.appendChild(this._slider);
  }

  init(gallery){
    this._gallery = gallery;

    // change handler
    this._slider.addEventListener("change", (e) => {
      let changeToAspect = new CustomEvent("view-change", { detail : { sliderValue : this._slider.getValue } })
      this._gallery.dispatchEvent(changeToAspect);
    });
  }

}

customElements.define("entity-gallery-aspect-ratio", EntityGalleryAspectRatio);  