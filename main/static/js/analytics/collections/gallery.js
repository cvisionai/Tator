class CollectionsGallery extends EntityCardSlideGallery {
   constructor() {
      super();
      /*
      * Add tools, headings and pagination for gallery here
      *
      */
      this.panelContainer = null;

      this.sliderList = document.createElement("div");
      this.sliderList.setAttribute("class", "slider-list");


      this._sliderLists = [];


      this._sliderContainer.appendChild(this.sliderList);

      this.slideCardData = document.createElement("collection-slide-card-data");

      // Property IDs are the entity IDs (which are expected to be unique)
      // Each property (ID) points to the index of the sliders information stored in _sliderElements
      //this._currentSliderIndexes = {};

      // Entity sliders aren't deleted. They are reused and hidden if not used.
      this._sliderElements = [];

      // First group and total cards
      this._previewCardCount = 1000;
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

      // Possibly remove this so we can have navigation controls
      // this.panelContainer._panelTop._topBarArrow.hidden = true;
      // this.panelContainer._panelTop.panelNav.init();

      try {
         this.slideCardData.init(modelData);
      } catch (e) {
         console.log(e.description);
      }

      this._paginator_top.addEventListener("selectPage", this._paginateGallery.bind(this));
      this._paginator.addEventListener("selectPage", this._paginateGallery.bind(this));

      // Setup the label picker
      var stateTypes = this.collectionsData.getStateTypes();

      this.currenLabelValues = {};
      this.currenHiddenType = [];

      for (let idx = 0; idx < stateTypes.length; idx++) {
         var stateType = stateTypes[idx];
         let typeId = stateType.id;
         let labels = document.createElement("entity-gallery-labels");
         let labelValues = [];
         this.currenLabelValues[typeId] = labelValues;

         // Provide labels and access to the sliders
         labels.init({ typeData: stateType, gallery: this });
         this._attributeLabelsDiv.appendChild(labels);

         // Label display changes
         labels.addEventListener("labels-update", (e) => {
            labelValues = e.detail.value;
            this.labelsUpdate({typeId, labelValues});
            this.currenLabelValues[typeId] = labelValues;
         });

         // Hide / Show type changes
         labels.addEventListener("hide-type-update", (e) => {
            this.hideThisType({ typeId, hidden: e.detail.off });
         });
      }
   }

   hideThisType({ typeId, hidden }) {
      // find the slider, and show it's values
      for (let s of this._sliderElements) {
         if (s.getAttribute("meta") == typeId) {
            let hiddenHTML = `<div class="hidden-type-html col-12">[ ${s.title} Hidden ]</div>`;
            var helper = document.createElement('div');
            helper.innerHTML = hiddenHTML;
            //show the Labels (which are there but hidden)
            if (hidden) {
               s.classList.add("hidden");
               s.after(helper);
               this.currenHiddenType.push(typeId);
            } else if (!hidden) {
               s.classList.remove("hidden");
               helper.hidden = true;
               helper.remove();
               let index = this.currenHiddenType.indexOf(typeId);
               this.currenHiddenType.splice(index, 1);
            }
         }
      }
   }

   labelsUpdate({ typeId, labelValues }) {
      // find the slider, and show it's values
      for (let s of this._sliderElements) {
         //console.log(`Updating for ${typeId} -- this smeta is ${s.getAttribute("meta")} for slider id ${s.id}`)
         if (s.getAttribute("meta") == typeId) {
            //show the Labels (which are there but hidden)
            s.showLabels(labelValues);
         }
      }
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
         init: false}
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
         //console.log(newSliderPage);
         //console.log(this._sliderLists);
         //console.log(this._sliderLists[newSliderPage]);
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

         this._addSliders({ sliderList: newSliderList, states: states });
         console.log(states);
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
      let sliderPage = this.collectionsData.getPage();
      this._sliderLists[sliderPage] = sliderList;

      // Append the sliders
      for (let idx = 0; idx < states.length; idx++) {
         let state = states[idx];
         state.cards = [];
         let counter = 0;

         const slider = document.createElement("entity-gallery-slider");
         slider.setAttribute("id", state.id);
         slider.setAttribute("meta", state.meta);
         slider.entityFormChange = this.entityFormChange.bind(this);
         slider.stateFormChange = this.stateFormChange.bind(this);
         slider.mediaFormChange = this.mediaFormChange.bind(this);

         slider.init({
            panelContainer: this.panelContainer,
            pageModal: this.pageModal,
            currenLabelValues: this.currenLabelValues,
            currenHiddenType: this.currenHiddenType,
            slideCardData: this.slideCardData,
            cardType: "collections-card",
            attributes: state.attributes,
            state
         });

         slider.unshownCards = [];
         slider._fullCardsAdded = false;

         let currentCount = (sliderPage - 1) * this.collectionsData.getPageSize() + idx + 1;
         slider.setAttribute("title", `${state.typeData.name} ID: ${state.id}`);
         slider.setAttribute("count", `${currentCount} of ${this.collectionsData.getNumberOfResults()}`);

         this._sliderElements.push(slider);
         sliderList.appendChild(slider);

         // tell the panel about these cards
         // this.panelContainer._panelTop.panelNav.pushNavData({
         //    sliderIndex: (sliderList.length - 1),
         //    entityList: slider._cardElements
         // });

         slider.addEventListener("click", (e) => {
            if (!slider.main.classList.contains("active")) {
               slider.dispatchEvent(new Event("slider-active"));

               // This sliderEl is active, the rest are inactive
               for (let s of this._sliderElements) {
                  if (s.id !== slider.id) {
                     s.dispatchEvent(new Event("slider-inactive"));
                  }
               }

               slider.scrollIntoView({
                  behavior: "smooth",
                  block: "end",
                  inline: "nearest"
               });

               //this.analyticsSettings.setAttribute("selectedState", state.id);
               //window.history.pushState({}, "", this.analyticsSettings.getURL());

               // cards

               if (slider.unshownCards && slider.unshownCards.length > 0 && !slider._fullCardsAdded) {
                  let loadMoreCounter = 10;
                  for (var i = 1; i <= loadMoreCounter; i++) {
                     this._addUnshownCards(slider);
                  }
               } else {
                  slider._fullCardsAdded === true;
                  slider.loadAllTeaser.remove();
               }
            }
            // } else {
            //
            //    console.log("This is already open!")
            //    //toggle it shut
            //    const inactiveEvent = new Event("slider-inactive");
            //    slider.dispatchEvent(inactiveEvent);

            // }
         });

         slider.loadAllTeaser.addEventListener("click", (e) => {
            console.log("clicked loadAll link!")

            if (slider.unshownCards && slider.unshownCards.length > 0 && !slider._fullCardsAdded) {
               let loadMoreCounter = 10;
               for (var i = 1; i <= loadMoreCounter; i++) {
                  this._addUnshownCards(slider);
               }
            } else {
               slider._fullCardsAdded === true;
               slider.loadAllTeaser.remove();
            }
         });

         // create the cards
         const galleryList = state.typeData.association === "Localization" ? state.localizations : state.media;
         if (galleryList) {
            const totalList = galleryList.length;
            //const trackOrTracks = totalList > 1 ? "Tracks" : "Track";
            //const cardCountText = document.createTextNode(`(${totalList} ${trackOrTracks})`)
            //slider._count.appendChild(cardCountText);

            // Loc association should have list of loc Ids -- If none we should show State with Name and 0 Localizations
            if (totalList > 0) {
               // Otherwise, get the localizations & make cards with slideCard
               for (let id of galleryList) {
                  const cardInitData = { type: state.typeData.association, id };
                  const card = await this.slideCardData.makeCardList(cardInitData);

                  if (card) {
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
                     if ((counter + 1) < this._previewCardCount) {
                        let newCardEvent = new CustomEvent('new-card', detail);
                        slider.dispatchEvent(newCardEvent);
                     } else {
                        slider.unshownCards.push(detail);
                     }

                     counter++;
                  }

               }

               if (totalList <= this._previewCardCount) {
                  slider.loadAllTeaser.innerHTML = "See All";
                  if (totalList < 4) {
                     slider.loadAllTeaser.remove();
                  }
               }
            }

         }


         // Bookmarking of state
         // if (this.analyticsSettings.hasAttribute("selectedState")) {
         //    //for (let s of this._sliderElements) {
         //    let settingsState = Number(this.analyticsSettings.getAttribute("selectedState"));
         //    let sliderId = Number(slider.getAttribute("id"));
         //    if (settingsState == sliderId) {
         //       //this._makeSliderActive(slider, sliderId)
         //       //console.log("Found the selected state slider!");
         //       // This sliderEl is active, the rest are inactive
         //       slider.main.classList.add("active");
         //       slider.dispatchEvent(new Event("slider-active"));
         //       slider.scrollIntoView({
         //          behavior: "smooth",
         //          block: "nearest",
         //          inline: "nearest"
         //       });
         //    }
         //    //}

         // }

      }


   }

   _addUnshownCards(slider) {
      let newCardEvent = new CustomEvent('new-card', slider.unshownCards.shift());
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

      return sliderEl.scrollIntoView(true);
   }

   updateCardData(newCardData) {
      for (let s of this._sliderElements) {
         if (newCardData.id in s._currentCardIndexes) {
            const index = s._currentCardIndexes[newCardData.id];
            const card = s._cardElements[index].card;
            s.slideData.updateLocalizationAttributes(card.cardObj).then(() => {
               card.displayAttributes();
            });
         }
      }
   }

   entityFormChange(e) {
      this.formChange({
         id: e.detail.id,
         values: { attributes: e.detail.values },
         type: "Localization"
      }).then((data) => {
         this.updateCardData(data);
      });
   }

   stateFormChange(e) {
      this.formChange({
         id: e.detail.id,
         values: { attributes: e.detail.values },
         type: "State"
      }).then((data) => {
         //console.log(data);

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
      this.formChange({
         id: e.detail.id,
         values: { attributes: e.detail.values },
         type: "Media"
      }).then((data) => {
         //#TODO
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


}

customElements.define("collections-gallery", CollectionsGallery);
