// The loc-in-page will be like annotation page in that...
// - sets up an image or video canvas w/ loc drawn
// - has listeners and tool controls
// But, different because
// - canvas is sized to a page, or modal sizing
// - has limited tooling available
// @TODO in progress

class LocalizationInPage extends TatorElement {
  constructor() {
    super();

    // @TODO these are here to  avoid breaking in related code
    // But should be edited  -
    // - "in panel" : no controls nec
    // - "in modal" only RESIZE tools & listeners
    //
    this._versionButton = document.createElement("version-button");
    this._versionButton.setAttribute("class", "px-2");
    this._settings = document.createElement("annotation-settings");
    this._main = document.createElement("main");
    this._versionDialog = document.createElement("version-dialog");
    this._bookmarkDialog = document.createElement("name-dialog");
    this._sidebar = document.createElement("annotation-sidebar");
    this._undo = document.createElement("undo-buffer");
    this._data = document.createElement("annotation-data");
    this._browser = document.createElement("annotation-browser");
    this._browser.undoBuffer = this._undo;
    this._browser.annotationData = this._data;
    this._versionLookup = {};

    /* Flags for if we have init the canvas yet */
    this._imageCanvasInit = false;
    //this._videoCanvasInit = false; @TODO video annotation handler

    // Medi Data get handler
    // @TODO - some of this information already available?
    this.panelData = document.createElement("annotation-panel-data");

    // Object to acquire session data
    this.savedMediaData = {};
  }

  /* Loc in Page init - Passes required object from other classes */
  init({ pageModal, modelData, panelContainer }) {
    this.pageModal = pageModal; // @TODO is this working?
    this.modelData = modelData;
    this.panelContainer = panelContainer;
    this.panelData.init(modelData);
  }

  initAndShowData({ cardObj }) {
    // Identitifier used to get the canvas' media data
    const mediaId = cardObj.mediaId;
    const locId = cardObj.id;
    const localization = cardObj.localization;

    // @TODO optimize later - only init this the first time
    if (typeof this.savedMediaData[mediaId] !== "undefined" && this.savedMediaData[mediaId] !== null) {      
      //  --> init the canvas from saved data
      let mediaData = this.savedMediaData[mediaId];
      let dtype = this.savedMediaData[mediaId].mediaTypeData.dtype;

      this._setupCanvas({dtype, mediaId, locId, mediaData, localization});

    } else {
      // --> Get mediaData and save it to this card object
      this.panelData.getMediaData(mediaId).then((mediaData) => {
        let dtype = mediaData.mediaTypeData.dtype;
        this._setupCanvas({dtype, mediaId, locId, mediaData, localization});

        // save this data in local memory until we need it again
        this.savedMediaData[mediaId] = mediaData;
      });
    }
  }

  _setupCanvas({dtype, mediaId, locId, mediaData, localization}) {
    //this._player = (dtype == "image") ? this._setupImageCanvas() : this._setupVideoCanvas();
    this._player = (dtype == "image") ? this._setupImageCanvas() : this._setupImageCanvas(); // @TODO
    this._player.addDomParent({
      "object": this.panelContainer,
      "alignTo": this._shadow 
    });

    //overwrite this draw setting
    //if(dtype == "image"){
      this._player._image._draw.setPushCallback((frameInfo) => {return this._player._image.drawAnnotations(frameInfo, null, null, locId);});
    //}
    // provide media data to canvas
    this._player.mediaType = mediaData.mediaTypeData;
    this._player.mediaInfo = mediaData.mediaInfo;
    
    // init canvas @todo these need refinement
    this._setupInitHandlers(this._player, this._data, this._undo);
    // this._getMetadataTypes({
    //     canvas : this._player, 
    //     canvasElement: this._player[`_${dtype}`]._canvas, 
    //     block_signals : null, 
    //     subelement_id : null, 
    //     update : true, 
    //     mediaId,
    //     focusLocData : localization
    //   });

    this. _getMetaDataTypesLocal({
      canvas : this._player, 
      block_signals : null, 
      update : true, 
      mediaId,
      focusLocData : localization
    });
  }

