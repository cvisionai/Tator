class EntityGallerySlider extends TatorElement {
   constructor() {
      super();

      this.main = document.createElement("div");
      this.main.setAttribute("class", "entity-gallery-slider mb-4 clickable");
      this._shadow.appendChild(this.main);

      this.topDiv = document.createElement("div");
      this.topDiv.setAttribute("class", "d-flex flex-row flex-items-center col-12");
      this.main.appendChild(this.topDiv);

      /**
       * Placeholder for label data to be added on init
       */
      this._labels = document.createElement("div");
      this._labels.setAttribute("class", "entity-gallery-slider--labels flex-wrap col-10 d-flex d-row f2 text-normal text-gray py-2");
      this.topDiv.appendChild(this._labels);

      /**
       * Placeholder for slider title
       */
      this._title = document.createElement("div");
      this._title.setAttribute("class", "entity-gallery-slider--title text-gray");
      this._labels.appendChild(this._title);

      /**
       * Placeholder for tools
       */
      this._tools = document.createElement("div");
      this._tools.setAttribute("class", "enitity-gallery__tools");
      this.main.appendChild(this._tools);

      // Card label display #todo
      this._cardLabelOptions = [];   

      // Tools container
      this.sliderContainer = document.createElement("div");
      this.sliderContainer.setAttribute("class", "entity-card-resize col-4")
      this._tools.appendChild(this.sliderContainer);

      // Loading text
      this.loadAllTeaser = document.createElement("span");
      this.loadAllTeaser.setAttribute("class", "entity-gallery-slider--load-more text-gray"); //
      this.loadAllTeaser.appendChild(document.createTextNode("Loading..."));
      this.sliderContainer.appendChild(this.loadAllTeaser);

      // Property IDs are the entity IDs (which are expected to be unique)
      // Each property (ID) points to the index of the card information stored in _cardElements
      this._currentCardIndexes = {};

      // Entity cards aren't deleted. They are reused and hidden if not used.
      this._cardElements = [];

      // Gallery Top Pagination Holder
      // #todo customize in-slider pagination feel
      this._topNav = document.createElement("div");
      this._topNav.setAttribute("class", "enitity-gallery-slider__nav py-2 d-flex flex-justify-center");
      this.main.appendChild(this._topNav);

      // Div to contain slider cards styling
      this.styleDiv = document.createElement("div");
      this.styleDiv.setAttribute("class", "entity-gallery-slider__ul-container");
      this.main.appendChild(this.styleDiv);

      // Gallery Bottom Pagination Holder
      this._bottomNav = document.createElement("div");
      this._bottomNav.setAttribute("class", "enitity-gallery-slider__nav py-2 d-flex flex-justify-center");
      this.main.appendChild(this._bottomNav);

      // card columns inside slider #todo finish styling
      this.colSize = 150;
      this._ul = document.createElement("ul");
      this._ul.setAttribute("class", "enitity-gallery-slider__ul py-1")
      //this._ul.style.gridTemplateColumns = `repeat(auto-fill,minmax(${this.colSize}px,1fr))`
      this.styleDiv.appendChild(this._ul);

      this.numberOfDisplayedCards = 0;
      this.attributeLabelEls = [];
      this._preloadedImages = [];
      this.labelInit = false;
   }

   /**
    * Initialize slider with access to outer components and data
    */
   init({
      panelContainer,
      pageModal,
      currentLabelValues,
      slideCardData,
      cardType,
      attributes,
      state,
      gallery
   }) {
      this.panelContainer = panelContainer;
      this.panelControls = this.panelContainer._panelTop;
      this.pageModal = pageModal;
      this.slideCardData = slideCardData;
      this.state = state;
      this.currentLabelValues = currentLabelValues;
      this._sliderAttributeValues = attributes;
      this.gallery = gallery;
      this.association = this.state.typeData.association;

      // Slider active listener
      this.addEventListener("slider-active", () => {
         this.main.classList.add("active");
         this.styleDiv.classList.add("open");
         this._ul.classList.add("open");

         // Go to selected card
         for (let idx = 0; idx < this._cardElements.length; idx++) {
            let listEl = this._cardElements[idx].card._li;
            if (listEl.classList.contains("is-selected")) {
               return false;
            }
         }

         // Open first card if no selected card found
         if (this._cardElements[0] && this._cardElements[0].card) {
            return this._cardElements[0].card.click();
         }
      });

      // Slider inactive listener
      this.addEventListener("slider-inactive", (e) => {
         this.main.classList.remove("active");
         this.styleDiv.classList.remove("open");
         this._ul.classList.remove("open");
      });

      // New card listener
      this.addEventListener("new-card", (e) => {
         this._addCard(e.detail.cardIndex, e.detail.cardData[0], cardType);
      });

      // New image listener
      this.slideCardData.addEventListener("setSlideCardImage", this.updateCardImage.bind(this));

      // Update the card with the localization's associated media
      this.slideCardData.addEventListener("setSlideMedia", (evt) => {
         this.updateCardMedia(evt.detail.id, evt.detail.media);
      });

      /**
       * Slider labels / attributes of slider type
       * #todo componentize (remove state refs)
      */
      let definedAttributes = [];
      if(this.state.typeData && this.state.typeData.attribute_types){
         const tmpDefinedAttributes = [...this.state.typeData.attribute_types];
         definedAttributes = tmpDefinedAttributes.sort((a, b) => {
            return a.order - b.order || a.name - b.name;
         });
      }

      if(typeof definedAttributes !== "undefined" && definedAttributes.length > 0){
         // Display Labels as defined attribute order
         for(let a1 of definedAttributes){
            let foundValue = false;
            for (let attr in this._sliderAttributeValues) {
               if(a1.name == attr){
                  this._displayAttributes({ attr });
                  foundValue = true;
                  break;
               } 
            }
            if(!foundValue) {
               // if there is no value, still add a placeholder in this order
               this._displayAttributes({attr: a1.name, value: false});
            }
         }
      } else {
         // Display attributes values in returned order
         for (let attr in this._sliderAttributeValues) {
            console.log(attr);
            // Add to display w/ value
            this._displayAttributes({attr});
         }
      }
   }

   /**
    * Dispay SLIDER Attributes
    * Takes an attribute and creates a name: value pair for display
    * Uses references saved at higher level to determine to hide/show
    */
   _displayAttributes({ attr, value = true }){    
      let attributeLabel = document.createElement("div");
      attributeLabel.setAttribute("id", encodeURI(attr));

      let seperator = document.createElement("span");
      seperator.setAttribute("class", "px-2");
      attributeLabel.appendChild(seperator)

      let sep = document.createTextNode("|");
      seperator.appendChild(sep);
      
      let text = "";
      if(!value){
         text = document.createTextNode(`${attr}: `);
      } else {
         text = document.createTextNode(`${attr}: ${this._sliderAttributeValues[attr]}`);
      }
      attributeLabel.appendChild(text);

      this._labels.appendChild(attributeLabel);
      this.attributeLabelEls.push(attributeLabel);

      // Apply preference to newly created Label
      // Or default to hidden
      const currentLabels = this.currentLabelValues[this.state.meta];
      if (currentLabels && !currentLabels.includes(encodeURI(attr))) {
         attributeLabel.setAttribute("class", "hidden");
      }
   }

   static get observedAttributes() {
      return ["title", "count"];
   }

   attributeChangedCallback(name, oldValue, newValue) {
      switch (name) {
         case "title":
            this._title.textContent = newValue;
            break;
      }
   }

   /* Init function to show and populate gallery w/ pagination */
   // show(sliderData) {
   //    // Hide all cards' panels and de-select
   //    for (let idx = 0; idx < this._cardElements.length; idx++) {
   //       this._cardElements[idx].card._deselectedCardAndPanel();
   //    }

   //    // Append the cardList
   //    this.makeCards(cardList.cards)
   // }

   /**
    * Updates the specific card's thumbnail image
    * @param {integer} id
    * @param {image} image
    */
   updateCardImage(e) {
      // We need to check if this slider has the card we heard about...
      const id = e.detail.id;
      var index = this._currentCardIndexes[id]
      var info = this._cardElements[index];

      if (typeof this._currentCardIndexes[id] !== "undefined" && typeof info !== "undefined") {
         const image = e.detail.image;
         info.card.setImage(image);
      } else {
         // If the card hasn't been added yet -- save it here (we'll check for it when new cards are added)
         //console.log("Saving image for card ID " + id)
         this._preloadedImages[id] = e.detail.image;
      }
   }

   /**
    * Updates the specific card's panel's media
    * @param {integer} id
    * @param {entityObject} media
    */
   updateCardMedia(id, media) {
      if (id in this._currentCardIndexes) {
         var info = this._cardElements[this._currentCardIndexes[id]];
         //#TODO Entity gallery panel needs to be updated so that it can display multiple
         //      entity attributes (e.g. media associated with the localization)
         //info.annotationPanel.setMedia(media);
      }
   }

   /**
    * Creates the card display in the gallery portion of the page using the provided
    * localization information
    *
    * @param {object} cardInfo
    */
   makeCards(cardInfo) {
      this._currentCardIndexes = {}; // Clear the mapping from entity ID to card index

      // Loop through all of the card entries and create a new card if needed. Otherwise
      // apply the card entry to an existing card.
      //for (const [index, cardObj] of cardInfo.entries()) {
      this._addCard(index, cardObj);
      //}

      // Hide unused cards
      if (this.numberOfDisplayedCards < this._cardElements.length) {
         const len = this._cardElements.length;
         for (let idx = len - 1; idx >= numberOfDisplayedCards; idx--) {
            this._cardElements[idx].card.style.display = "none";
         }
      }
   }

   openClosedPanel(e) {
      //console.log(e.detail)
      if (!this.panelContainer.open) this.panelContainer._toggleOpen();
      this.panelControls.openHandler(e.detail);
   }

   _updateCardLabels(evt){

   }

   _addCard(index, cardObj, cardType) { 
      let newCard = false;
      let location = this._currentCardIndexes[cardObj.id];

      if (!location && typeof location == "undefined") {
         newCard = true;
      }
      
      /**
      * Card labels / attributes of localization or media type
      */
      this.entityType = (this.association == "Localization") ? cardObj.entityType : cardObj.mediaInfo.entityType;
      let typeId = this.entityType.id;
      this._cardAtributeLabels.add({ 
         typeData: this.entityType,
         checkedFirst: true
      });

      this.gallery.cardLabelsChosenByType[typeId] = this._cardAtributeLabels._getValue(typeId);
      
      this._cardAtributeSort.add({ 
         typeData: this.entityType
      });
      
      this._cardLabelOptions = this.entityType.attribute_types;
      this._cardLabelOptions.sort((a, b) => {
         return a.order - b.order || a.name - b.name;
      });



      let card;
      if (newCard) {
         // create a new card
         card = document.createElement(cardType);

         this._cardAtributeLabels.addEventListener("labels-update", (evt) => {
            card._updateShownAttributes(evt);
            this.gallery.cardLabelsChosenByType[typeId] =  evt.detail.value;
            let msg = `Entry labels updated`;
            Utilities.showSuccessIcon(msg);
         });

         // // Resize Tool needs to change style within card on change
         card.style.width = "272px";
         // this._resizeCards._slideInput.addEventListener("change", (evt) => {
         //    let resizeValue = evt.target.value;
         //    let resizeValuePerc = parseFloat(resizeValue / 100);
         //    card.style.width = "auto";
         //    return card._img.style.height = `${130 * resizeValuePerc}px`;
         // });

         // Inner div of side panel
         let annotationPanelDiv = document.createElement("div");
         annotationPanelDiv.setAttribute("class", "entity-panel--div hidden");
         this.panelContainer._shadow.appendChild(annotationPanelDiv);

         // Init a side panel that can be triggered from card
         let annotationPanel = document.createElement("entity-gallery-panel");
         annotationPanelDiv.appendChild(annotationPanel);

         // Listen for attribute changes
         // #todo needs to be componentized?
         annotationPanel.entityData.addEventListener("save", this.entityFormChange.bind(this));
         annotationPanel.stateData.addEventListener("save", this.stateFormChange.bind(this));
         annotationPanel.mediaData.addEventListener("save", this.mediaFormChange.bind(this));

         if (this.panelContainer.hasAttribute("permissionValue")) {
            let permissionVal = this.panelContainer.getAttribute("permissionValue");
            annotationPanel.entityData.setAttribute("permission", permissionVal);
            annotationPanel.stateData.setAttribute("permission", permissionVal);
            annotationPanel.mediaData.setAttribute("permission", permissionVal);
         }

         // when lock changes set attribute on forms to "View Only" / "Can Edit"
         this.panelContainer.addEventListener("permission-update", (e) => {
            annotationPanel.entityData.setAttribute("permission", e.detail.permissionValue);
            annotationPanel.stateData.setAttribute("permission", e.detail.permissionValue);
            annotationPanel.mediaData.setAttribute("permission", e.detail.permissionValue);
         });

         // Update view unselected card panel
         annotationPanelDiv.addEventListener("unselected", () => {
            card._li.classList.remove("is-selected");
            annotationPanelDiv.classList.remove("is-selected");
            annotationPanelDiv.classList.add("hidden");
         });

         // Listen for all clicks on the document
         document.addEventListener('click', function (evt) {
            if (evt.target.tagName == "BODY" && card._li.classList.contains("is-selected")) {
               card._li.click();
            }
         }, false);

         // Open panel if a card is clicked
         card.addEventListener("card-click", this.openClosedPanel.bind(this)); // open if panel is closed

         // // Update view
         // card._li.classList.toggle("aspect-true");
         // this.addEventListener("view-change", () => {
         //    card._li.classList.toggle("aspect-true");
         // });

         let cardInfo = {
            card: card,
            annotationPanel: annotationPanel,
            annotationPanelDiv: annotationPanelDiv
         };


         if (cardObj.image) {
            annotationPanel.localizationType = false;
            annotationPanel.setImage(cardObj.image);
            if (cardObj.thumbnail) {
               card.setImageStatic(cardObj.thumbnail);
            } else {
               card.setImageStatic(cardObj.image);
            }
         }
         this._ul.appendChild(card);

         this._cardElements.push(cardInfo);

         if (this._preloadedImages[cardObj.id]) {
            const image = this._preloadedImages[cardObj.id];
            if(this._cardElements[index]){
               this._cardElements[index].card.setImage(image);
            }           
         }

      } else {
         card = this._cardElements[index].card;
      }

      cardObj.attributeOrder = this._cardLabelOptions;

      this._currentCardIndexes[cardObj.id] = index;

      // Initialize the card panel
      this._cardElements[index].annotationPanelDiv.setAttribute("data-loc-id", cardObj.id)
      this._cardElements[index].annotationPanel.init({
         cardObj
      });

      
      let cardLabelsChosen = this.gallery.cardLabelsChosenByType[typeId] ?  this.gallery.cardLabelsChosenByType[typeId] : [];

      // Initialize Card
      card.init({
         obj: cardObj,
         panelContainer: this.panelContainer,
         annotationPanelDiv: this._cardElements[index].annotationPanelDiv,
         cardLabelsChosen
      });

      card.style.display = "block";
      this.numberOfDisplayedCards += 1;
   }

   showLabels(selectedLabels) {
      console.log(selectedLabels);
      for (let el of this.attributeLabelEls) {
         console.log(`ID ${el.id} is included? ${selectedLabels.includes(el.id)}`);
         if (selectedLabels.includes(el.id)) {
            el.classList.remove("hidden");
         } else {
            el.classList.add("hidden");
         }
      }
   }

   _updateLabelValues({ newValues }) {
      for (let el of this.attributeLabelEls) {
         //const [key, value] of Object.entries(object1)
         for (const [key, value] of Object.entries(newValues.attributes)) {
            if (encodeURI(key) == el.id) {
               el.innerHTML = `<span class="px-2">|</span> ${key}: ${value}`;
            }
         }
      }
   }

   // _updateLocalizationAttribute({ newValues }) {
   //    for (let i = 0; i < this._cardElements.length; i++) {
   //       let cardAttr = this._cardElements[i].card.cardObj.attributes;
   //       cardAttr = newValues.attributes;

   //       for (let attrType of this.state.entityType.attribute_types) {
   //          if (attrType.order == 0) {
   //             if (cardAttr[attrType.name] != undefined) {
   //                this._cardElements[i].card._name.textContent = cardAttr[attrType.name];
   //             }
   //             break;
   //          }
   //       }
   //    }
   // }

   async _handleCardPagination(evt) {
      const start = evt.detail.start;
      const stop = evt.detail.stop;

      // Hide all the cards, and figure out which ones we need to show
      for (let el of this._cardElements) {
         el.card.style.display = "none";
      }

      //if (evt.detail.start >= this._cardElements.length) {
      for (let i = start; i < stop; i++) {
         let initData = this.unshownCards[i]; //type, id, totalList

         if (typeof initData == "undefined") {
            this._cardElements[i].card.style.display = "block";
         } else {
            delete this.unshownCards[i];
            console.log(`Preparing new card for id ${initData.id} where i is equal to ${i}`);
            // start is further than we have gotten cards
            const card = await this.slideCardData.makeCardList(initData);

            if (card) {
               card[0].posText = `${i + 1} of ${initData.totalList}`;
               card[0].stateType = this.state.typeData.association;
               card[0].stateInfo = {
                  id: this.state.id,
                  attributes: this.state.attributes,
                  entityType: this.state.typeData,
                  state: this.state
               }
               //states.cards.push(card);
               const detail = { detail: { cardData: card, cardIndex: i } };
               // if ((counter + 1) < this._previewCardCount) {
               let newCardEvent = new CustomEvent('new-card', detail);
               this.dispatchEvent(newCardEvent);
            }
         }
      }

   }

   updateCardData(newCardData) {
      const index = this._currentCardIndexes[newCardData.id];
      const card = this._cardElements[index].card;
      //console.log(card);

      if(card){
         card._updateAttributeValues(newCardData);
      }
      
   }

   // _cardSortUpdate(evt){
   //    // go through all cards, and sort them..
   //    let property = evt.detail.sortProperty;
   //    let sortType = evt.detail.sortType;

   //    if(evt.detail.sortType){ // true is == "Ascending"
   //           // #todo handle pagination
   //    this._cardElements.sort((el1, el2) => {
   //       console.log(el1);
   //       console.log(el2);
         
   //       return el1[property] - el2[property];
   //    });
   //    } else {
         
   //       // #todo handle pagination
   //       this._cardElements.sort((el1, el2) => {
   //          console.log(el1);
   //          console.log(el2);
            
   //          return el2[property] - el1[property];
   //       });
   //    }

   //    let msg = `Entry sort complete`
   //    Utilities.showSuccessIcon(msg);
   // }

}

customElements.define("entity-gallery-slider", EntityGallerySlider);