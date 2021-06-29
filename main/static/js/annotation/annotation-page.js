class AnnotationPage extends TatorPage {
  constructor() {
    super();
    this._loading = document.createElement("img");
    this._loading.setAttribute("class", "loading");
    this._loading.setAttribute("src", "/static/images/tator_loading.gif");
    this._shadow.appendChild(this._loading);
    this._versionLookup = {};

    document.body.setAttribute("class", "no-padding-bottom");

    const header = document.createElement("div");
    this._headerDiv = this._header._shadow.querySelector("header");
    header.setAttribute("class", "annotation__header d-flex flex-items-center flex-justify-between px-2 f3");
    const user = this._header._shadow.querySelector("header-user");
    user.parentNode.insertBefore(header, user);

    const div = document.createElement("div");
    div.setAttribute("class", "d-flex flex-items-center");
    header.appendChild(div);

    this._prev = document.createElement("media-prev-button");
    div.appendChild(this._prev);

    this._next = document.createElement("media-next-button");
    div.appendChild(this._next);

    this._breadcrumbs = document.createElement("annotation-breadcrumbs");
    div.appendChild(this._breadcrumbs);

    const settingsDiv = document.createElement("div");
    settingsDiv.setAttribute("class", "d-flex");
    header.appendChild(settingsDiv);

    this._versionButton = document.createElement("version-button");
    settingsDiv.appendChild(this._versionButton);

    this._settings = document.createElement("annotation-settings");
    settingsDiv.appendChild(this._settings);

    this._main = document.createElement("main");
    this._main.setAttribute("class", "d-flex");
    this._shadow.appendChild(this._main);

    this._versionDialog = document.createElement("version-dialog");
    this._main.appendChild(this._versionDialog);

    this._bookmarkDialog = document.createElement("name-dialog");
    this._main.appendChild(this._bookmarkDialog);

    this._sidebar = document.createElement("annotation-sidebar");
    this._main.appendChild(this._sidebar);

    this._undo = document.createElement("undo-buffer");

    this._data = document.createElement("annotation-data");

    this._browser = document.createElement("annotation-browser");
    this._browser.undoBuffer = this._undo;
    this._browser.annotationData = this._data;
    this._main.appendChild(this._browser);

    this._progressDialog = document.createElement("progress-dialog");
    this._main.appendChild(this._progressDialog);

    this._progressDialog.addEventListener("close", evt => {
      this.removeAttribute("has-open-modal", "");
      this._progressDialog.removeAttribute("is-open", "");
    });

    window.addEventListener("error", (evt) => {
      this._loading.style.display = "none";
      window.alert("System error detected");
      Utilities.warningAlert("System error detected","#ff3e1d", true);
    });

    this._settings._bookmark.addEventListener("click", () => {
      this._bookmarkDialog.setAttribute("is-open", "");
      this.setAttribute("has-open-modal", "");
      document.body.classList.add("shortcuts-disabled");
    });

    this._videoSettingsDialog = document.createElement("video-settings-dialog");
    this._main.appendChild(this._videoSettingsDialog);
  }

  /**
   * Returned promise resolves when job monitoring is done
   */
  showAlgoRunningDialog(uid, runningMsg, successfulMsg, failedMsg) {
    const promise = this._progressDialog.monitorJob(uid, runningMsg, successfulMsg, failedMsg);
    this._progressDialog.setAttribute("is-open", "");
    this.setAttribute("has-open-modal", "");
    return promise;
  };

  static get observedAttributes() {
    return ["project-name", "project-id", "media-id"].concat(TatorPage.observedAttributes);
  }

  connectedCallback() {
    this.setAttribute("has-open-modal", "");
    TatorPage.prototype.connectedCallback.call(this);
  }

  attributeChangedCallback(name, oldValue, newValue) {
    TatorPage.prototype.attributeChangedCallback.call(this, name, oldValue, newValue);
    switch (name) {
      case "project-name":
        this._breadcrumbs.setAttribute("project-name", newValue);
        break;
      case "project-id":
        this._undo.setAttribute("project-id", newValue);
        this._updateLastVisitedBookmark();
        break;
      case "media-id":
        const searchParams = new URLSearchParams(window.location.search);
        fetch(`/rest/Media/${newValue}?presigned=28800`, {
          method: "GET",
          credentials: "same-origin",
          headers: {
            "X-CSRFToken": getCookie("csrftoken"),
            "Accept": "application/json",
            "Content-Type": "application/json"
          }
        })
        .then(response => response.json())
        .then(data => {
          if (data.media_files == null ||
              (data.media_files &&
               !('streaming' in data.media_files) &&
               !('layout' in data.media_files) &&
               !('image' in data.media_files) &&
               !('live' in data.media_files)))
          {
            this._loading.style.display = "none";
            Utilities.sendNotification(`Unplayable file ${data.id}`);
            window.alert("Video can not be played. Please contact the system administrator.")
            return;
          } else if (data.media_files && 'streaming' in data.media_files) {
            data.media_files.streaming.sort((a, b) => {return b.resolution[0] - a.resolution[0];});
          }
          this._breadcrumbs.setAttribute("media-name", data.name);
          this._browser.mediaInfo = data;
          this._undo.mediaInfo = data;

          fetch("/rest/MediaType/" + data.meta, {
            method: "GET",
            credentials: "same-origin",
            headers: {
              "X-CSRFToken": getCookie("csrftoken"),
              "Accept": "application/json",
              "Content-Type": "application/json"
            }
          })
          .then((response) => response.json())
          .then(type_data => {
            this._browser.mediaType = type_data;
            this._undo.mediaType = type_data;
            let player;
            this._mediaIds = [];
            this._numberOfMedia = 1;
            this._mediaDataCount = 0;
            if (type_data.dtype == "video") {
              player = document.createElement("annotation-player");
              this._player = player;
              this._player.mediaType = type_data;
              player.addDomParent({"object": this._headerDiv,
                                   "alignTo":  this._browser});
              player.mediaInfo = data;
              this._main.insertBefore(player, this._browser);
              this._setupInitHandlers(player);
              this._getMetadataTypes(player, player._video._canvas);
              this._browser.canvas = player._video;
              this._videoSettingsDialog.mode("single", [data]);
              this._settings._capture.addEventListener(
                'captureFrame',
                (e) =>
                  {
                    player._video.captureFrame(e.detail.localizations);
                  });
              this._videoSettingsDialog.addEventListener("apply", (evt) => {
                player.apply
              });
            } else if (type_data.dtype == "image" ){
              player = document.createElement("annotation-image");
              this._player = player;
              this._player.mediaType = type_data;
              //player.style.minWidth="63%";
              player.addDomParent({"object": this._headerDiv,
                                   "alignTo":  this._browser});
              player.mediaInfo = data;
              this._main.insertBefore(player, this._browser);
              this._setupInitHandlers(player);
              this._getMetadataTypes(player, player._image._canvas);
              this._browser.canvas = player._image;
              this._settings._capture.addEventListener(
                'captureFrame',
                (e) =>
                  {
                    player._image.captureFrame(e.detail.localizations);
                  });
            } else if (type_data.dtype == "multi") {
              player = document.createElement("annotation-multi");
              this._player = player;
              this._player.parent = this;
              this._player.mediaType = type_data;
              player.addDomParent({"object": this._headerDiv,
                                   "alignTo":  this._browser});

              // Note: The player itself will set the metadatatypes and canvas info with this
              player.mediaInfo = data;
              this._main.insertBefore(player, this._browser);
              this._setupInitHandlers(player);
              this._player.addEventListener(
                "primaryVideoLoaded", () => {

                  var mediaIdCount = 0;
                  for (const index of data.media_files.ids.keys()) {
                    this._mediaIds.push(data.media_files.ids[index]);
                    mediaIdCount += 1;
                  }
                  this._numberOfMedia = mediaIdCount;
                  /* #TODO Figure out a capture frame capability for multiview
                  this._settings._capture.addEventListener(
                    'captureFrame',
                    (e) =>
                      {
                        player._video.captureFrame(e.detail.localizations);
                      });
                  */
                  this._settings._capture.setAttribute("disabled", "");

                  // Set the quality control based on the prime video
                  fetch(`/rest/Media/${this._mediaIds[0]}?presigned=28800`, {
                    method: "GET",
                    credentials: "same-origin",
                    headers: {
                      "X-CSRFToken": getCookie("csrftoken"),
                      "Accept": "application/json",
                      "Content-Type": "application/json"
                    }
                  })
                  .then(response => response.json())
                  .then(primeMediaData => {
                    this._videoSettingsDialog.mode("multiview", [primeMediaData]);
                    this._settings.mediaInfo = primeMediaData;
                    var playbackQuality = data.media_files.quality;
                    if (playbackQuality == undefined)
                    {
                      playbackQuality = 360; // Default to something sensible
                    }
                    if (searchParams.has("quality"))
                    {
                      playbackQuality = Number(searchParams.get("quality"));
                    }
                    this._settings.quality = playbackQuality;
                    this._player.setQuality(playbackQuality, null, true);
                    this._player.setAvailableQualities(primeMediaData);
                  });
                }
              );
            } else if (type_data.dtype == "live") {
              player = document.createElement("annotation-live");
              this._player = player;
              this._player.mediaType = type_data;
              player.addDomParent({"object": this._headerDiv,
                                   "alignTo":  this._browser});
              this._setupInitHandlers(player);
              player.mediaInfo = data;
              this._main.insertBefore(player, this._browser);

              for (let live of player._videos)
              {
                this._getMetadataTypes(player, live._canvas);
              }
              //this._browser.canvas = player._video;
              this._videoSettingsDialog.mode("live", [data]);
              this._settings._capture.addEventListener(
                'captureFrame',
                (e) =>
                  {
                    player._video.captureFrame(e.detail.localizations);
                  });
              this._videoSettingsDialog.addEventListener("apply", (evt) => {
                player.apply
              });
              } else {
              window.alert(`Unknown media type ${type_data.dtype}`)
            }
          });
          const nextPromise = fetch(`/rest/MediaNext/${newValue}${window.location.search}`, {
            method: "GET",
            headers: {
              "X-CSRFToken": getCookie("csrftoken"),
              "Accept": "application/json",
              "Content-Type": "application/json",
            }
          });
          const prevPromise = fetch(`/rest/MediaPrev/${newValue}${window.location.search}`, {
            method: "GET",
            headers: {
              "X-CSRFToken": getCookie("csrftoken"),
              "Accept": "application/json",
              "Content-Type": "application/json",
            }
          });
          Promise.all([nextPromise, prevPromise])
          .then(responses => Promise.all(responses.map(resp => resp.json())))
          .then(([nextData, prevData]) => {
            const baseUrl = `/${data.project}/annotation/`;
            const searchParams = this._settings._queryParams();
            const media_id = parseInt(newValue);

            // Turn disable selected_type.
            searchParams.delete("selected_type");

            // Only enable next/prev if there is a next/prev
            if (prevData.prev == -1) {
              this._prev.disabled = true;
            }
            else {
              this._prev.addEventListener("click", () => {
                let url = baseUrl + prevData.prev;
                const searchParams = this._settings._queryParams();
                searchParams.delete("selected_type");
                searchParams.delete("selected_entity");
                searchParams.delete("frame");
                const typeParams = this._settings._typeParams();
                if (typeParams) {
                  searchParams.append("selected_type",typeParams)
                }
                url += "?" + searchParams.toString();
                window.location.href = url;
              });
            }

            if (nextData.next == -1) {
              this._next.disabled = true;
            }
            else {
              this._next.addEventListener("click", () => {
                let url = baseUrl + nextData.next;
                const searchParams = this._settings._queryParams();
                searchParams.delete("selected_type");
                searchParams.delete("selected_entity");
                searchParams.delete("frame");
                const typeParams = this._settings._typeParams();
                if (typeParams) {
                  searchParams.append("selected_type", typeParams)
                }
                url += "?" + searchParams.toString();
                window.location.href = url;
              });
            }
          })
          .catch(err => console.log("Failed to fetch adjacent media! " + err));
          fetch("/rest/Project/" + data.project, {
            method: "GET",
            credentials: "same-origin",
            headers: {
              "X-CSRFToken": getCookie("csrftoken"),
              "Accept": "application/json",
              "Content-Type": "application/json"
            }
          })
          .then(response => response.json())
          .then(data => {
            this._permission = data.permission;
            this.enableEditing(true);
          });
          const countUrl = `/rest/MediaCount/${data.project}?${searchParams.toString()}`;
          searchParams.set("after", data.name);
          const afterUrl = `/rest/MediaCount/${data.project}?${searchParams.toString()}`;
          const countPromise = fetchRetry(countUrl, {
            method: "GET",
            credentials: "same-origin",
            headers: {
              "X-CSRFToken": getCookie("csrftoken"),
              "Accept": "application/json",
              "Content-Type": "application/json"
            }
          });
          const afterPromise = fetchRetry(afterUrl, {
            method: "GET",
            credentials: "same-origin",
            headers: {
              "X-CSRFToken": getCookie("csrftoken"),
              "Accept": "application/json",
              "Content-Type": "application/json"
            }
          });
          Promise.all([countPromise, afterPromise])
          .then(([countResponse, afterResponse]) => {
            const countData = countResponse.json();
            const afterData = afterResponse.json();
            Promise.all([countData, afterData])
            .then(([count, after]) => {
              this._breadcrumbs.setPosition(count - after, count);
            });
          });
        })
        break;
    }
  }

  _setupInitHandlers(canvas) {
    this._canvas = canvas;
    const _handleQueryParams = () => {
      if (this._dataInitialized && this._canvasInitialized) {
        const searchParams = new URLSearchParams(window.location.search);
        const haveEntity = searchParams.has("selected_entity");
        const haveType = searchParams.has("selected_type");
        const haveFrame = searchParams.has("frame");
        const haveVersion = searchParams.has("version");
        const haveLock = searchParams.has("lock");
        const haveFillBoxes = searchParams.has("fill_boxes");
        const haveToggleText = searchParams.has("toggle_text");
        if (haveEntity && haveType) {
          const typeId = searchParams.get("selected_type");
          const entityId = Number(searchParams.get("selected_entity"));
          this._settings.setAttribute("type-id", typeId);
          this._settings.setAttribute("entity-id", entityId);
          this._browser.selectEntityOnUpdate(entityId, typeId);
        } else if (haveType) {
          const typeId = Number(searchParams.get("selected_type"));
          this._settings.setAttribute("type-id", typeId);
          for (const dtype of ['state', 'box', 'line', 'dot']) {
            let modifiedTypeId = dtype + "_" + typeId;
            if (this._data._dataByType.has(modifiedTypeId)) {
              this._browser._openForTypeId(modifiedTypeId);
            }
          }
        }
        if (haveVersion)
        {
          let version_id = searchParams.get("version");
          let evt = {"detail": {"version": this._versionLookup[version_id]}};
          this._versionDialog._handleSelect(evt);
        }
        if (haveLock) {
          const lock = Number(searchParams.get("lock"));
          if (lock) {
            this._settings._lock.lock();
          }
        }
        if (haveFillBoxes) {
          const fill_boxes = Number(searchParams.get("fill_boxes"));
          if (fill_boxes) {
            this._settings._fill_boxes.fill();
          }
          else {
            this._settings._fill_boxes.unfill();
          }
          canvas.toggleBoxFills(this._settings._fill_boxes.get_fill_boxes_status());
        }
        if (haveToggleText) {
          const toggle_text = Number(searchParams.get("toggle_text"));
          if (toggle_text) {
            this._settings._toggle_text.toggle = true;
          }
          else {
            this._settings._toggle_text.toggle = false
          }
          canvas.toggleTextOverlays(this._settings._toggle_text.get_toggle_status());
        }
      }
    }

    const _removeLoading = () => {
      if (this._dataInitialized && this._canvasInitialized) {
        try
        {
          this._loading.style.display = "none";
          this.removeAttribute("has-open-modal");
          window.dispatchEvent(new Event("resize"));
        }
        catch(exception)
        {
          //pass
        }
      }
    }

    this._data.addEventListener("initialized", () => {
      this._dataInitialized = true;
      _handleQueryParams();
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

    canvas.addEventListener("playing", () => {
      this._player.disableRateChange();
      this._player.disableQualityChange();
    });
    canvas.addEventListener("paused", () => {
      this._player.enableRateChange();
      this._player.enableQualityChange();
    });

    canvas.addEventListener("canvasReady", () => {
      this._canvasInitialized = true;
      _handleQueryParams();
      _removeLoading();
    });

    canvas.addEventListener("defaultVideoSettings", evt => {
      this._videoSettingsDialog.defaultSources = evt.detail;
    });

    this._settings._lock.addEventListener("click", evt=> {
      this.enableEditing(true);
    });

    this._settings._fill_boxes.addEventListener("click", evt => {
      canvas.toggleBoxFills(this._settings._fill_boxes.get_fill_boxes_status());
      canvas.refresh();
    })

    this._settings._toggle_text.addEventListener("click", evt => {
      canvas.toggleTextOverlays(this._settings._toggle_text.get_toggle_status());
      canvas.refresh();
    })

    if (this._player._rateControl) {
      this._player._rateControl.addEventListener("rateChange", evt => {
        if ("setRate" in canvas) {
          canvas.setRate(evt.detail.rate);
        }
      });
    }

    if (this._player._qualityControl) {
      this._player._qualityControl.addEventListener("qualityChange", evt => {
        if ("setQuality" in canvas) {
          canvas.setQuality(evt.detail.quality);
        }
      });
    }

    canvas.addEventListener("zoomChange", evt => {
      this._player.setAttribute("zoom", evt.detail.zoom);
    });

    this._player.addEventListener("zoomPlus", () => {
      if ("zoomPlus" in canvas) {
        canvas.zoomPlus();
      }
    });

    this._player.addEventListener("zoomMinus", () => {
      if ("zoomMinus" in canvas) {
        canvas.zoomMinus();
      }
    });

    this._versionDialog.addEventListener("close", evt => {
      this.removeAttribute("has-open-modal", "");
      document.body.classList.remove("shortcuts-disabled");
    });

    this._versionDialog.addEventListener("versionSelect", evt => {
      this._data.setVersion(evt.detail.version).then(() => {
        this._settings.setAttribute("version", evt.detail.version.id);
        this._canvas.refresh();
      });
      this._browser.version = evt.detail.version;
      this._versionButton.text = evt.detail.version.name;
      this._version = evt.detail.version;
      for (const key in this._saves) {
        this._saves[key].version = this._version;
      }
      this.enableEditing();
    });

    this._versionButton.addEventListener("click", () => {
      this._versionDialog.setAttribute("is-open", "");
      this.setAttribute("has-open-modal", "");
      document.body.classList.add("shortcuts-disabled");
    });

    this._bookmarkDialog.addEventListener("close", evt => {
      if (this._bookmarkDialog._confirm) {
        const searchParams = new URLSearchParams(window.location.search);
        let uri = window.location.pathname;
        uri += "?" + this._settings._queryParams(searchParams).toString();
        const name = this._bookmarkDialog._input.value;
        fetch("/rest/Bookmarks/" + this.getAttribute("project-id"), {
          method: "POST",
          credentials: "same-origin",
          headers: {
            "X-CSRFToken": getCookie("csrftoken"),
            "Accept": "application/json",
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            name: name,
            uri: uri,
          }),
        });
      }
      this.removeAttribute("has-open-modal", "");
      document.body.classList.remove("shortcuts-disabled");
    });

    this._videoSettingsDialog.addEventListener("close", () => {
      this.removeAttribute("has-open-modal", "");
      document.body.classList.remove("shortcuts-disabled");
    });

    this._videoSettingsDialog.addEventListener("applyVideoSources", evt => {
      for (let sourceName in evt.detail) {
        let source = evt.detail[sourceName];
        if (source) {
          canvas.setQuality(source.quality, source.name);

          if (source.name == "play") {
            this._player.quality = source.quality;
          }
        }
      }
    });

    this._videoSettingsDialog.addEventListener("displayOverlays", evt => {
      canvas.displayVideoDiagnosticOverlay(evt.detail.displayDiagnostic);
    });

    this._videoSettingsDialog.addEventListener("allowSafeMode", evt => {
      canvas.allowSafeMode(evt.detail.allowSafeMode);
    });

    this._player.addEventListener("openVideoSettings", () => {
      var videoSettings = canvas.getVideoSettings();
      this._videoSettingsDialog.applySettings(videoSettings);
      this._videoSettingsDialog.setAttribute("is-open", "");
      this.setAttribute("has-open-modal", "");
      document.body.classList.add("shortcuts-disabled");
    });
  }

  _getMetadataTypes(canvas, canvasElement, block_signals, subelement_id, update) {
    const projectId = Number(this.getAttribute("project-id"));
    let mediaId = Number(this.getAttribute("media-id"));
    if (subelement_id)
    {
      mediaId = subelement_id;
    }
    const query = "?media_id=" + mediaId;
    const favoritePromise = fetch("/rest/Favorites/" + projectId, {
      method: "GET",
      credentials: "same-origin",
      headers: {
        "X-CSRFToken": getCookie("csrftoken"),
        "Accept": "application/json",
        "Content-Type": "application/json"
      }
    });
    const versionPromise = fetch("/rest/Versions/" + projectId + "?media_id=" + mediaId, {
      method: "GET",
      credentials: "same-origin",
      headers: {
        "X-CSRFToken": getCookie("csrftoken"),
        "Accept": "application/json",
        "Content-Type": "application/json"
      }
    });
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
        for (let [idx,dataType] of dataTypes.entries()) {
          dataType.id = dataType.dtype + "_" + dataType.id;
          let isLocalization=false;
          let isTrack=false;
          let isTLState=false;
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

          if (dataType.isTrack) {
            // Determine the localization type that should be drawn.
            let localizationTypeId = null;
            if (dataType.default_localization) {
              localizationTypeId = dataType.default_localization;
            } else {
              // If default localization type is not set, go by priority box > line > dot.
              const byType = dataTypes.reduce((sec, obj) => {
                if (obj.visible && obj.drawable) {
                  (sec[obj.dtype] = sec[obj.dtype] || []).push(obj);
                }
                return sec;
              }, {});
              if (typeof byType.box !== "undefined") {
                localizationTypeId = byType.box[0].id;
              } else if (typeof byType.line !== "undefined") {
                localizationTypeId = byType.line[0].id;
              } else if (typeof byType.dot !== "undefined") {
                localizationTypeId = byType.dot[0].id;
              }
            }
            if (localizationTypeId === null) {
              throw "Could not find a localization type to use for track creation!";
            }
            dataType.localizationType = dataTypes.filter(type => type.id == localizationTypeId)[0];
          }
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
          if (obj.visible && obj.drawable) {
            (sec[obj.dtype] = sec[obj.dtype] || []).push(obj);
          }
          return sec;
        }, {});
        const trackTypes = stateTypes.filter(type => type.association == 'Localization'
                                                     && type.visible);

        if (block_signals == true)
        {
          return;
        }

        // For states specifically, if we are using the multi-view, we will
        // create the state across all media
        var stateMediaIds;
        if (this._player.mediaType.dtype == "multi") {
          stateMediaIds = this._mediaIds;
        }

        this._browser.init(dataTypes, this._version, stateMediaIds, this._player.mediaType.dtype != "image");

        this._sidebar.localizationTypes = byType;
        this._sidebar.trackTypes = trackTypes;
        this._sidebar.addEventListener("default", evt => {
          this.clearMetaCaches();
          canvas.defaultMode();
        });
        this._sidebar.addEventListener("newMeta", evt => {
          this.clearMetaCaches();
          canvas.newMetadataItem(evt.detail.typeId, evt.detail.metaMode);
        });
        this._sidebar.addEventListener("zoomIn", evt => {
          canvas.zoomIn();
        });
        this._sidebar.addEventListener("zoomOut", evt => {
          canvas.zoomOut();
        });
        this._sidebar.addEventListener("pan", evt => {
          canvas.pan();
        });
        canvas.addEventListener("drawComplete", (evt) => {
          if (evt.detail.metaMode == false)
          {
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
          this._settings.setAttribute("entity-id", evt.detail.id);
          this._settings.setAttribute("entity-type", evt.detail.meta);
          this._settings.setAttribute("type-id", evt.detail.meta);
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
        this._browser.addEventListener("select", evt => {
          if (evt.detail.byUser) {
            if (evt.detail.dataType.isLocalization) {
              canvas.selectLocalization(evt.detail.data, false, false, !evt.detail.goToEntityFrame);
            } else if (evt.detail.dataType.isTrack) {
              // select track takes care of frame jump
              canvas.selectTrack(evt.detail.data, undefined, !evt.detail.goToEntityFrame);
            }
            else if ('frame' in evt.detail.data) {
              if (evt.detail.goToEntityFrame) {
                canvas.goToFrame(parseInt(evt.detail.data.frame));
              }
            }

            if (this._player.selectTimelineData) {
              this._player.selectTimelineData(evt.detail.data);
            }

            if (this._player.mediaType.dtype == "multi") {
              if (evt.detail.goToEntityFrame) {
                this._player.goToFrame(evt.detail.data.frame);
              }
            }
          }
          this._settings.setAttribute("entity-id", evt.detail.data.id);
          this._settings.setAttribute("entity-type", evt.detail.data.meta);
          this._settings.setAttribute("type-id", evt.detail.data.meta);
        });
        this._browser.addEventListener("capture", evt => {
          if ('_video' in canvas)
          {
            canvas._video.makeDownloadableLocalization(evt.detail.data);
          }
          else
          {
            canvas._image.makeDownloadableLocalization(evt.detail.data);
          }
        });
        this._browser.addEventListener("open", evt => {
          this._settings.setAttribute("type-id", evt.detail.typeId);
        });
        this._browser.addEventListener("close", evt => {
          this._settings.removeAttribute("type-id");

          // The canvas can either be the annotation player or image. The player is the only
          // annotation that has the concepts of tracks, so the following check is performed.
          if (typeof canvas.deselectTrack === "function") {
            canvas.deselectTrack();
          }
          canvas.selectNone();
        });
        this._browser.addEventListener("frameChange", evt => {
          if ('track' in evt.detail)
          {
            canvas.selectTrack(evt.detail.track, evt.detail.frame);
          }
          else
          {
            canvas.goToFrame(evt.detail.frame);
          }
        });
        this._browser.addEventListener("patchMeta", evt => {
          this.clearMetaCaches();
          canvas.newMetadataItem(evt.detail.typeId, false, evt.detail.obj);
        });
        this._saves = {};

        for (const dataType of ["box", "line", "dot"]) {
          const save = document.createElement("save-dialog");
          const dataTypes = localizationTypes.filter(type => type.dtype == dataType
                                                             && type.visible
                                                             && type.drawable);
          if (dataTypes.length > 0) {
            let defaultType = null;
            switch(dataType) {
              case "box":
                if (this._player.mediaType.default_box) {
                  const filtered = dataTypes.filter(type => type.id == this._player.mediaType.default_box);
                  if (filtered.length > 0) {
                    defaultType = filtered[0];
                  }
                }
                break;
              case "line":
                if (this._player.mediaType.default_line) {
                  const filtered = dataTypes.filter(type => type.id == this._player.mediaType.default_line);
                  if (filtered.length > 0) {
                    defaultType = filtered[0];
                  }
                }
                break;
              case "dot":
                if (this._player.mediaType.default_dot) {
                  const filtered = dataTypes.filter(type => type.id == this._player.mediaType.default_dot);
                  if (filtered.length > 0) {
                    defaultType = filtered[0];
                  }
                }
                break;
            }
            if (defaultType === null) {
              defaultType = dataTypes[0];
            }
            save.init(projectId, mediaId, dataTypes, defaultType, this._undo, this._version, favorites);
            this._settings.setAttribute("version", this._version.id);
            this._main.appendChild(save);
            this._saves[dataType] = save;

            save.addEventListener("cancel", () => {
              this._closeModal(save);
              canvas.refresh();
            });

            save.addEventListener("save", () => {
              this._closeModal(save);
            });
          }
        }

        for (const dataType of stateTypes) {
          const save = document.createElement("save-dialog");
          save.init(projectId, mediaId, [dataType], dataType, this._undo, this._version, favorites);
          this._settings.setAttribute("version", this._version.id);
          this._main.appendChild(save);
          this._saves[dataType.id] = save;

          // For states specifically, if we are using the multi-view, we will
          // create the state across all media
          if (this._player.mediaType.dtype == "multi") {
            save.stateMediaIds = this._mediaIds;
          }

          save.addEventListener("cancel", () => {
            this._closeModal(save);
            canvas.refresh();
          });

          save.addEventListener("save", () => {
            this._closeModal(save);
          });
        }

        canvas.addEventListener("create", evt => {
          const metaMode = evt.detail.metaMode;
          const objDescription = evt.detail.objDescription;
          const dragInfo = evt.detail.dragInfo;
          const requestObj = evt.detail.requestObj;
          const canvasPosition = evt.detail.canvasElement.getBoundingClientRect();

          // Get the save dialog for this type. It gets created
          // with a metamode flag that changes based on mode. If
          // it has been created once in a given meta mode, reuse
          // the attributes from previous runs.
          // (Fixes Pulse #324572460)
          var save = this._getSave(objDescription);
          // Because we can be annotating multiple media_ids, set the dialog save
          // to the id the draw event came from
          save._mediaId = evt.detail.mediaId;
          if (metaMode && save.metaMode)
          {
            save.saveObject(requestObj, save.metaCache);
          }
          else
          {
            this._openModal(objDescription, dragInfo, canvasPosition,
                            requestObj,metaMode);
            this._makePreview(objDescription, dragInfo, canvasPosition);
          }
        });

        this._setupContextMenuDialogs(canvas, canvasElement, stateTypes);

        canvas.addEventListener("maximize", () => {
          document.body.requestFullscreen();
        });

        canvas.addEventListener("minimize", () => {
          document.exitFullscreen();
        });
      });
   });
  }

  _setupContextMenuDialogs(canvas, canvasElement, stateTypes) {

    // This is a bit of a hack, but the modals will share the same
    // methods used by the save localization dialogs since the
    // appearance to the user is the same.
    const menu = document.createElement("modify-track-dialog");
    this._main.appendChild(menu);
    this._saves['modifyTrack'] = menu;

    // Look at the registered algorithms for this project. Set the modify track dialog
    // options appropriately.
    this._extend_track_algo_name = "tator_extend_track";
    this._fill_track_gaps_algo_name = "tator_fill_track_gaps";
    const projectId = Number(this.getAttribute("project-id"));
    const algUrl = "/rest/Algorithms/" + projectId;
    const algorithmPromise = fetchRetry(algUrl, {
      method: "GET",
      credentials: "same-origin",
      headers: {
        "X-CSRFToken": getCookie("csrftoken"),
        "Accept": "application/json",
        "Content-Type": "application/json"
      },
    })
    .then(response => { return response.json(); })
    .then(result => {
      var registeredAlgos = [];
      for (const alg of result) {
        registeredAlgos.push(alg.name);
        if (alg.name == this._extend_track_algo_name) {
          menu.enableExtendAutoMethod();
        }
        else if (alg.name == this._fill_track_gaps_algo_name) {
          if (typeof canvas.enableFillTrackGapsOption !== "undefined") {
            canvas.enableFillTrackGapsOption();
          }
        }
      }
      console.log("Registered algorithms: " + registeredAlgos);
    });

    menu.addEventListener("fillTrackGaps", evt => {
      let body = {
        "algorithm_name": this._fill_track_gaps_algo_name,
        "extra_params": [
          {name: 'track', value: evt.detail.trackId}]};

      if ('media' in evt.detail.localization)
      {
        body["media_ids"] = [evt.detail.localization.media];
      }
      else
      {
        body["media_ids"] = [evt.detail.localization.media_id];
      }

      fetch("/rest/AlgorithmLaunch/" + evt.detail.project, {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "X-CSRFToken": getCookie("csrftoken"),
          "Accept": "application/json",
          "Content-Type": "application/json"
        },
        body: JSON.stringify(body),
      })
      .then(response => {
        if (response.status != 201) {
          window.alert("Error launching automatic track gaps fill algorithm!");
        }
        return response.json();
      })
      .then(data => {
        console.log(data);
        return this.showAlgoRunningDialog(
          data.uid,
          "Filling in track gaps with a visual tracker...",
          "Track gaps filled.",
          "Error occured with the visual tracker. Track was not modified.");
      })
      .then((jobSuccessful) => {
        if (jobSuccessful) {
          this._data.updateType(this._data._dataTypes[evt.detail.localization.meta]);
          this._data.updateType(this._data._dataTypes[evt.detail.trackType]);
          Utilities.showSuccessIcon("Track extension done.");
          canvas.selectTrackUsingId(evt.detail.trackId, evt.detail.trackType, evt.detail.localization.frame);
        }
      });
    });

    menu.addEventListener("extendTrack", evt => {

      if (evt.detail.algorithm == "Duplicate") {

        // Create the new localization objets
        var localizationList = [];
        const baseLocalization = evt.detail.localization;
        for (let offset = 1; offset <= evt.detail.numFrames; offset++) {

          var newLocalization = {
            media_id: baseLocalization.media,
            type: Number(baseLocalization.meta.split("_")[1]),
            x: baseLocalization.x,
            y: baseLocalization.y,
            u: baseLocalization.u,
            v: baseLocalization.v,
            width: baseLocalization.width,
            height: baseLocalization.height,
            version: baseLocalization.version
          };

          if (typeof baseLocalization.media === "undefined") {
            newLocalization.media_id = baseLocalization.media_id;
          }

          newLocalization = {...newLocalization, ...baseLocalization.attributes};

          if (evt.detail.direction == "Forward") {
            newLocalization.frame = evt.detail.localization.frame + offset;
          }
          else {
            newLocalization.frame = evt.detail.localization.frame - offset;
          }
          localizationList.push(newLocalization);
        }

        // Make the request
        const promise = fetchRetry("/rest/Localizations/" + evt.detail.project, {
          method: "POST",
          credentials: "same-origin",
          headers: {
            "X-CSRFToken": getCookie("csrftoken"),
            "Accept": "application/json",
            "Content-Type": "application/json"
          },
          body: JSON.stringify(
            localizationList
          ),
        })
        .then (response => {
          return response.json();
        })
        .then(newLocIds => {
          try {
            if (newLocIds.id.length < 1) {
              throw "Problem creating localizations";
            }

            const trackPromise = fetchRetry("/rest/State/" + evt.detail.trackId, {
              method: "PATCH",
              credentials: "same-origin",
              headers: {
                "X-CSRFToken": getCookie("csrftoken"),
                "Accept": "application/json",
                "Content-Type": "application/json"
              },
              body: JSON.stringify(
                {
                  localization_ids_add: newLocIds.id
                }
              ),
            })
            .then (response => response.json());

            return trackPromise;

          } catch (error) {
            window.alert("Error with track extension during localization creation process.");
            return;
          }
        })
        .then(() => {
          this._data.updateType(this._data._dataTypes[evt.detail.localization.meta]);
          this._data.updateType(this._data._dataTypes[evt.detail.trackType]);
          Utilities.showSuccessIcon("Track extension done.");
          canvas.selectTrackUsingId(evt.detail.trackId, evt.detail.trackType, evt.detail.localization.frame);
        });
      }
      else if (evt.detail.algorithm == "Auto") {
        let body = {
          "algorithm_name": this._extend_track_algo_name,
          "extra_params": [
            {name: 'track', value: evt.detail.trackId},
            {name: 'extend_direction', value: evt.detail.direction},
            {name: 'extend_detection_id', value: evt.detail.localization.id}]
          };
        if ('media' in evt.detail.localization)
        {
          body["media_ids"] = [evt.detail.localization.media];
        }
        else
        {
          body["media_ids"] = [evt.detail.localization.media_id];
        }

        fetch("/rest/AlgorithmLaunch/" + evt.detail.project, {
          method: "POST",
          credentials: "same-origin",
          headers: {
            "X-CSRFToken": getCookie("csrftoken"),
            "Accept": "application/json",
            "Content-Type": "application/json"
          },
          body: JSON.stringify(body),
        })
        .then(response => {
          if (response.status != 201) {
            window.alert("Error launching automatic track extension algorithm!");
          }
          return response.json();
        })
        .then(data => {
          console.log(data);
          return this.showAlgoRunningDialog(
            data.uid,
            "Extending track with a visual tracker...",
            "Track extended.",
            "Error occured with the visual tracker. Track was not extended.");
        })
        .then((jobSuccessful) => {
          if (jobSuccessful) {
            this._data.updateType(this._data._dataTypes[evt.detail.localization.meta]);
            this._data.updateType(this._data._dataTypes[evt.detail.trackType]);
            Utilities.showSuccessIcon("Track extension done.");
            canvas.selectTrackUsingId(evt.detail.trackId, evt.detail.trackType, evt.detail.localization.frame);
          }
        });
      }
      else {
        window.alert("Unrecognized track extension algorithm. No track extension performed.");
      }
    });

    menu.addEventListener("trimTrack", evt => {

      const promise = fetchRetry("/rest/TrimStateEnd/" + evt.detail.trackId, {
        method: "PATCH",
        credentials: "same-origin",
        headers: {
          "X-CSRFToken": getCookie("csrftoken"),
          "Accept": "application/json",
          "Content-Type": "application/json"
        },
        body: JSON.stringify(
          {
            frame: evt.detail.frame,
            endpoint: evt.detail.endpoint
          }
        ),
      })
      .then(response => response.json())
      .then(() => {
        this._data.updateType(this._data._dataTypes[evt.detail.localizationType]);
        this._data.updateType(this._data._dataTypes[evt.detail.trackType]);
        Utilities.showSuccessIcon("Track trimming done.");
        canvas.selectTrackUsingId(evt.detail.trackId, evt.detail.trackType, evt.detail.frame);
      });
    });

    this._addDetectionToTrack = evt => {

      const promise = fetchRetry("/rest/State/" + evt.detail.mainTrackId, {
        method: "PATCH",
        credentials: "same-origin",
        headers: {
          "X-CSRFToken": getCookie("csrftoken"),
          "Accept": "application/json",
          "Content-Type": "application/json"
        },
        body: JSON.stringify(
          {
            localization_ids_add: [evt.detail.detectionId],
          }
        ),
      })
      .then(response => response.json())
      .then(() => {
        this._data.updateType(this._data._dataTypes[evt.detail.localizationType]);
        this._data.updateType(this._data._dataTypes[evt.detail.trackType]);
        Utilities.showSuccessIcon("Detection added to track.");
        if (evt.detail.selectTrack) {
          canvas.selectTrackUsingId(evt.detail.mainTrackId, evt.detail.trackType, evt.detail.frame);
        }
      });
    };

    menu.addEventListener("addDetectionToTrack", this._addDetectionToTrack.bind(this));
    for (const save of Object.values(this._saves)) {
      save.addEventListener("addDetectionToTrack", this._addDetectionToTrack.bind(this));
    }

    menu.addEventListener("mergeTracks", evt => {

      const promise = fetchRetry("/rest/MergeStates/" + evt.detail.mainTrackId, {
        method: "PATCH",
        credentials: "same-origin",
        headers: {
          "X-CSRFToken": getCookie("csrftoken"),
          "Accept": "application/json",
          "Content-Type": "application/json"
        },
        body: JSON.stringify(
          {
            merge_state_id: evt.detail.mergeTrackId,
          }
        ),
      })
      .then(response => response.json())
      .then(() => {
        this._data.updateType(this._data._dataTypes[evt.detail.localizationType]);
        this._data.updateType(this._data._dataTypes[evt.detail.trackType]);
        Utilities.showSuccessIcon("Track merged.", this._successColor);
        canvas.selectTrackUsingId(evt.detail.mainTrackId, evt.detail.trackType, evt.detail.frame);
      });
    });

    menu.addEventListener("yes", () => {
      this._closeModal(menu);
    });

    menu.addEventListener("cancel", () => {
      this._closeModal(menu);
      canvas.refresh();
    });

    canvas.addEventListener("modifyTrack", evt => {
      const metaMode = evt.detail.metaMode;
      const objDescription = evt.detail.objDescription;
      const dragInfo = evt.detail.dragInfo;
      const requestObj = evt.detail.requestObj;
      const canvasPosition = canvasElement.getBoundingClientRect();

      const dialog = this._getSave(objDescription);
      dialog.setUI(objDescription);

      this._openModal(objDescription, dragInfo, canvasPosition, requestObj, metaMode);
      this._makePreview(objDescription, dragInfo, canvasPosition);
    });

    if (typeof canvas.addCreateTrackType !== "undefined") {
      for (const dataType of stateTypes) {
        canvas.addCreateTrackType(dataType);
      }
    }
  }

  _closeModal(save) {
    if (save.classList.contains("is-open"))
    {
      save.classList.remove("is-open");
      this.removeAttribute("has-open-modal");
      document.body.classList.remove("shortcuts-disabled");
      this._main.removeChild(this._preview);
    }
  }

  _openModal(objDescription, dragInfo, canvasPosition, requestObj, metaMode) {
    const save = this._getSave(objDescription);
    save.canvasPosition = canvasPosition;
    save.dragInfo = dragInfo;
    save.requestObj = requestObj;
    save.metaMode = metaMode;
    save.classList.add("is-open");
    this.setAttribute("has-open-modal", "");
    document.body.classList.add("shortcuts-disabled");
  }

  _getSave(objDescription) {
    let save;
    if (["box", "line", "dot"].includes(objDescription.dtype)) {
      save = this._saves[objDescription.dtype];
    } else {
      save = this._saves[objDescription.id];
    }
    return save;
  }

  clearMetaCaches() {
    Object.values(this._saves).forEach(save => {
      save.metaMode = false;
    });
  }

  _makePreview(objDescription, dragInfo, canvasPosition) {
    this._preview = document.createElement("div");
    this._preview.style.overflow = "hidden";
    this._preview.style.position = "absolute";
    const prevTop = Math.min(dragInfo.start.y, dragInfo.end.y);
    const prevLeft = Math.min(dragInfo.start.x, dragInfo.end.x);
    this._preview.style.top = (canvasPosition.top + prevTop) + "px";
    this._preview.style.left = (canvasPosition.left + prevLeft) + "px";
    this._preview.style.width = (Math.abs(dragInfo.start.x - dragInfo.end.x) - 6) + "px";
    this._preview.style.height = (Math.abs(dragInfo.start.y - dragInfo.end.y) - 6) + "px";
    this._preview.style.borderStyle = "solid";
    this._preview.style.borderWidth = "3px";
    this._preview.style.borderColor = "white";
    this._preview.style.zIndex = 2;
    this._main.appendChild(this._preview);

    const img = new Image();
    img.src = dragInfo.url;
    img.style.position = "absolute";
    img.style.top = -prevTop - 3 + "px";
    img.style.left = -prevLeft - 3 + "px";
    img.style.width = canvasPosition.width + "px";
    img.style.height = canvasPosition.height + "px";
    this._preview.appendChild(img);
  };

  /// Turn on or off ability to edit annotations
  async enableEditing(mask) {
    // Check state of lock button.
    let enable = this._settings._lock._pathLocked.style.display == "none";

    // Check input.
    if (typeof mask !== "undefined") {
      enable &= mask;
    }

    let permission;
    if (enable) {
      // Set privileges to user's level.
      permission = this._permission;
    } else {
      // Turn off editing.
      permission = "View Only";
    }
    while ((typeof this._player == "undefined")
        || (typeof this._browser == "undefined")
        || (typeof this._sidebar == "undefined")) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    this._player.permission = permission;
    this._browser.permission = permission;
    this._sidebar.permission = permission;
  }

  _updateLastVisitedBookmark() {
    const uri = `${window.location.pathname}${window.location.search}`;
    const name = "Last visited";
    // Get the last visited, if it exists.
    fetch(`/rest/Bookmarks/${this.getAttribute("project-id")}?name=${name}`, {
      method: "GET",
      credentials: "same-origin",
      headers: {
        "X-CSRFToken": getCookie("csrftoken"),
        "Accept": "application/json",
        "Content-Type": "application/json"
      },
    })
    .then(response => response.json())
    .then(data => {
      if (data.length == 0) {
        fetch(`/rest/Bookmarks/${this.getAttribute("project-id")}`, {
          method: "POST",
          credentials: "same-origin",
          headers: {
            "X-CSRFToken": getCookie("csrftoken"),
            "Accept": "application/json",
            "Content-Type": "application/json"
          },
          body: JSON.stringify({name: name, uri: uri}),
        });
      } else {
        const id = data[0].id;
        fetch(`/rest/Bookmark/${id}`, {
          method: "PATCH",
          credentials: "same-origin",
          headers: {
            "X-CSRFToken": getCookie("csrftoken"),
            "Accept": "application/json",
            "Content-Type": "application/json"
          },
          body: JSON.stringify({name: name, uri: uri}),
        });
      }
    });

  }
}

customElements.define("annotation-page", AnnotationPage);