  _setupImageCanvas() {
    if(!this._imageCanvasInit){
      // First time, reset this flag
      this._imageCanvasInit = true;
    } else {
      // Next time, clear the old canvas
      this._shadow.removeChild(this._imageCanvas);
    }
    
    // Create image canvas and provide required info to it
    this._imageCanvas = document.createElement("annotation-image");
    this._imageCanvas._data = this._data;
    this._imageCanvas._undo = this._undo;
    this._shadow.appendChild(this._imageCanvas);
    
    // Show image canvas & hide Video
    this._imageCanvas.hidden = false;
    //if(this._videoCanvasInit) this._videoCanvas.hidden = true;

    return this._imageCanvas;
  }

  // _setupVideoCanvas(mediaId, data) {
  //   this._shadow.removeChild(this._videoCanvas);
  //   this._videoCanvas = document.createElement("annotation-player");
  //   this._videoCanvas._data = this._data;
  //   this._videoCanvas._undo = this._undo;
  //   this._shadow.appendChild(this._videoCanvas);

  //   // Inits image-only canvas as player
  //   this._player = this._videoCanvas;

  //   this._videoCanvas.hidden = false;
  //   this._imageCanvas.hidden = true;

  //   return this._videoCanvas;
  // }

  _popModalWithPlayer(e, modal = this.pageModal) {
    e.preventDefault();

    if (typeof modal == "undefined") this.pageModal = document.createElement("modal-dialog");

    // Title
    let text = document.createTextNode("test");
    this.pageModal._titleDiv.append(text);

    // Main Body
    this.pageModal._main.appendChild(this._shadow);

    // When we close modal, remove the player
    this.pageModal.addEventListener("close", this._removePlayer.bind(this));

    this.pageModal.setAttribute("is-open", "true")
  }

  _removePlayer() {
    // Clear this panel player and title from modal
    this.pageModal._titleDiv.innerHTML = "";
    this.pageModal._main.innerHTML = "";
  }

  _getMetaDataTypesLocal({
    canvas,
    block_signals,
    update,
    mediaId,
    focusLocData = null
  }){
    const projectId = this.modelData._project;
    this._version == null;
    const dataTypes = null;
    const focusLoc = { hasData : false }

    if(focusLocData) {
      focusLoc.hasData = true
      focusLoc.data = focusLocData
      focusLoc.typeObj = this.modelData._getLocTypeById(focusLocData.meta);

      this._data.init(dataTypes, this._version, projectId, mediaId, update, !block_signals, focusLoc);
      this._data.addEventListener("freshData", evt => {
        if (this._newEntityId) {
          for (const elem of evt.detail.data) {
            if (elem.id == this._newEntityId) {
              this._browser.selectEntity(elem);

              if (this._player.selectTimelineData) {
                this._player.selectTimelineData(elem);
              }

              this._newEntityId = null;
              break;
            }
          }
        }
      });

      //canvas.undoBuffer = this._undo;
      canvas.annotationData = this._data;
    }

    this._saves = {};
  }



