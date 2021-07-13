class EntityPanelNavigation extends TatorElement {
   constructor() {
      super();

      this.controls = document.createElement("div");
      this.controls.setAttribute("class", "entity-panel-navigation col-12 d-flex flex-items-center");
      this.controls.hidden = true; // hide until init
      this._shadow.appendChild(this.controls);

      this.prev = document.createElement("entity-prev-button");
      this.controls.appendChild(this.prev);

      // this.nextButton = document.createElement("entity-next-button");
      // div.appendChild(this.nextButton);

      const details = document.createElement("details");
      details.setAttribute("class", "position-relative");
      this.controls.appendChild(details);

      const summary = document.createElement("summary");
      summary.setAttribute("class", "d-flex flex-items-center px-1");
      summary.style.cursor = "pointer";
      details.appendChild(summary);

      this._current = document.createElement("span");
      this._current.setAttribute("class", "px-1 text-gray");
      this._current.textContent = "1";
      summary.appendChild(this._current);

      const styleDiv = document.createElement("div");
      styleDiv.setAttribute("class", "files__main files-wrap");
      details.appendChild(styleDiv);

      const div = document.createElement("div");
      div.setAttribute("class", "more d-flex flex-column f2 py-3 px-2");
      styleDiv.appendChild(div);

      this._slider = document.createElement("input");
      this._slider.setAttribute("class", "range flex-grow");
      this._slider.setAttribute("type", "range");
      this._slider.setAttribute("step", "1");
      this._slider.setAttribute("min", "0");
      this._slider.setAttribute("value", "0");
      div.appendChild(this._slider);

      this.next = document.createElement("entity-next-button");
      this.controls.appendChild(this.next);

      this.panelGroups = [];

   }

   init() {
      this.controls.hidden = false; 
   }

   _emitSelection() {
      //console.log("emit selection fn in entity navigation");
   }

   pushNavData({slideIndex, entityList}){
      // Create a nav for a particular list and save it by index #todo
      this.panelGroups.push(entityList); // should match slideIndex

      //console.log(`entityList length ${entityList.length}`)

      this.prev.addEventListener("click", () => {
         const index = parseInt(this._current.textContent) - 1;
         if (index > 0) {
         this._current.textContent = String(index);
         }
         this._emitSelection();
      });

      this.next.addEventListener("click", () => {
         const index = parseInt(this._current.textContent) + 1;
         if (index <= this._data.length) {
         this._current.textContent = String(index);
         }
         this._emitSelection();
      });

      this._slider.addEventListener("input", () => {
         this._current.textContent = String(Number(this._slider.value) + 1);
         this._emitSelection();
      });
   }

   showSelectedNav(){

   }
}



customElements.define("entity-panel-navigation", EntityPanelNavigation);