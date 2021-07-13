class CollectionsGallery extends EntityCardSlideGallery {
   constructor() {
      super();
      /*
      * Add tools, headings and pagination for gallery here
      *
      */
      this.panelContainer = null;

      this.h2.appendChild( document.createTextNode("Collections"));

      this.sliderList = document.createElement("div");
      this.sliderList.setAttribute("class", "slider-list");
      this._sliderContainer.appendChild(this.sliderList);

      // Filter toolbar
      // * hook to add filter interface
      this._filterDiv = document.createElement("div");
      this._filterDiv.setAttribute("class", "analysis__filter");
      
      // Tools setup
      this._tools.before(this._filterDiv)
      this._tools.setAttribute("class", "");

      // Display options in more menu
      // Note: this is appended to filter nav in collections.js
      this._moreMenu = document.createElement("entity-gallery-more-menu");
      this._moreMenu.summary.setAttribute("class", "entity-gallery-tools--more"); // btn btn-clear btn-outline f2 px-1

      /**
       * SLIDER Label display options link for menu, and checkbox div
      */ 
      this._attributeLabels = document.createElement("entity-gallery-labels");
      this._tools.appendChild(this._attributeLabels);
      this._attributeLabels.menuLinkTextSpan.innerHTML = "Collection Labels";
      this._moreMenu._menu.appendChild(this._attributeLabels.menuLink);

      /**
       * CARD Label display options link for menu, and checkbox div
       */ 
      this._cardAtributeLabels = document.createElement("entity-gallery-labels");
      this._tools.appendChild(this._cardAtributeLabels);
      this._cardAtributeLabels.menuLinkTextSpan.innerHTML = "Entry Labels";
      this._moreMenu._menu.appendChild(this._cardAtributeLabels.menuLink);

      /**
       * CARD Sort display options link for menu, and checkbox div
       */ 
      this._cardAtributeSort = document.createElement("entity-gallery-sort");
      this._tools.appendChild(this._cardAtributeSort);
      this._cardAtributeSort.menuLinkTextSpan.innerHTML = "Sort Entries";
      this._moreMenu._menu.appendChild(this._cardAtributeSort.menuLink);

      /* Slider information */
      this._sliderLists = [];
      this._sliderElements = [];
      this.slideCardData = document.createElement("collection-slide-card-data");
      this.cardLabelsChosenByType = {};

      // First group and total cards
      this._previewCardCount = 11;
   }

   // Provide access to side panel for events
   init({
      panelContainer,
      pageModal,
      modelData,
      collectionsData,
      galleryContainer,
      analyticsSettings
   }) {
      this.panelContainer = panelContainer;
      this.panelControls = this.panelContainer._panelTop;
      this.pageModal = pageModal;
      this.collectionsData = collectionsData;
      this.galleryContainer = galleryContainer;
      this.analyticsSettings = analyticsSettings;
      this.modelData = modelData;

      try {
         this.slideCardData.init(modelData);
      } catch (e) {
         console.log(e.description);
      }

      this._paginator_top.addEventListener("selectPage", this._paginateGallery.bind(this));
      this._paginator.addEventListener("selectPage", this._paginateGallery.bind(this));

      // Setup the label picker
      var stateTypes = this.collectionsData.getStateTypes();


      // Label Values
      this.currentLabelValues = {};
      const labelValues = [];
      for (let idx = 0; idx < stateTypes.length; idx++) {
         let stateType = stateTypes[idx];
         let typeId = stateType.id;

         this.currentLabelValues[typeId] = labelValues;
         
         // Provide labels and access to the sliders
         let labels = this._attributeLabels.add({ 
               typeData: stateType 
            });

         // Slider label display changes
         this._attributeLabels.addEventListener("labels-update", this.labelsUpdate.bind(this));
      }
   }


   labelsUpdate(evt) {
      let typeId = evt.detail.typeId;
      let labelValues = evt.detail.value;

      // Keep track at gallery level for pagination
      this.currentLabelValues[typeId] = labelValues;

      // find the slider, and pass labelvalues)
      for (let s of this._sliderElements) {
         if (s.getAttribute("meta") == typeId) {
            s.showLabels(labelValues);
         }
      }
      
      let msg = `Collection labels updated`;
      Utilities.showSuccessIcon(msg);
   }

   updateFilterResults(filterConditions, page, pageSize) {
      this._filterConditions = filterConditions;

      // Set the pagination state based on either defaults of this gallery
      // or by the settings. This must be done prior to collecting data
      if (isNaN(page) || isNaN(pageSize)) {
         page = 1;
         pageSize = 5;
      }
      var paginationState = {
         start: (page - 1) * pageSize,
         stop: page * pageSize,
         page: page,
         pageSize: pageSize,
         init: true
      }
      this.collectionsData.setPaginationState(paginationState);
      this.collectionsData.updateData(this._filterConditions).then(() => {
         var totalCount = this.collectionsData.getNumberOfResults();
         if (totalCount > 0) {
            // Top page selector
            this._paginator_top.hidden = false;
            this._paginator_top._pageSize = this.collectionsData.getPageSize();
            this._paginator_top.init(totalCount, this.collectionsData.getPaginationState());

            // Bottom page selector
            this._paginator.hidden = false;
            this._paginator._pageSize = this.collectionsData.getPageSize();
            this._paginator.init(totalCount, this.collectionsData.getPaginationState());
         }

         this._numFiles.textContent = `${totalCount} Results`;

         this._paginationUpdate(paginationState);
      });
   }

   /**
    * Callback when one of the paginators have an event (e.g. page)
    * @param {object} evt
    */
   _paginateGallery(evt) {
      var paginationState = {
         start: evt.detail.start,
         stop: evt.detail.stop,
         page: evt.detail.page,
         pageSize: evt.detail.pgsize,
         init: false
      }
      this._paginationUpdate(paginationState);
   }

   async _paginationUpdate(paginationState) {

      this.collectionsData.setPaginationState(paginationState);
      const newSliderPage = this.collectionsData.getPage();

      // update paginator
      this._paginator_top.setValues(this.collectionsData.getPaginationState());
      this._paginator.setValues(this.collectionsData.getPaginationState());

      while (this._sliderContainer.firstChild) {
         this._sliderContainer.removeChild(this._sliderContainer.firstChild);
      }
      this._sliderLists = [];

      // Add new states
      // If the slider already exists, we're hiding and showing
      if (this._sliderLists[newSliderPage]) {
         for (let a in this._sliderLists) {
            //console.log(this._sliderLists[a]);
            this._sliderLists[a].hidden = true;
         }
         this._sliderLists[newSliderPage].hidden = false;
      } else {
         // If we haven't made this page, we need to fetch the next page
         await this.collectionsData.updateData(this._filterConditions);
         var states = this.collectionsData.getStates();

         for (let a in this._sliderLists) {
            //console.log(this._sliderLists[a]);
            this._sliderLists[a].hidden = true;
         }

         let newSliderList = document.createElement("div");
         newSliderList.setAttribute("class", "slider-list");
         newSliderList.setAttribute("page", this.collectionsData.getPaginationState());
         //this._sliderLists[this.collectionsData._states.paginationState.page] = newSliderList;

         this._addSliders({ sliderList: newSliderList, states });

         this._sliderContainer.appendChild(newSliderList);

         // Update new slider panel permission
         const locked = this.analyticsSettings._lock._pathLocked.style.display != "none";
         const permissionValue = locked ? "View Only" : "Can Edit";
         const panelPermissionEvt = new CustomEvent("permission-update", { detail: { permissionValue } })
         this.panelContainer.dispatchEvent(panelPermissionEvt);
      }

      this._numFiles.textContent = `${this.collectionsData.getNumberOfResults()} Results`;
      this.analyticsSettings.setAttribute("pagesize", this.collectionsData.getPageSize());
      this.analyticsSettings.setAttribute("page", this.collectionsData.getPage());
      window.history.pushState({}, "", this.analyticsSettings.getURL());
   }

   async _addSliders({ sliderList, states }) {
      const currentSliderEls = [];
      let sliderPage = this.collectionsData.getPage();
      this._sliderLists[sliderPage] = sliderList;
      
      // Append the sliders
      for (let idx = 0; idx < states.length; idx++) {
         let state = states[idx];
         state.cards = [];

         const slider = document.createElement("entity-gallery-slider");
         slider.setAttribute("id", state.id);
         slider.setAttribute("meta", state.meta);
         slider.entityFormChange = this.entityFormChange.bind(this);
         slider.stateFormChange = this.stateFormChange.bind(this);
         slider.mediaFormChange = this.mediaFormChange.bind(this);
         slider._cardAtributeLabels = this._cardAtributeLabels;
         slider._cardAtributeSort = this._cardAtributeSort;
         sliderList.appendChild(slider);

         // # todo some of above and below can be inferred from gallery
         // # #todo labels and sort state part of collections data
         slider.init({
            panelContainer: this.panelContainer,
            pageModal: this.pageModal,
            currentLabelValues: this.currentLabelValues,
            slideCardData: this.slideCardData,
            cardType: "collections-card",
            attributes: state.attributes,
            state,
            gallery: this 
         });

         slider.unshownCards = {};
         slider._fullCardsAdded = false;  

         let currentCount = (sliderPage - 1) * this.collectionsData.getPageSize() + idx + 1;
         slider.setAttribute("title", `${state.typeData.name} ID: ${state.id}`);
         slider.setAttribute("count", `${currentCount} of ${this.collectionsData.getNumberOfResults()}`);

         this._sliderElements.push(slider);
         currentSliderEls.push(slider);

         slider.addEventListener("click", (e) => {
            if (!slider.main.classList.contains("active")) {
               slider.dispatchEvent(new Event("slider-active"));

               // This sliderEl is active, the rest are inactive
               for (let s of this._sliderElements) {
                  if (s.id !== slider.id) {
                     s.dispatchEvent(new Event("slider-inactive"));
                  }
               }
            }
         });

         // Slider Card Sort display changes
         this._cardAtributeSort.addEventListener("sort-update", this._cardSortUpdate.bind(this));
      }

      for (let i in currentSliderEls) {
         await this._addSliderCards({ slider: currentSliderEls[i], state: states[i] });
      }

   }

   async _addSliderCards({ slider, state }) {
      const association = state.typeData.association;
      const galleryList = association === "Localization" ? state.localizations : state.media;

      let counter = 0;

      if (galleryList) {
         const totalList = galleryList.length;

         // Loc association should have list of loc Ids -- If none we should show State with Name and 0 Localizations
         if (totalList > 0) {
            // Otherwise, get the localizations & make cards with slideCard
            for (let id of galleryList) {
               if ((counter + 1) < this._previewCardCount) {
                  const cardInitData = { type: state.typeData.association, id };
                  const card = await this.slideCardData.makeCardList(cardInitData);

                  if (card) {
                     if(this._cardAtributeLabels._selectionValues[state.typeData.id]){
                       this._cardAtributeLabels._getValue(state.typeData.id);
                     }
                     card[0].posText = `${counter + 1} of ${totalList}`;
                     card[0].stateType = state.typeData.association;
                     card[0].stateInfo = {
                        id: state.id,
                        attributes: state.attributes,
                        entityType: state.typeData,
                        state: state
                     }
                     //states.cards.push(card);
                     const detail = { detail: { cardData: card, cardIndex: counter } };
                     // if ((counter + 1) < this._previewCardCount) {
                     let newCardEvent = new CustomEvent('new-card', detail);
                     slider.dispatchEvent(newCardEvent);
                     // } else {
                     //    slider.unshownCards.push(detail);
                     // }
                  }
               } else {
                  const cardInitData = { type: state.typeData.association, id, totalList };
                  // const card = await this.slideCardData.makeCardList(cardInitData);
                  slider.unshownCards[counter] = cardInitData;
               }

               counter++;

            }

            if (totalList <= this._previewCardCount) {
               // slider.loadAllTeaser.innerHTML = "See All";
               // if (totalList < 4) {
               slider.loadAllTeaser.remove();
               //}
            } else {
               slider.loadAllTeaser.remove();

               // setup navigation within this slider
               let topNav = document.createElement("entity-gallery-paginator");
               let bottomNav = document.createElement("entity-gallery-paginator");
               slider._cardPaginationState = {
                  page: 1,
                  start: 0,
                  stop: 10,
                  pgsize: 10
               };

               topNav.init(totalList, slider._cardPaginationState);

               bottomNav.init(totalList, slider._cardPaginationState);

               topNav.pageSizeEl.hidden = true;
               topNav.pageSizeText.hidden = true;
               topNav.goToPage.hidden = true;
               topNav.goToPageText.hidden = true;

               bottomNav.pageSizeEl.hidden = true;
               bottomNav.pageSizeText.hidden = true;
               bottomNav.goToPage.hidden = true;
               bottomNav.goToPageText.hidden = true;

               // # todo need to stop last event before this one
               slider._cancelLoading = false;
               topNav.addEventListener("selectPage", (evt) => {
                  evt.stopPropagation();
                  slider._handleCardPagination(evt);
                  let paginationState = {
                     page: evt.detail.page,
                     start: evt.detail.start,
                     stop: evt.detail.stop,
                     pageSize: evt.detail.pageSize
                  };
                  topNav.setValues(paginationState);
                  bottomNav.setValues(paginationState);
               });
               bottomNav.addEventListener("selectPage", (evt) => {
                  evt.stopPropagation();
                  slider._handleCardPagination(evt);
                  let paginationState = {
                     page: evt.detail.page,
                     start: evt.detail.start,
                     stop: evt.detail.stop,
                     pageSize: evt.detail.pageSize
                  };
                  topNav.setValues(paginationState);
                  bottomNav.setValues(paginationState);
               });

               slider._topNav.appendChild(topNav);
               slider._bottomNav.appendChild(bottomNav);
            }
         }
      }
   }

   async _addNextUnshownCard(slider) {
      let cardInitData = slider.unshownCards.shift();
      let card = await this.slideCardData.makeCardList(cardInitData);

      const detail = { detail: { cardData: card, cardIndex: counter } };
      let newCardEvent = new CustomEvent('new-card',);
      slider.dispatchEvent(newCardEvent);

      //If this is the last card, update flags, and remove link
      if (slider.unshownCards.length === 0) {
         slider._fullCardsAdded === true;
         slider.loadAllTeaser.remove();
         return false;
      }
   }

   _makeSliderActive(sliderEl, stateId) {
      // This sliderEl is active, the rest are inactive
      sliderEl.main.classList.add("active");
      sliderEl.dispatchEvent(new Event("slider-active"));

      for (let s of this._sliderElements) {
         s.main.classList.remove("active");
         s.dispatchEvent(new Event("slider-inactive"));
      }

      //this.analyticsSettings.setAttribute("selectedState", stateId);

      //return sliderEl.scrollIntoView(true);
   }

   entityFormChange(e) {
      this.formChange({
         id: e.detail.id,
         values: { attributes: e.detail.values },
         type: "Localization"
      }).then((data) => {   
         console.log("Localization form change.....") 
         for (let s of this._sliderElements) {
            if(s.state.typeData.association == "Localization"){
               s.updateCardData(data);
            }
         }
      });
   }

   stateFormChange(e) {
      this.formChange({
         id: e.detail.id,
         values: { attributes: e.detail.values },
         type: "State"
      }).then((data) => {
         // Find the right slider
         for (let s of this._sliderElements) {
            if (s.id == e.detail.id) {
               // update the panels for the other cards
               for (let c of s._cardElements) {
                  c.annotationPanel.stateData.updateValues({ newValues: data });
               }
               // update the label for the slider
               s._updateLabelValues({ newValues: data });
            }
         }
      });
   }

   mediaFormChange(e) {
    var mediaId = e.detail.id;
    this.formChange({
      id: e.detail.id,
      values: { attributes: e.detail.values },
      type: "Media"
    }).then(() => {
      for (let s of this._sliderElements) {
         console.log(s.state);
         if(s.state.typeData.association == "Media"){
            s.updateCardData(data);
         }
      }
    });
   }   

   async formChange({ type, id, values } = {}) {
      var result = await fetch(`/rest/${type}/${id}`, {
         method: "PATCH",
         mode: "cors",
         credentials: "include",
         headers: {
            "X-CSRFToken": getCookie("csrftoken"),
            "Accept": "application/json",
            "Content-Type": "application/json"
         },
         body: JSON.stringify(values)
      });

      var data = await result.json();
      let msg = "";
      if (result.ok) {
         if (data.details && data.details.contains("Exception")) {
            msg = `Error: ${data.message}`
            Utilities.warningAlert(msg);
         } else {
            msg = `${data.message}`
            Utilities.showSuccessIcon(msg);
         }

      } else {
         if (data.message) {
            msg = `Error: ${data.message}`
         } else {
            msg = `Error saving ${type}.`
         }
         Utilities.warningAlert(msg, "#ff3e1d", false);
      }

      result = await fetch(`/rest/${type}/${id}`, {
         method: "GET",
         mode: "cors",
         credentials: "include",
         headers: {
            "X-CSRFToken": getCookie("csrftoken"),
            "Accept": "application/json",
            "Content-Type": "application/json"
         },
      });
      data = await result.json();
      return data;
   }

    _cardSortUpdate(evt){
      // try{
         for (let s of this._sliderElements) {
            // go through all cards, and sort them..
            let property = evt.detail.sortProperty;
            let sortType = evt.detail.sortType;
            console.log(`Sorting ${property} in Asc? ${sortType}`);

            let ascCheck = (val1, val2) => {
               if(val1 < val2) return 1;
               if(val1 > val2) return -1;
               return 0;
            };

            let dscCheck = (val1, val2) => {
               if(val1 > val2) return 1;
               if(val1 < val2) return -1;
               return 0;
            };

            let fnCheck = sortType ? ascCheck : dscCheck;

            // #todo handle pagination
            s._cardElements.sort((el1, el2) => {
               //console.log(el1.card.cardObj.attributes);
               let el1Value = "";
               let el2Value = "";
               if(property !== "ID" ){
                  //if(el1.card.cardObj.attributes != {}) {
                  el1Value = typeof el1.card.cardObj.attributes[property] !=  undefined ? el1.card.cardObj.attributes[property] : "not set";
                  el2Value = el2.card.cardObj.attributes[property] !=  undefined ? el2.card.cardObj.attributes[property] : "not set";
                  //}
               } else if(property == "ID") {
                  el1Value = el1.card.cardObj.id;
                  el2Value = el2.card.cardObj.id;
               }
               
               //console.log(`el1Value ${el1Value} > el2Value ${el2Value} ... ${el1Value > el2Value}`);
               return fnCheck(el1Value, el2Value);
            });
            
            // copy our new list
            let newList = [];
            for(let idx in s._cardElements){
               newList.push(s._cardElements[idx]);
            }

            // clear gallery
            s._cardElements = [];
            s._currentCardIndexes = {}
            s._ul.innerHTML = "";
               
            // add cards back
            for(let idx in newList){
               const cardInfo = { cardIndex: idx, cardData: newList[idx].card.cardObj, cardType: "collections-card" };
               const cardNewOrder = new CustomEvent("new-card", {detail : cardInfo})
               s.dispatchEvent(cardNewOrder);
            }

            let msg = `Entry sort complete`
            Utilities.showSuccessIcon(msg);
         }
      // } catch(e) {
      //    let msg = `Entry sort error`
      //    Utilities.warningAlert(msg, "#ff3e1d", false); 
      // }
   }
}

customElements.define("collections-gallery", CollectionsGallery);