  /*
     * GetMetadataTypes
     * - This is a method of annotation-page modified
     * - to work for annotation-panel (localization-in-page @TODO update this name)
     * @TODO - pass more data to optimize fetch?
    */
  _getMetadataTypes({
    canvas,
    canvasElement,
    block_signals,
    subelement_id,
    update,
    mediaId,
    focusLocData = null
  }) {
    const projectId = this.modelData._project;
    //let mediaId = Number(this.getAttribute("media-id"));
    if (subelement_id) {
      mediaId = subelement_id;
    }
    const query = "?media_id=" + mediaId;

    // @TODO favorites seem N/A here
    const favoritePromise = fetch("/rest/Favorites/" + projectId, {
      method: "GET",
      credentials: "same-origin",
      headers: {
        "X-CSRFToken": getCookie("csrftoken"),
        "Accept": "application/json",
        "Content-Type": "application/json"
      }
    });

    // @TODO versions only applicable "in modal"
    const versionPromise = fetch("/rest/Versions/" + projectId + "?media_id=" + mediaId, {
      method: "GET",
      credentials: "same-origin",
      headers: {
        "X-CSRFToken": getCookie("csrftoken"),
        "Accept": "application/json",
        "Content-Type": "application/json"
      }
    });

    // Permissions
    const membershipPromise = fetch(`/rest/Memberships/${projectId}`, {
      method: "GET",
      credentials: "same-origin",
      headers: {
        "X-CSRFToken": getCookie("csrftoken"),
        "Accept": "application/json",
        "Content-Type": "application/json"
      }
    });

    const getMetadataType = endpoint => {
      const url = "/rest/" + endpoint + "/" + projectId + query;
      return fetch(url, {
        method: "GET",
        credentials: "same-origin",
        headers: {
          "X-CSRFToken": getCookie("csrftoken"),
          "Accept": "application/json",
          "Content-Type": "application/json"
        }
      });
    };



    Promise.all([
      getMetadataType("LocalizationTypes"),
      getMetadataType("StateTypes"),
      versionPromise,
      favoritePromise,
      membershipPromise,
    ])
      .then(([localizationResponse, stateResponse, versionResponse, favoriteResponse,
        membershipResponse]) => {
        const localizationData = localizationResponse.json();
        const stateData = stateResponse.json();
        const versionData = versionResponse.json();
        const favoriteData = favoriteResponse.json();
        const membershipData = membershipResponse.json();
        Promise.all([localizationData, stateData, versionData, favoriteData, membershipData])
          .then(([localizationTypes, stateTypes, versions, favorites, memberships]) => {
            // Only display positive version numbers.
            versions = versions.filter(version => version.number >= 0);


            console.log("Localization Types");
            console.log(localizationTypes);
            console.log(this.modelData._localizationTypes);

            // @TODO - versions
            for (const version of versions) {
              this._versionLookup[version.id] = version;
            }

            // If there is a default version pick that one, otherwise use the first one.
            this._version == null;
            let default_version = versions[0].id;
            for (const membership of memberships) {
              if (membership.user == this.getAttribute("user-id")) {
                if (membership.default_version) {
                  default_version = membership.default_version;
                }
              }
            }

            // Finde the index of the default version.
            let selected_version_idx = 0;
            for (const [idx, version] of versions.entries()) {
              if (version.id == default_version) {
                this._version = this._versionLookup[default_version];
                selected_version_idx = idx;
              }
            }

            // Initialize version dialog.
            this._versionDialog.init(versions, selected_version_idx);
            if (versions.length == 0) {
              this._versionButton.style.display = "none";
            } else {
              this._versionButton.text = this._version.name;
            }

            var dataTypes = localizationTypes.concat(stateTypes)

            // Replace the data type IDs so they are guaranteed to be unique.
            for (let [idx, dataType] of dataTypes.entries()) {
              dataType.id = dataType.dtype + "_" + dataType.id;
              let isLocalization = false;
              let isTrack = false;
              let isTLState = false;
              if ("dtype" in dataType) {
                isLocalization = ["box", "line", "dot"].includes(dataType.dtype);
              }
              if ("association" in dataType) {
                isTrack = (dataType.association == "Localization");
              }
              if ("interpolation" in dataType) {
                isTLState = (dataType.interpolation == "latest");
              }
              dataType.isLocalization = isLocalization;
              dataType.isTrack = isTrack;
              dataType.isTLState = isTLState;
            }

            this._data.init(dataTypes, this._version, projectId, mediaId, update, !block_signals);
            this._data.addEventListener("freshData", evt => {
              if (this._newEntityId) {
                for (const elem of evt.detail.data) {
                  if (elem.id == this._newEntityId) {
                    this._browser.selectEntity(elem);

                    if (this._player.selectTimelineData) {
                      this._player.selectTimelineData(elem);
                    }

                    this._newEntityId = null;
                    break;
                  }
                }
              }
            });
            this._mediaDataCount += 1;

            // Pull the data / iniitliaze the app if we are using the multi-view player and
            // if all of the media has already registered their data types
            if (this._mediaDataCount == this._numberOfMedia && this._player.mediaType.dtype == "multi") {
              this._data.initialUpdate();
            }

            canvas.undoBuffer = this._undo;
            canvas.annotationData = this._data;
            const byType = localizationTypes.reduce((sec, obj) => {
              (sec[obj.dtype] = sec[obj.dtype] || []).push(obj);
              return sec;
            }, {});

            if (block_signals == true) {
              return;
            }

            // For states specifically, if we are using the multi-view, we will
            // create the state across all media
            var stateMediaIds;
            if (this._player.mediaType.dtype == "multi") {
              stateMediaIds = this._mediaIds;
            }

            //this._browser.init(dataTypes, this._version, stateMediaIds, this._player.mediaType.dtype != "image");

            // this._sidebar.localizationTypes = byType;
            // this._sidebar.addEventListener("default", evt => {
            //   this.clearMetaCaches();
            //   canvas.defaultMode();
            // });
            // this._sidebar.addEventListener("newMeta", evt => {
            //   this.clearMetaCaches();
            //   canvas.newMetadataItem(evt.detail.typeId, evt.detail.metaMode);
            // });
            // this._sidebar.addEventListener("zoomIn", evt => {
            //   canvas.zoomIn();
            // });
            // this._sidebar.addEventListener("zoomOut", evt => {
            //   canvas.zoomOut();
            // });
            // this._sidebar.addEventListener("pan", evt => {
            //   canvas.pan();
            // });
            canvas.addEventListener("drawComplete", (evt) => {
              if (evt.detail.metaMode == false) {
                this._sidebar.selectDefault();
              }
              this._browser.blur();
            });
            canvas.addEventListener("frameChange", evt => {
              this._browser.frameChange(evt.detail.frame);
              this._settings.setAttribute("frame", evt.detail.frame);
            });
            canvas.addEventListener("select", evt => {
              this._browser.selectEntity(evt.detail);
              //this._settings.setAttribute("entity-id", evt.detail.id);
              //this._settings.setAttribute("entity-type", evt.detail.meta);
              //this._settings.setAttribute("type-id", evt.detail.meta);
            });
            this._undo.addEventListener("update", evt => {

              // Force selecting this new entity in the browser if a new object was created
              // when the data is retrieved (ie freshData event)
              if (evt.detail.method == "POST") {
                this._newEntityId = evt.detail.id;
              }

              this._data.updateTypeLocal(
                evt.detail.method,
                evt.detail.id,
                evt.detail.body,
                evt.detail.dataType,
              );
            });
            // this._browser.addEventListener("select", evt => {
            //   if (evt.detail.byUser) {
            //     if (evt.detail.dataType.isLocalization) {
            //       // @TODO select localization handler
            //       console.log(evt.detail.data);
            //       canvas.selectLocalization(evt.detail.data, false, false, !evt.detail.goToEntityFrame);
            //     } else if (evt.detail.dataType.isTrack) {
            //       // select track takes care of frame jump
            //       canvas.selectTrack(evt.detail.data, undefined, !evt.detail.goToEntityFrame);
            //     }
            //     else if ('frame' in evt.detail.data) {
            //       if (evt.detail.goToEntityFrame) {
            //         canvas.goToFrame(parseInt(evt.detail.data.frame));
            //       }
            //     }

            //     if (this._player.selectTimelineData) {
            //       this._player.selectTimelineData(evt.detail.data);
            //     }

            //     if (this._player.mediaType.dtype == "multi") {
            //       if (evt.detail.goToEntityFrame) {
            //         this._player.goToFrame(evt.detail.data.frame);
            //       }
            //     }
            //   }
            //   this._settings.setAttribute("entity-id", evt.detail.data.id);
            //   this._settings.setAttribute("entity-type", evt.detail.data.meta);
            //   this._settings.setAttribute("type-id", evt.detail.data.meta);
            // });
            // this._browser.addEventListener("capture", evt => {
            //   if ('_video' in canvas) {
            //     canvas._video.makeDownloadableLocalization(evt.detail.data);
            //   }
            //   else {
            //     canvas._image.makeDownloadableLocalization(evt.detail.data);
            //   }
            // });
            // this._browser.addEventListener("open", evt => {
            //   if ("drawTimeline" in canvas) {
            //     canvas.drawTimeline(evt.detail.typeId);
            //   }
            //   this._settings.setAttribute("type-id", evt.detail.typeId);
            // });
            // this._browser.addEventListener("close", evt => {
            //   this._settings.removeAttribute("type-id");

            //   // The canvas can either be the annotation player or image. The player is the only
            //   // annotation that has the concepts of tracks, so the following check is performed.
            //   if (typeof canvas.deselectTrack === "function") {
            //     canvas.deselectTrack();
            //   }
            //   canvas.selectNone();
            // });
            // this._browser.addEventListener("frameChange", evt => {
            //   if ('track' in evt.detail) {
            //     canvas.selectTrack(evt.detail.track, evt.detail.frame);
            //   }
            //   else {
            //     canvas.goToFrame(evt.detail.frame);
            //   }
            // });
            // this._browser.addEventListener("patchMeta", evt => {
            //   this.clearMetaCaches();
            //   canvas.newMetadataItem(evt.detail.typeId, false, evt.detail.obj);
            // });
            this._saves = {};

            // for (const dataType of localizationTypes) {
            //   const save = document.createElement("save-dialog");
            //   save.init(projectId, mediaId, dataType, this._undo, this._version, favorites);
            //   this._settings.setAttribute("version", this._version.id);
            //   this._main.appendChild(save);
            //   this._saves[dataType.id] = save;

            //   save.addEventListener("cancel", () => {
            //     this._closeModal(save);
            //     canvas.refresh();
            //   });

            //   save.addEventListener("save", () => {
            //     this._closeModal(save);
            //   });
            // }

            // for (const dataType of stateTypes) {
            //   const save = document.createElement("save-dialog");
            //   save.init(projectId, mediaId, dataType, this._undo, this._version, favorites);
            //   this._settings.setAttribute("version", this._version.id);
            //   this._main.appendChild(save);
            //   this._saves[dataType.id] = save;

            //   // For states specifically, if we are using the multi-view, we will
            //   // create the state across all media
            //   if (this._player.mediaType.dtype == "multi") {
            //     save.stateMediaIds = this._mediaIds;
            //   }

            //   save.addEventListener("cancel", () => {
            //     this._closeModal(save);
            //     canvas.refresh();
            //   });

            //   save.addEventListener("save", () => {
            //     this._closeModal(save);
            //   });
            // }

            // canvas.addEventListener("create", evt => {
            //   const metaMode = evt.detail.metaMode;
            //   const objDescription = evt.detail.objDescription;
            //   const dragInfo = evt.detail.dragInfo;
            //   const requestObj = evt.detail.requestObj;
            //   const canvasPosition = evt.detail.canvasElement.getBoundingClientRect();

            //   // Get the save dialog for this type. It gets created
            //   // with a metamode flag that changes based on mode. If
            //   // it has been created once in a given meta mode, reuse
            //   // the attributes from previous runs.
            //   // (Fixes Pulse #324572460)
            //   var save = this._getSave(objDescription);
            //   // Because we can be annotating multiple media_ids, set the dialog save
            //   // to the id the draw event came from
            //   save._mediaId = evt.detail.mediaId;
            //   if (metaMode && save.metaMode) {
            //     save.saveObject(requestObj, save.metaCache);
            //   }
            //   else {
            //     this._openModal(objDescription, dragInfo, canvasPosition,
            //       requestObj, metaMode);
            //     this._makePreview(objDescription, dragInfo, canvasPosition);
            //   }
            // });

            //this._setupContextMenuDialogs(canvas, canvasElement, stateTypes);

            // canvas.addEventListener("maximize", () => {
            //   this._browser.style.display = "none";
            // });

            // canvas.addEventListener("minimize", () => {
            //   this._browser.style.display = "block";
            // });
          });
      });
  }

