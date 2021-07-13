class EntityPanelContainer extends TatorElement {
   constructor() {
      super();

      //default state
      this.open = false;

      // Close side panel bar with arrow and panel title
      this._panelTop = document.createElement("entity-gallery-panel-top");
      this._shadow.appendChild(this._panelTop);

      // this element (aside)
      this.el = null;
   }

   init({ main, aside, pageModal, modelData, gallery }) {
      this.lside = main;
      this.rside = aside;
      this.gallery = gallery;

      // listener to close panelContainer
      this._panelTop.init({ pageModal, modelData, panelContainer: this });
      this._panelTop._topBarArrow.addEventListener("click", this._toggleRightOnClick.bind(this));
   }

   cardClicked() {
      // if panel is shut, open it bc new card was selected
      if (!this.open) {
         this._toggleOpen();
      }
   }

   _toggleRightOnClick() {
      // CLOSE
      /* DEFAULT lside = col-9, and rside = col-2 */
      if (this.open) {
         this._toggleShut();
      } else {
         this._toggleOpen();
      }
   }

   _toggleOpen() {
      this.rside.classList.remove("slide-close");
      
      this.lside.classList.add("col-9");
      this.lside.classList.remove("col-12");
      this.lside.style.marginRight = "0";
      
      this.gallery._main.classList.remove("mr-6");
      this.gallery._main.classList.add("mr-3");

      this._panelTop._topBarArrow.style.transform = "scaleX(1)";
      this.open = true;
      
      return this.open;
   }

   _toggleShut() {
      this.lside.classList.add("col-12");
      
      this.rside.classList.add("slide-close");
      
      this.lside.classList.remove("col-9");
      this.lside.style.marginRight = "2%";

      this.gallery._main.classList.add("mr-6");
      this.gallery._main.classList.remove("mr-3");
      
      this.open = false;
      this._panelTop._topBarArrow.style.transform = "scaleX(-1)";

      return this.open;
   }
}

customElements.define("entity-panel-container", EntityPanelContainer);