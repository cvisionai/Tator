class ProjectSettings extends TatorPage {
  constructor() {
    super();

    // loading spinner
    this.loading = new LoadingSpinner();
    this._shadow.appendChild( this.loading.getImg());
    this.loading.showSpinner();

    // header
    const header = document.createElement("div");
    this._headerDiv = this._header._shadow.querySelector("header");
    header.setAttribute("class", "annotation__header d-flex flex-items-center flex-justify-between px-2 f3");
    const user = this._header._shadow.querySelector("header-user");
    user.parentNode.insertBefore(header, user);

    const div = document.createElement("div");
    div.setAttribute("class", "d-flex flex-items-center");
    header.appendChild(div);

    this._breadcrumbs = document.createElement("settings-breadcrumbs");
    div.appendChild(this._breadcrumbs);

    // main element
    this.main = document.createElement("main");
    this.main.setAttribute("class", "position-relative");
    this._shadow.appendChild(this.main);

    // Navigation panels main for item settings.
    this.settingsNav =  document.createElement("settings-nav");
    this.main.appendChild( this.settingsNav );

    // Web Components for this page
    this.settingsViewClasses = [  "media-type-main-edit",
                                  "localization-edit",
                                  "leaf-type-edit",
                                  "state-type-edit",
                                  "membership-edit",
                                ];

    // Modal parent - to pass to page components
    this.modal = document.createElement("modal-dialog");
    this._shadow.appendChild( this.modal );
    this.modal.addEventListener("open", this.showDimmer.bind(this));
    this.modal.addEventListener("close", this.hideDimmer.bind(this));

    // Error catch all
    window.addEventListener("error", (evt) => {
      //
    });

  }

  /* Get personlized information when we have project-id, and fill page. */
  static get observedAttributes() {
    return ["project-id"].concat(TatorPage.observedAttributes);
  }
  attributeChangedCallback(name, oldValue, newValue) {
    TatorPage.prototype.attributeChangedCallback.call(this, name, oldValue, newValue);
    switch (name) {
      case "project-id":
        this._init();
        break;
    }
  }

  /* Run when project-id is set to run fetch the page content. */
  _init() {
    this.projectId = this.getAttribute("project-id");
    this.projectView = new ProjectMainEdit();
    this.typesData = new ProjectTypesData(this.projectId);
    const projectPromise = this.projectView._fetchGetPromise({ id: this.projectId });

    projectPromise
    .then( (data) => {
      return data.json();
    }).then( (objData) => {
      this._breadcrumbs.setAttribute("project-name", objData.name);
      const formView = this.projectView;

      this.loading.hideSpinner();
      this.makeContainer({
        objData, 
        classBase: formView,
        hidden : false
      });

      // Fill it with contents
      this.settingsNav.fillContainer({
        type : formView.typeName,
        id : objData.id,
        itemContents : formView
      });

      // init form with the data
      formView._init({ 
        data: objData, 
        modal : this.modal, 
        sidenav : this.settingsNav
      });

      // Add nav to that container
      this.settingsNav._addSimpleNav({
        name : formView._getHeading(),
        type : formView.typeName ,
        id : objData.id,
        selected : true
      });
        
      for(let i in this.settingsViewClasses){
        // Add a navigation section
        // let objData =  dataArray[i] ;
        let tc = this.settingsViewClasses[i];
        let typeClassView = document.createElement(tc);

        // Data for a subitem that is an empty row
        // an empty row in each TYPE
        let emptyData = typeClassView._getEmptyData();
        emptyData.name = "+ Add new";
        emptyData.project = this.projectId;

        // Add empty form container for + New
        this.makeContainer({
          objData : emptyData, 
          classBase: typeClassView
        });

        // Add navs
        const headingEl = this.settingsNav._addNav({
          name : typeClassView._getHeading(),
          type : typeClassView.typeName, 
          subItems : [ emptyData ]
        });

        // Add add new containers
        if (typeClassView.typeName == "Membership") {
          this.membershipData = new MembershipData(this.projectId);
          typeClassView.init(this.membershipData);
        }

        this.settingsNav.fillContainer({
          type : typeClassView.typeName,
          id : emptyData.id,
          itemContents : typeClassView
        });

        // init form with the data
        typeClassView._init({ 
          data : emptyData, 
          modal : this.modal, 
          sidenav : this.settingsNav
        });

        headingEl.addEventListener("click", () => {
          // provide the class
          this._sectionInit({ viewClass : tc })
        }, { once: true }); // just run this once
      }
    });
  }

  /* Run when project-id is set to run fetch the page content. */
  _sectionInit( {viewClass} ) {
    const formView = document.createElement( viewClass );
    console.log(viewClass);

    formView._fetchGetPromise({"id": this.projectId} )
    .then( (data) => {
      return data.json();
    }).then( (objData) => {
      this.loading.hideSpinner();

      // Pass in data interface to memberships.
      if (formView.typeName == "Membership") {
        this.membershipData = new MembershipData(this.projectId);
        formView.init(this.membershipData);
      }

      // Make media new list before we add an empty row
      if(formView.typeName == "MediaType"){
        const mediaList = new DataMediaList( this.projectId );
        mediaList._setProjectMediaList(objData, true);
      }

      // Add item containers for Types
      this.makeContainers({
        objData, 
        classBase: formView
      });

      // Add navs
      this.settingsNav._addNav({
        type : formView.typeName, 
        subItems : objData,
        subItemsOnly : true
      });

      // Add contents for each Entity
      for(let g of objData){
        let form = document.createElement(viewClass);
        if (form.typeName == "Membership") {
          form.init(this.membershipData);
        }
        this.settingsNav.fillContainer({
          type : form.typeName,
          id : g.id,
          itemContents : form
        });

        // init form with the data
        form._init({ 
          data : g, 
          modal : this.modal, 
          sidenav : this.settingsNav
        });
      }
          
    });
  }

  makeContainer({objData = {}, classBase, hidden = true}){
    // Adds item panels for each view
    this.settingsNav.addItemContainer({
      type : classBase.typeName,
      id : objData.id,
      hidden
    });
  }
  
  makeContainers({objData = {}, classBase, hidden = true}){
     for(let data of objData){
      this.makeContainer({objData : data, classBase, hidden});
    }
  }

  // Modal for this page, and handlers
  showDimmer(){
    return this.setAttribute("has-open-modal", "");
  }

  hideDimmer(){
    return this.removeAttribute("has-open-modal");
  }

}

customElements.define("project-settings", ProjectSettings);