  _setupInitHandlers(canvas, annotationData, undo) {
    this._canvas = canvas;
    this._data = annotationData;
    this._undo = undo;

    // const _handleQueryParams = () => {
    //   if (this._dataInitialized && this._canvasInitialized) {
    //     const searchParams = new URLSearchParams(window.location.search);
    //     const haveEntity = searchParams.has("selected_entity");
    //     const haveEntityType = searchParams.has("selected_entity_type");
    //     const haveType = searchParams.has("selected_type");
    //     const haveFrame = searchParams.has("frame");
    //     const haveVersion = searchParams.has("version");
    //     const haveLock = searchParams.has("lock");
    //     const haveFillBoxes = searchParams.has("fill_boxes");
    //     const haveToggleText = searchParams.has("toggle_text");
    //     const haveDisplayFrame = searchParams.has("display_frame");
    //     if (haveEntity && haveEntityType) {
    //       const typeId = Number(searchParams.get("selected_entity_type"));
    //       const entityId = Number(searchParams.get("selected_entity"));
    //       //this._settings.setAttribute("entity-type", typeId);
    //       //this._settings.setAttribute("entity-id", entityId);
    //       for (const dtype of ['state', 'box', 'line', 'dot']) {
    //         let modifiedTypeId = dtype + "_" + typeId;
    //         if (this._data._dataByType.has(modifiedTypeId)) {
    //           const data = this._data._dataByType.get(modifiedTypeId);
    //           for (const elem of data) {
    //             if (elem.id == entityId) {
    //               this._browser.selectEntity(elem);
    //               break;
    //             }
    //           }
    //         }
    //       }
    //     } else if (haveType) {
    //       const typeId = Number(searchParams.get("selected_type"));
    //       //this._settings.setAttribute("type-id", typeId);
    //       for (const dtype of ['state', 'box', 'line', 'dot']) {
    //         let modifiedTypeId = dtype + "_" + typeId;
    //         if (this._data._dataByType.has(modifiedTypeId)) {
    //           this._browser._openForTypeId(modifiedTypeId);
    //         }
    //       }
    //     }
    //     if (haveVersion) {
    //       let version_id = searchParams.get("version");
    //       let evt = { "detail": { "version": this._versionLookup[version_id] } };
    //       this._versionDialog._handleSelect(evt);
    //     }
    //     if (haveLock) {
    //       const lock = Number(searchParams.get("lock"));
    //       if (lock) {
    //         //this._settings._lock.lock();
    //       }
    //     }
    //     if (haveFillBoxes) {
    //       const fill_boxes = Number(searchParams.get("fill_boxes"));
    //       if (fill_boxes) {
    //         //this._settings._fill_boxes.fill();
    //       }
    //       else {
    //         this._settings._fill_boxes.unfill();
    //       }
    //       canvas.toggleBoxFills(this._settings._fill_boxes.get_fill_boxes_status());
    //     }
    //     if (haveToggleText) {
    //       const toggle_text = Number(searchParams.get("toggle_text"));
    //       if (toggle_text) {
    //         // this._settings._toggle_text.toggle = true;
    //       }
    //       else {
    //         // this._settings._toggle_text.toggle = false
    //       }
    //       //canvas.toggleTextOverlays(this._settings._toggle_text.get_toggle_status());
    //     }
    //     if (haveDisplayFrame) {
    //       const display_frame = Number(searchParams.get("display_frame"));
    //       if (display_frame) {
    //         if (typeof canvas.enableDisplayFrame != undefined) {
    //           canvas.enableDisplayFrame();
    //         }
    //       }
    //     }
    //   }
    // }

    const _removeLoading = () => {
      if (this._dataInitialized && this._canvasInitialized) {
        try {
          this._loading.style.display = "none";
          this.removeAttribute("has-open-modal");
          window.dispatchEvent(new Event("resize"));
        }
        catch (exception) {
          //pass
        }
      }
    }

    this._data.addEventListener("initialized", () => {
      this._dataInitialized = true;
      //_handleQueryParams();
      _removeLoading();
    });


    let maskEdits = (evt) => {
      this.enableEditing(!evt.detail.enabled);
      console.info("Setting edit mask to " + evt.detail.enabled);
    };
    // Disable edits via the player + annotation browser
    // only during a network operation
    canvas.addEventListener("temporarilyMaskEdits", maskEdits);
    this._undo.addEventListener("temporarilyMaskEdits", maskEdits);


    canvas.addEventListener("displayLoading", () => {
      // #TODO Revisit. has-open-modal is too aggressive
      //this.setAttribute("has-open-modal", "");
    });
    canvas.addEventListener("hideLoading", () => {
      // #TODO Revisit. has-open-modal is too aggressive
      //this.removeAttribute("has-open-modal");
    });

    // canvas.addEventListener("playing", () => {
    //   this._settings.disableRateChange();
    //   this._settings.disableQualityChange();
    // });
    // canvas.addEventListener("paused", () => {
    //   this._settings.enableRateChange();
    //   this._settings.enableQualityChange();
    // });

    canvas.addEventListener("canvasReady", () => {
      this._canvasInitialized = true;
      //_handleQueryParams();
      _removeLoading();
    });

    // this._settings._lock.addEventListener("click", evt=> {
    //   this.enableEditing(true);
    // });

    // this._settings._fill_boxes.addEventListener("click", evt => {
    //   canvas.toggleBoxFills(this._settings._fill_boxes.get_fill_boxes_status());
    //   canvas.refresh();
    // })

    // this._settings._toggle_text.addEventListener("click", evt => {
    //   canvas.toggleTextOverlays(this._settings._toggle_text.get_toggle_status());
    //   canvas.refresh();
    // })

    // this._settings.addEventListener("rateChange", evt => {
    //   if ("setRate" in canvas) {
    //     canvas.setRate(evt.detail.rate);
    //   }
    // });

    // this._settings.addEventListener("qualityChange", evt => {
    //   if ("setQuality" in canvas) {
    //     canvas.setQuality(evt.detail.quality);
    //   }
    // });

    // canvas.addEventListener("zoomChange", evt => {
    //   this._settings.setAttribute("zoom", evt.detail.zoom);
    // });

    // this._settings.addEventListener("zoomPlus", () => {
    //   if ("zoomPlus" in canvas) {
    //     canvas.zoomPlus();
    //   }
    // });

    // this._settings.addEventListener("zoomMinus", () => {
    //   if ("zoomMinus" in canvas) {
    //     canvas.zoomMinus();
    //   }
    // });

    // this._versionDialog.addEventListener("close", evt => {
    //   this.removeAttribute("has-open-modal", "");
    // });

    // this._versionDialog.addEventListener("versionSelect", evt => {
    //   this._data.setVersion(evt.detail.version).then(() => {
    //     this._settings.setAttribute("version", evt.detail.version.id);
    //     this._canvas.refresh();
    //   });
    //   this._browser.version = evt.detail.version;
    //   this._versionButton.text = evt.detail.version.name;
    //   this._version = evt.detail.version;
    //   for (const key in this._saves) {
    //     this._saves[key].version = this._version;
    //   }
    //   this.enableEditing();
    // });

    // this._versionButton.addEventListener("click", () => {
    //   this._versionDialog.setAttribute("is-open", "");
    //   this.setAttribute("has-open-modal", "");
    // });

    // this._bookmarkDialog.addEventListener("close", evt => {
    //   if (this._bookmarkDialog._confirm) {
    //     const searchParams = new URLSearchParams(window.location.search);
    //     let uri = window.location.pathname;
    //     uri += "?" + this._settings._queryParams(searchParams).toString();
    //     const name = this._bookmarkDialog._input.value;
    //     fetch("/rest/Bookmarks/" + this.getAttribute("project-id"), {
    //       method: "POST",
    //       credentials: "same-origin",
    //       headers: {
    //         "X-CSRFToken": getCookie("csrftoken"),
    //         "Accept": "application/json",
    //         "Content-Type": "application/json"
    //       },
    //       body: JSON.stringify({
    //         name: name,
    //         uri: uri,
    //       }),
    //     });
    //   }
    //   this.removeAttribute("has-open-modal", "");
    // });
  }

  

}
customElements.define("localization-in-page", LocalizationInPage);