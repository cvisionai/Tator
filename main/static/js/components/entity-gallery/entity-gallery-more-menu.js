class EntityGalleryMoreMenu extends TatorElement {
   constructor() {
      super();

      this.details = document.createElement("details");
      this.details.setAttribute("class", "entity-gallery-tools--details more");
      this._shadow.appendChild(this.details);

      this.summary = document.createElement("summary");
      this.summary.setAttribute("class", "btn-clear h2 text-gray hover-text-white");
      this.details.appendChild(this.summary);

      // this.summary.style.height = "32px";
      // this.summary.style.width = "35px";

      const moreIcon = document.createElement("more-icon");
      moreIcon.setAttribute("class", "btn-clear h2 text-gray hover-text-white");
      this.summary.appendChild(moreIcon);

      const styleDiv = document.createElement("div");
      styleDiv.setAttribute("class", "entity-gallery-tools--menu rounded-2 px-2 d-flex flex-column f2");
      this.details.appendChild(styleDiv);

      this._menu = document.createElement("div");
      this._menu.setAttribute("class", "d-flex flex-column px-4 py-3 lh-condensed");
      styleDiv.appendChild(this._menu);

      this.summary.addEventListener("click", this._showMenu.bind(this));

      window.addEventListener("click", () => {
         //Hide the menus if visible
         this.details.open = false;
      });

   }

   _showMenu(e) {
      // This allows the off click to work
      e.stopPropagation();
   }

}

customElements.define("entity-gallery-more-menu", EntityGalleryMoreMenu);
