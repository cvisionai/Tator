class MediaSection extends TatorElement {
  constructor() {
    super();

    const section = document.createElement("div");
    section.setAttribute("class", "project__section py-3");
    this._shadow.appendChild(section);

    const header = document.createElement("div");
    header.setAttribute("class", "project__header d-flex flex-items-center flex-justify-between col-12 row-actions-hover");
    section.appendChild(header);

    this._name = document.createElement("h2");
    this._name.setAttribute("class", "h3"); //not a typo
    header.appendChild(this._name);

    this._nameText = document.createTextNode("");
    this._name.appendChild(this._nameText);

    const numFiles = document.createElement("span");
    numFiles.setAttribute("class", "text-gray px-2");
    this._name.appendChild(numFiles);

    this._numFiles = document.createTextNode("");
    numFiles.appendChild(this._numFiles);

    const actions = document.createElement("div");
    actions.setAttribute("class", "d-flex flex-items-center");
    header.appendChild(actions);

    this._reload = document.createElement("reload-button");
    this._reload.setAttribute("class", "px-2");
    actions.appendChild(this._reload);

    this._upload = document.createElement("section-upload");
    this._upload.setAttribute("class", "px-2");
    actions.appendChild(this._upload);

    this._more = document.createElement("section-more");
    this._more.setAttribute("class", "px-2");
    actions.appendChild(this._more);

    const div = document.createElement("div");
    div.setAttribute("class", "d-flex");
    section.appendChild(div);

    this._files = document.createElement("section-files");
    this._files.setAttribute("class", "col-12");
    this._files.mediaParams = this._sectionParams.bind(this);
    div.appendChild(this._files);

    this._paginator = document.createElement("section-paginator");
    section.appendChild(this._paginator);

    this._searchParams = new URLSearchParams();

    this._setCallbacks();
  }

  init(project, section, username, token) {
    if (section === null) {
      this._sectionName = "All Media";
      this._upload.setAttribute("section", "");
    } else {
      this._sectionName = section.name;
      this._upload.setAttribute("section", section.name);
    }
    this._project = project;
    this._section = section;
    this._sectionName = this._sectionName;
    this._files.setAttribute("project-id", project);
    this._nameText.nodeValue = this._sectionName;
    this._upload.setAttribute("project-id", project);
    this._upload.setAttribute("username", username);
    this._upload.setAttribute("token", token);
    this._more.section = section;
    this._start = 0;
    this._stop = this._paginator._pageSize;
    this._after = new Map();
    this.reload();
  }

  set project(val) {
    this._files.project = val;
    if (!hasPermission(val.permission, "Can Edit")) {
      this._more.style.display = "none";
    }
    if (!(hasPermission(val.permission, "Can Transfer") && val.enable_downloads)) {
      this._upload.style.display = "none";
    }
    this._more.project = val;
    this._project = val;
  }

  set numMedia(val) {
    this._updateNumFiles(val);
    if (val == 0) {
      this._files.style.display = "none";
    } else {
      this._files.style.display = "block";
    }
  }

  set searchString(val) {
    if (val) {
      this._searchParams.set("search", val);
    } else {
      this._searchParams = new URLSearchParams();
    }
  }

  get sectionParams() {
    return this._sectionParams();
  }

  set cardInfo(val) {
    this._files.cardInfo = val;
  }

  set mediaIds(val) {
    this._updateNumFiles(val.length);
    this._files.mediaIds = val;
  }

  set algorithms(val) {
    this._more.algorithms = val;
    this._files.algorithms = val;
  }

  set sections(val) {
    let sections = val.slice();
    const index = sections.indexOf(this._sectionName);
    if (index > -1) {
      sections.splice(index, 1);
    }
    this._files.sections = sections;
  }

  removeMedia(mediaId) {
    for (const mediaCard of this._files._main.children) {
      if (mediaCard.getAttribute("media-id") == mediaId) {
        mediaCard.parentNode.removeChild(mediaCard);
        const numFiles = Number(this._numFiles.textContent.split(' ')[0]) - 1;
        this._updateNumFiles(numFiles);
      }
    }
  }

  _updateNumFiles(numFiles) {
    let fileText = "Files";
    if (numFiles == 1) {
      fileText = "File";
    }
    this._numFiles.nodeValue = `${numFiles} ${fileText}`;
    if (numFiles != this._paginator._numFiles) {
      this._start = 0;
      this._stop = this._paginator._pageSize;
      this._after = new Map();
      this._paginator.init(numFiles);
    }
  }

  _sectionParams() {
    const sectionParams = new URLSearchParams();
    if (this._section !== null) {
      sectionParams.append("section", this._section.id);
    }
    return joinParams(sectionParams, this._searchParams);
  }

  _getAfter(index) {
    const url = `/rest/Medias/${this._project}`;
    let params = this._sectionParams();
    const recursiveFetch = (url, params, current) => {
      let after = "";
      if (this._after.has(current - 5000)) {
        after = `&after=${this._after.get(current-5000)}`;
      }
      return fetch(`${url}?${params.toString()}&start=4999&stop=5000${after}&presigned=28800`, {
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
        this._after.set(current, data[0].name);
        if (current < index) {
          return recursiveFetch(url, params, current + 5000);
        }
        return Promise.resolve(data[0]['name']);
      });
    }
    if (this._after.has(index)) {
      return Promise.resolve(this._after.get(index));
    } else {
      return recursiveFetch(url, params, 5000);
    }
  }

  _loadMedia() {
    const sectionQuery = this._sectionParams();
    // Find an interval for use with "after". Super page size of
    // 5000 guarantees that any start/stop fully falls within a
    // super page interval.
    let afterPromise = Promise.resolve("");
    if (this._stop < 10000) {
      sectionQuery.append("start", this._start);
      sectionQuery.append("stop", this._stop);
    } else {
      const afterIndex = 5000 * Math.floor(this._start / 5000);
      const start = this._start % afterIndex;
      let stop = this._stop % afterIndex;
      if (stop < start) {
        stop += 5000;
      }
      sectionQuery.append("start", start);
      sectionQuery.append("stop", stop);
      afterPromise = this._getAfter(afterIndex);
    }
    return afterPromise.then(afterName => {
      if (afterName) {
        sectionQuery.append("after", afterName);
      }
      return fetch(`/rest/Medias/${this._project}?${sectionQuery.toString()}&presigned=28800`, {
        method: "GET",
        credentials: "same-origin",
        headers: {
          "X-CSRFToken": getCookie("csrftoken"),
          "Accept": "application/json",
          "Content-Type": "application/json"
        }
      })
      .then(response => response.json())
      .then(media => {
        this._files.numMedia = this._paginator._numFiles;
        this._files.startMediaIndex = this._start;
        this._files.cardInfo = media;
        this._reload.ready();
      });
    });
  }

  reload() {
    this._reload.busy();
    const sectionQuery = this._sectionParams();
    const countPromise = fetch(`/rest/MediaCount/${this._project}?${sectionQuery.toString()}`, {
      method: "GET",
      credentials: "same-origin",
      headers: {
        "X-CSRFToken": getCookie("csrftoken"),
        "Accept": "application/json",
        "Content-Type": "application/json"
      }
    })
    .then(response => response.json())
    .then(count => this.numMedia = count)
    .then(() => {
      this._loadMedia();
    });
  }

  _launchAlgorithm(evt) {
    this.dispatchEvent(
      new CustomEvent("runAlgorithm",
        {composed: true,
        detail: {
          algorithmName: evt.detail.algorithmName,
          mediaQuery: `?${this._sectionParams().toString()}`,
          projectId: this._project,
        }}));
  }

  _downloadFiles(evt) {
    let mediaParams = new URLSearchParams();
    if (evt.detail) {
      if (evt.detail.mediaIds) {
        mediaParams.append("media_id", evt.detail.mediaIds);
      }
    }
    const getUrl = endpoint => {
      const params = joinParams(this._sectionParams(), mediaParams);
      return `/rest/${endpoint}/${this._project}?${params.toString()}`;
    };
    const headers = {
      "X-CSRFToken": getCookie("csrftoken"),
      "Accept": "application/json",
      "Content-Type": "application/json"
    };
    fetchRetry(getUrl("MediaStats"), {
      method: "GET",
      credentials: "same-origin",
      headers: headers,
    })
    .then(response => response.json())
    .then(async mediaStats => {
      let lastFilename = null;
      let numImages = 0;
      let numVideos = 0;
      let size = 0;
      console.log("Download size: " + mediaStats.download_size);
      console.log("Download num files: " + mediaStats.count);
      if ((mediaStats.downloadSize > 60000000000) || (mediaStats.count > 5000)) {
        const bigDownload = document.createElement("big-download-form");
        const page = document.getElementsByTagName("project-detail")[0];
        page._projects.appendChild(bigDownload);
        bigDownload.setAttribute("is-open", "");
        page.setAttribute("has-open-modal", "");
        bigDownload.addEventListener("close", evt => {
          page.removeAttribute("has-open-modal", "");
          page._projects.removeChild(bigDownload);
        });
        while (bigDownload.hasAttribute("is-open")) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
        if (!bigDownload._confirm) {
          page._leaveConfirmOk = false;
          return;
        }
      }

      const batchSize = numImages > numVideos ? 20 : 2;
      const filenames = new Set();
      const re = /(?:\.([^.]+))?$/;
      const fileStream = streamSaver.createWriteStream(this._sectionName + ".zip");
      const readableZipStream = new ZIP({
        async pull(ctrl) {
          let url = `${getUrl("Medias")}&stop=${batchSize}&presigned=28800`;
          if (lastFilename != null) {
            url += "&after=" + encodeURIComponent(lastFilename);
          }
          await fetchRetry(url, {
            method: "GET",
            credentials: "same-origin",
            headers: headers,
          })
          .then(response => response.json())
          .then(async medias => {
            if (medias.length == 0) {
              ctrl.close();
            }
            for (const media of medias) {
              lastFilename = media.name;
              const basenameOrig = media.name.replace(/\.[^/.]+$/, "");
              const ext = re.exec(media.name)[0];
              let basename = basenameOrig;
              let vers = 1;
              while (filenames.has(basename)) {
                basename = basenameOrig + " (" + vers + ")";
                vers++;
              }
              filenames.add(basename);

              const request = Utilities.getDownloadRequest(media, headers);
              if (request !== null) { // Media objects with no downloadable files will return null.
                // Download media file.
                console.log("Downloading " + media.name + " from " + request.url + "...");
                await fetchRetry(request)
                .then(response => {
                  const stream = () => response.body;
                  const name = basename + ext;
                  ctrl.enqueue({name, stream});
                });
              }
            }
          });
        }
      });
      if (window.WritableStream && readableZipStream.pipeTo) {
        readableZipStream.pipeTo(fileStream);
      } else {
        const writer = fileStream.getWriter();
        const reader = readableZipStream.getReader();
        const pump = () => reader.read()
          .then(res => res.done ? writer.close() : writer.write(res.value).then(pump));
        pump();
      }
    });
  }

  _downloadAnnotations(evt) {
    const mediaParams = new URLSearchParams();
    if (evt.detail) {
      if (evt.detail.mediaIds) {
        mediaParams.append("media_id", evt.detail.mediaIds);
      }
    }
    const params = joinParams(mediaParams, this._sectionParams());
    const getUrl = endpoint => {
      return `/rest/${endpoint}/${this._project}?`;
    };
    const mediaUrl = `/rest/Medias/${this._project}?${params.toString()}`;
    const fileStream = streamSaver.createWriteStream(this._sectionName + ".zip");
    let mediaTypes = null;
    let mediaFetcher = null;
    let mediaDone = false;
    let localizationTypes = null;
    let localizationFetcher = null;
    let localizationsDone = false;
    let stateTypes = null;
    let stateFetcher = null;
    let statesDone = false;
    const headers = {
      "X-CSRFToken": getCookie("csrftoken"),
      "Content-Type": "application/json"
    };
    Number.prototype.pad = function(size) {
      var s = String(this);
      while (s.length < (size || 2)) {s = "0" + s;}
      return s;
    }
    const project = this._project;
    const readableZipStream = new ZIP({
      async pull(ctrl) {

        // Function for dumping types to file.
        const getTypes = (endpoint, fname) => {
          return fetchRetry(`/rest/${endpoint}/${project}`, {
            method: "GET",
            credentials: "same-origin",
            headers: headers,
          })
          .then(response => {
            const clone = response.clone();
            const stream = () => response.body;
            const name = fname;
            ctrl.enqueue({name, stream});
            return clone.json();
          });
        };

        // Function for dumping single batch of metadata to file.
        const getMetadataBatch = async (baseUrl, type, batchSize, batchNum,
                                        baseFilename, lastId, idQuery) => {
          let url = baseUrl + "&type=" + type.id + "&stop=" + batchSize;
          if (lastId != null) {
            url += "&after=" + encodeURIComponent(lastId);
          }

          let request;
          if (idQuery != null) {
            request = {
              method: "PUT",
              credentials: "same-origin",
              headers: headers,
              body: JSON.stringify(idQuery),
            };
          } else {
            request = {
              method: "GET",
              credentials: "same-origin",
              headers: headers,
            };
          }

          // Fetch csv data first.
          await fetchRetry(url + "&format=csv", request)
          .then(response => {
            const stream = () => response.body;
            const batch_str = "__batch_" + Number(batchNum).pad(5);
            const name = baseFilename + type.name + batch_str + ".csv";
            ctrl.enqueue({name, stream});
          });

          // Fetch and return json data.
          return fetchRetry(url, request)
          .then(response => {
            const clone = response.clone();
            const stream = () => response.body;
            const batch_str = "__batch_" + Number(batchNum).pad(5);
            const name = baseFilename + type.name + batch_str + ".json";
            ctrl.enqueue({name, stream});
            return clone.json();
          });
        };

        // Class for fetching batches of metadata.
        class MetadataFetcher {
          constructor(types, baseUrl, baseFilename, lastField) {
            this._types = types;
            this._baseUrl = baseUrl;
            this._baseFilename = baseFilename;
            this._lastField = lastField;
            this._batchNum = 0;
            this._lastId = null;
            this._typeIndex = 0;
            this._batchSize = 1000;
            this.ids = []; // Accumulation of retrieved IDs
          }

          async next(idQuery) {
            // Fetches next batch of metadata, iterating over types. Returns
            // whether all metadata has been fetched.
            let done = false;
            if (this._types.length == 0) {
              done = true;
            } else {
              const entities = await getMetadataBatch(
                this._baseUrl,
                this._types[this._typeIndex],
                this._batchSize,
                this._batchNum,
                this._baseFilename,
                this._lastId,
                idQuery,
              )
              this._batchNum++;
              if (entities.length == 0) {
                this._typeIndex++;
                if (this._typeIndex == this._types.length) {
                  done = true;
                } else {
                  this._batchNum = 0;
                  this._lastId = null;
                }
              } else {
                this._lastId = entities[entities.length - 1][this._lastField];
                this.ids.push.apply(this.ids, entities.map(entity => entity.id));
              }
            }
            return done;
          }
        }

        if (mediaTypes == null) {
          // Get media types.
          mediaTypes = await getTypes("MediaTypes", "media_types.json");
          mediaFetcher = new MetadataFetcher(mediaTypes, mediaUrl, "medias__", "name");
        }
        else if (localizationTypes == null) {
          // Get localization types.
          const localizationsUrl = getUrl("Localizations");
          localizationTypes = await getTypes("LocalizationTypes", "localization_types.json");
          localizationFetcher = new MetadataFetcher(localizationTypes, localizationsUrl,
                                                    "localizations__", "id");
        }
        else if (stateTypes == null) {
          // Get state types.
          const statesUrl = getUrl("States");
          stateTypes = await getTypes("StateTypes", "state_types.json");
          stateFetcher = new MetadataFetcher(stateTypes, statesUrl, "states__", "id");
        }
        else if (mediaDone == false) {
          // Get next batch of media metadata.
          mediaDone = await mediaFetcher.next();
        }
        else if (localizationsDone == false) {
          // Get next batch of localization metadata.
          localizationsDone = await localizationFetcher.next({media_ids: mediaFetcher.ids});
        }
        else if (statesDone == false) {
          // Get next batch of state metadata.
          statesDone = await stateFetcher.next({media_ids: mediaFetcher.ids});
        }
        else {
          // Close the zip file.
          ctrl.close();
        }
      }
    });
    if (window.WritableStream && readableZipStream.pipeTo) {
      readableZipStream.pipeTo(fileStream);
    } else {
      const writer = fileStream.getWriter();
      const reader = readableZipStream.getReader();
      const pump = () => reader.read()
        .then(res => res.done ? writer.close() : writer.write(res.value).then(pump));
      pump();
    }
  }

  _rename(evt) {
    if (this._name.contains(this._nameText)) {
      const input = document.createElement("input");
      input.setAttribute("class", "form-control input-sm f1");
      input.setAttribute("value", this._sectionName);
      this._name.replaceChild(input, this._nameText);
      input.addEventListener("focus", evt => {
        evt.target.select();
      });
      input.addEventListener("keydown", evt => {
        if (evt.keyCode == 13) {
          evt.preventDefault();
          input.blur();
        }
      });
      input.addEventListener("blur", evt => {
        if (evt.target.value !== "") {
          //this._worker.postMessage({
          //  command: "renameSection",
          //  fromName: this._sectionName,
          //  toName: evt.target.value,
          //});
          this._sectionName = evt.target.value;
        }
        fetch("/rest/Section/" + this._section.id, {
          method: "PATCH",
          credentials: "same-origin",
          headers: {
            "X-CSRFToken": getCookie("csrftoken"),
            "Accept": "application/json",
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            "name": this._sectionName
          }),
        });
        this._nameText.textContent = this._sectionName;
        this._section.name = this._sectionName;
        this._name.replaceChild(this._nameText, evt.target);
        this.dispatchEvent(new CustomEvent("newName", {
          detail: {
            id: this._section.id,
            sectionName: this._sectionName,
          },
        }));
      });
      input.focus();
    }
  }

  _setPage(evt) {
    this._start = evt.detail.start;
    this._stop = evt.detail.stop;
    this._loadMedia();
  }

  _findAfters() {
    // Find the media for each batch of 10000 medias.
  }

  _setCallbacks() {

    // launch algorithm on all the media in this section
    this._more.addEventListener("algorithmMenu", this._launchAlgorithm.bind(this));

    this._more.addEventListener("download", this._downloadFiles.bind(this));

    this._more.addEventListener("downloadAnnotations", this._downloadAnnotations.bind(this));
    this._files.addEventListener("downloadAnnotations", this._downloadAnnotations.bind(this));

    this._more.addEventListener("rename", this._rename.bind(this));

    this._more.addEventListener("deleteSection", evt => {
      this.dispatchEvent(new CustomEvent("remove", {
        detail: {
          sectionParams: this._sectionParams(),
          section: this._section,
          projectId: this._project,
          deleteMedia: false,
        }
      }));
    });

    this._more.addEventListener("deleteMedia", evt => {
      this.dispatchEvent(new CustomEvent("remove", {
        detail: {
          sectionParams: this._sectionParams(),
          section: this._section,
          projectId: this._project,
          deleteMedia: true,
        }
      }));
    });

    this._paginator.addEventListener("selectPage", this._setPage.bind(this));

    this._reload.addEventListener("click", this.reload.bind(this));
  }
}

customElements.define("media-section", MediaSection);
