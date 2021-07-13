class AnalyticsCollections extends TatorPage {
    constructor() {
      super();

      //
      // Header
      //
      const header = document.createElement("div");
      this._headerDiv = this._header._shadow.querySelector("header");
      header.setAttribute("class", "annotation__header d-flex flex-items-center flex-justify-between px-6 f3");
      const user = this._header._shadow.querySelector("header-user");
      user.parentNode.insertBefore(header, user);

      const div = document.createElement("div");
      div.setAttribute("class", "d-flex flex-items-center");
      header.appendChild(div);

      this._breadcrumbs = document.createElement("analytics-breadcrumbs");
      div.appendChild(this._breadcrumbs);
      this._breadcrumbs.setAttribute("analytics-name", "Collections Gallery");

      this._settings = document.createElement("analytics-settings");
      this._settings.style.marginLeft = "50px";
      div.appendChild(this._settings);

      // Wrapper to allow r.side bar to slide into left
      this.mainWrapper = document.createElement("div");
      this.mainWrapper.setAttribute("class", "analysis--main--wrapper col-12 d-flex");
      this._shadow.appendChild(this.mainWrapper);

      //
      // Define the main section of the page
      //
      this.main = document.createElement("main");
      this.main.setAttribute("class", "collections-gallery--main col-12");
      this.mainWrapper.appendChild(this.main);

      //
      /* Slider w/ Cards Gallery */
      // Gallery of horizontal bars to view collections
      this._collectionsGallery = document.createElement("collections-gallery");
      this.main.appendChild(this._collectionsGallery);

      /* Collections Filter */
      // add filter into the gallery (to place under gallery heading)
      this._filterView = document.createElement("filter-interface");
      this._collectionsGallery._filterDiv.appendChild(this._filterView);

      // Custom gallery more menu added into filter interface tools ares
      this._filterView._moreNavDiv.appendChild(this._collectionsGallery._moreMenu);

      //
      /* Right Navigation Pane - Annotation Detail Viewer */
      this.aside = document.createElement("aside");
      this.aside.setAttribute("class", "entity-panel--container gray-panel slide-close col-3")
      this.mainWrapper.appendChild(this.aside);

      // Gallery navigation panel
      this._panelContainer = document.createElement("entity-panel-container");
      this.aside.appendChild(this._panelContainer);

      //
      /* Other */
      // Class to hide and showing loading spinner
      // @TODO what is standard use?
      this.loading = new LoadingSpinner();
      this._shadow.appendChild(this.loading.getImg());

      // Modal parent - to pass to page components
      this.modal = document.createElement("modal-dialog");
      this._shadow.appendChild(this.modal);
      this.modal.addEventListener("open", this.showDimmer.bind(this));
      this.modal.addEventListener("close", this.hideDimmer.bind(this));

      // Note: this will show them if they exist, may be project by project
      this.acceptedTypes = ["Media", "Localization"]; // No Frame assoc not shown here
    }

  _init() {

    this.loading.showSpinner();
    this.showDimmer();

    // Initialize the settings with the URL. The settings will be used later on.
    this._settings.processURL();

    // Set lock value
    if (this._settings.hasAttribute("lock")) {
      let settingsLock = this._settings.getAttribute("lock");

      if (settingsLock === "1") {
        //console.log("open the lock");
        this._settings._lock.unlock();
        this._panelContainer.setAttribute("permissionValue", "Can Edit");
      }
    }

    // Database interface. This should only be used by the viewModel/interface code.
    this.projectId = Number(this.getAttribute("project-id"));

    this._modelData = new TatorData(this.projectId);
    this._modelData.init().then(() => {

        // Collections data view
        this._collectionsData = document.createElement("collections-data");
        this._collectionsData.init(this._modelData);

        // Init panel side behavior
        this._panelContainer.init({
          main: this.main,
          aside: this.aside,
          pageModal: this.modal,
          modelData: this._modelData,
          gallery: this._collectionsGallery 
        });

        // Pass panel and localization types to gallery
        this._collectionsGallery.init({
          panelContainer: this._panelContainer,
          pageModal: this.modal,
          modelData: this._modelData,
          collectionsData: this._collectionsData,
          galleryContainer: this._collectionsGallery,
          analyticsSettings: this._settings
        });

        // Filter interface
        this._filterConditions = this._settings.getFilterConditionsObject();
        this._filterDataView = new FilterData(
        this._modelData, ["collections-analytics-view"], ["Localizations"]);
        this._filterDataView.init();
        this._filterView.dataView = this._filterDataView;
        this._filterView.setFilterConditions(this._filterConditions);

        // Listen for filter events
        this._filterView.addEventListener("filterParameters", this.updateFilterResults.bind(this));

        // Settings lock value
        this._settings._lock.addEventListener("click", evt => {
          const locked = this._settings._lock._pathLocked.style.display != "none";
          const permissionValue = locked ? "View Only" : "Can Edit";
          const panelPermissionEvt = new CustomEvent("permission-update", { detail: { permissionValue } })
          this._panelContainer.dispatchEvent(panelPermissionEvt);

          if (locked) {
            this._settings.setAttribute("lock", 0);
          } else {
            this._settings.setAttribute("lock", 1);
          }
          //window.history.pushState({}, "", this._settings.getURL());
        });

        this._collectionsGallery.updateFilterResults(
            this._filterConditions,
            this._settings.getPage(),
            this._settings.getPageSize());

        this.loading.hideSpinner();
        this.hideDimmer();
    });
  }

  updateFilterResults(evt) {
    this._filterConditions = evt.detail.conditions;
    var filterURIString = encodeURIComponent(JSON.stringify(this._filterConditions));
    this._settings.setAttribute("filterConditions", filterURIString);
    this._collectionsGallery.updateFilterResults(this._filterConditions);
  }

  attributeChangedCallback(name, oldValue, newValue) {
    TatorPage.prototype.attributeChangedCallback.call(this, name, oldValue, newValue);
    switch (name) {
      case "project-name":
        this._breadcrumbs.setAttribute("project-name", newValue);
        break;
      case "project-id":
        this._init();
        break;
    }
  }

  static get observedAttributes() {
    return ["project-name", "project-id"].concat(TatorPage.observedAttributes);
  }

  // Page dimmer handler
  showDimmer() {
    return this.setAttribute("has-open-modal", "");
  }

  hideDimmer() {
    return this.removeAttribute("has-open-modal");
  }
}

customElements.define("analytics-collections", AnalyticsCollections);