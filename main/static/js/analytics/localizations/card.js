class AnnotationsCard extends EntityCard {
  constructor() {
    super();


    // Add annotation class to list item
    this._li.classList.add("analysis__annotation");
    this.addEventListener("click", this.togglePanel.bind(this) );


    //@TODO pausing on hover behavior -- needs work w/ canvas
    //this.addEventListener("mouseenter", this._mouseEnterHandler.bind(this) );

    // prep this var
    this._tmpHidden = null;
  }
  

  init({obj, panelContainer, annotationPanelDiv}){
    // ID is title
    //this.titleDiv.innerHTML = `ID ${obj.id}`;
    this._id_text.innerHTML = `ID: ${obj.id}`;

    // Give card access to panel
    this.panelContainer = panelContainer;
    this.annotationPanelDiv = annotationPanelDiv;
    this.cardObj = obj;

    // Additional information about localization
    // Name and type like "ABOX (Box)"
    //this.typeInfo = document.createElement('div');
    //this.typeInfo.innerHTML = `${obj.localizationType.name} (${obj.localizationType.type})`;
    //this.titleDiv.appendChild(this.typeInfo);


    // Graphic
    if(typeof obj.graphic !== "undefined" && obj.graphic !== null) {
      this.reader = new FileReader();
      this.reader.readAsDataURL(obj.graphic); // converts the blob to base64
      this.reader.addEventListener("load", this._setImgSrc.bind(this));
    }
    else {
      this.setAttribute("thumb", "/static/images/spinner-transparent.svg");
    }

    // Add position text related to pagination
    this.setAttribute("pos-text", obj.posText);

    // Link to the media @TODO
    // this.mediaLink = document.createElement('div');
    // this.mediaLink.innerHTML = `Media ID ${obj.mediaLink}`;
    // this.descDiv.appendChild(this.mediaLink);

    // Display the first 0 order attribute value
    this.displayAttributes();

    /*
    this.attributesDiv = document.createElement('div');
    let i = 0;
    for(const [attr, value] of Object.entries(obj.attributes)){
      let attrDiv = document.createElement("div");
      attrDiv.setAttribute("class", `card-attribute ${encodeURI(obj.localizationType.name)}_${encodeURI(attr)}`)
      if(i != 0) attrDiv.classList.add("hidden")
      i++;
      let attrLabel = document.createElement("span");
      attrLabel.appendChild( document.createTextNode(`${attr}: `) );
      attrLabel.setAttribute("class", "text-bold f3");
      attrDiv.appendChild(attrLabel);

      let attribute = document.createTextNode(value);
      attrDiv.appendChild(attribute);

      this.attributesDiv.appendChild(attrDiv);
    }
    this.descDiv.appendChild(this.attributesDiv);
    */

    // // Create Date
    // this.created = document.createElement('div');
    // this.created.innerHTML = `Created: ${obj.created}`;
    // this.descDiv.appendChild(this.created);

    // // Modified Date
    // this.modified = document.createElement('div');
    // this.modified.innerHTML = `Modified: ${obj.modified}`;
    // this.descDiv.appendChild(this.modified);

    // // Modified By
    // this.modifiedby = document.createElement('div');
    // this.modifiedby.innerHTML = `By: ${obj.userName}`;
    // this.descDiv.appendChild(this.modifiedby);

    // Show description div
    this.descDiv.hidden = false;

    // More actions
    // this._more.hidden = false;
    // Add more ... > labels, swap views?
  }

  displayAttributes() {
    this.setAttribute("name", "");
    for (let attrType of this.cardObj.entityType.attribute_types) {
      if (attrType.order == 0) {
        if (this.cardObj.attributes[attrType.name] != undefined) {
          this._name.textContent = this.cardObj.attributes[attrType.name];
        }
        break;
      }
    }
  }

  /**
   * Set the card's main image thumbnail
   * @param {image} image
   */
  setImage(image) {
    this.reader = new FileReader();
    this.reader.readAsDataURL(image); // converts the blob to base64
    this.reader.addEventListener("load", this._setImgSrc.bind(this));
  }

  _setImgSrc (e) {
    this.setAttribute("thumb", this.reader.result);
  }

  _mouseEnterHandler(e){
    const isHidden = this.annotationPanelDiv.classList.contains("hidden");
    const isSelected = this.annotationPanelDiv.classList.contains("is-selected");
    if(isHidden && !isSelected) {
      //console.log(`Previewing: ${this.annotationPanelDiv.dataset.locId}`);

      // If we do not already have this open or selected... show a preview
      this._showPreview();

      // Wait for mouse out to stop preview
      const once = { once : true };
      this.addEventListener("mouseout", this._removePreview.bind(this), once );
    }
  }

  _showPreview() {

    // this._tmpHidden is null here prob bc of event scope
    const isSelected = this.panelContainer._shadow.querySelector(".is-selected");

    // Tmp Hide open panels (if it isn't the one we are on)
    if(typeof isSelected !== "undefined" && isSelected !== null && isSelected !== this.annotationPanelDiv) {
      this._tmpHidden = isSelected;
      this._tmpHidden.classList.add("hidden");
    }

    // Annotation event is listened to by the top panel and changes canvas
    this.annotationEvent("preview-annotation-start");

    // Show this panel
    //this.annotationPanelDiv.classList.remove("hidden");
    this.annotationPanelDiv.classList.add("preview");
  }

  _removePreview(e) {
    // Hide this panel
    //this.annotationPanelDiv.classList.add("hidden");
    this.annotationPanelDiv.classList.remove("preview");
    this.annotationEvent("preview-annotation-stop");

    // Restore the hidden panel
    if(typeof this._tmpHidden !== "undefined" && this._tmpHidden !== null) this._tmpHidden.classList.remove("hidden");

  }

  togglePanel(e){
    e.preventDefault();
    //console.log(`Opening: ${this.annotationPanelDiv.dataset.locId}`);
    // If they click while in preview, don't do this
    // const isInPreview = this.annotationPanelDiv.classList.contains("preview");
    // if(isInPreview) {
    //   const once = { once : true };
    //   this.removeEventListener("mouseout", this._removePreview.bind(this), once );
    // }

    if(this._li.classList.contains("is-selected")) {
      // const isInPreview = this.annotationPanelDiv.classList.contains("preview");
      // If we already have this open, toggle shut
      this._deselectedCardAndPanel();
     

    } else {
      // Hide open panels
      this._hideOpenPanel();

      // Show this content
      this._selectedCardAndPanel();
    }
  }

  _hideOpenPanel(){
    // this._tmpHidden is null here prob bc of event scope
    const openPanel = this.panelContainer._shadow.querySelector(".is-selected");
    
    // if it exists, close it!
    if(openPanel !== null) {
      openPanel.classList.add("hidden");
      openPanel.classList.remove("is-selected");
          
      let unselectedEvent = new CustomEvent("unselected");
      openPanel.dispatchEvent( unselectedEvent ); // this even unselected related card
    }
  }

  _deselectedCardAndPanel(){
    this.cardClickEvent(false);
    
    this._li.classList.remove("is-selected");
    
    this.annotationPanelDiv.classList.add("hidden");
    this.annotationPanelDiv.classList.remove("preview");
    this.annotationPanelDiv.classList.remove("is-selected");
    
    // Send event to panel to show this localization
    this.annotationEvent("hide-annotation");

    //Add back listener @TODO pausing on hover behavior -- needs work w/ canvas
    //this.addEventListener("mouseenter", this._mouseEnterHandler.bind(this) );

  }

  _selectedCardAndPanel(){
    this.cardClickEvent(true);

    // Send event to panel to show this localization
    this.annotationEvent("open-annotation");

    // Set appropriate classes on card + panel div
    this._li.classList.add("is-selected");
    this.annotationPanelDiv.classList.add("is-selected");
    this.annotationPanelDiv.classList.remove("hidden");
    this.annotationPanelDiv.classList.remove("preview");

    //remove preview listener
    this.removeEventListener("mouseenter", this._mouseEnterHandler.bind(this) );
  }

  cardClickEvent(openFlag = false){
    /* @ "card-click"*/
    //console.log("Card click event triggered (from card.js)");
    // Send event to panel to hide the localization canvas & title
    let cardClickEvent = new CustomEvent("card-click", { detail : { openFlag, cardObj : this.cardObj } });
    this.dispatchEvent( cardClickEvent );
  }

  annotationEvent(evtName){
    // Send event to panel to hide the localization
    let annotationEvent = new CustomEvent(evtName, { detail : { cardObj : this.cardObj } });
    this.panelContainer.dispatchEvent( annotationEvent );
  }

}

customElements.define("annotations-card", AnnotationsCard);
