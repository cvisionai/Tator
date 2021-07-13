class ProjectDetail extends TatorPage {
  constructor() {
    super();

    window._uploader = new Worker("/static/js/tasks/upload-worker.js");

    const main = document.createElement("main");
    main.setAttribute("class", "d-flex");
    this._shadow.appendChild(main);

    const section = document.createElement("section");
    section.setAttribute("class", "sections-wrap py-6 px-5 col-3 text-gray");
    main.appendChild(section);

    const folderHeader = document.createElement("div");
    folderHeader.setAttribute("class", "d-flex flex-justify-between flex-items-center py-4");
    section.appendChild(folderHeader);

    const folderText = document.createElement("h2");
    folderText.setAttribute("class", "h3 text-semibold");
    folderText.textContent = "Library";
    folderHeader.appendChild(folderText);

    const addFolderButton = document.createElement("button");
    addFolderButton.setAttribute("class", "px-0 f2 btn-clear text-gray hover-text-white");
    folderHeader.appendChild(addFolderButton);

    const addFolderSpan = document.createElement("span");
    addFolderSpan.setAttribute("class", "f1 px-1");
    addFolderSpan.textContent = "+";
    addFolderButton.appendChild(addFolderSpan);

    const addFolderText = document.createTextNode("Add folder");
    addFolderButton.appendChild(addFolderText);

    this._folders = document.createElement("ul");
    this._folders.setAttribute("class", "sections");
    section.appendChild(this._folders);

    const archivedFoldersButton = document.createElement("button");
    archivedFoldersButton.setAttribute("class", "collapsible px-0 f2 btn-clear text-gray hover-text-white py-4");
    section.appendChild(archivedFoldersButton);

    const archivedFolderText = document.createElement("h2");
    archivedFolderText.setAttribute("class", "h3 text-semibold");
    archivedFolderText.textContent = "Archived Folders";
    archivedFoldersButton.appendChild(archivedFolderText);

    this._archivedFolders = document.createElement("ul");
    this._archivedFolders.setAttribute("class", "content sections");
    this._archivedFolders.style.display = "none";
    section.appendChild(this._archivedFolders);

    const savedSearchHeader = document.createElement("div");
    savedSearchHeader.setAttribute("class", "d-flex flex-justify-between flex-items-center py-4");
    section.appendChild(savedSearchHeader);

    const savedSearchText = document.createElement("h2");
    savedSearchText.setAttribute("class", "h3 text-semibold");
    savedSearchText.textContent = "Saved Searches";
    savedSearchHeader.appendChild(savedSearchText);

    this._addSavedSearchButton = document.createElement("button");
    this._addSavedSearchButton.setAttribute("class", "px-0 f2 btn-clear text-gray hover-text-white");
    this._addSavedSearchButton.style.opacity = 0.5;
    this._addSavedSearchButton.style.cursor = "not-allowed";
    savedSearchHeader.appendChild(this._addSavedSearchButton);

    const addSavedSearchSpan = document.createElement("span");
    addSavedSearchSpan.setAttribute("class", "f1 px-1");
    addSavedSearchSpan.textContent = "+";
    this._addSavedSearchButton.appendChild(addSavedSearchSpan);

    const addSavedSearchText = document.createTextNode("Add current search");
    this._addSavedSearchButton.appendChild(addSavedSearchText);

    this._savedSearches = document.createElement("ul");
    this._savedSearches.setAttribute("class", "sections");
    section.appendChild(this._savedSearches);

    const bookmarkHeader = document.createElement("div");
    bookmarkHeader.setAttribute("class", "d-flex flex-justify-between flex-items-center py-4");
    section.appendChild(bookmarkHeader);

    const bookmarkText = document.createElement("h2");
    bookmarkText.setAttribute("class", "h3 text-semibold");
    bookmarkText.textContent = "Bookmarks";
    bookmarkHeader.appendChild(bookmarkText);

    this._bookmarks = document.createElement("ul");
    this._bookmarks.setAttribute("class", "sections");
    section.appendChild(this._bookmarks);

    const mainSection = document.createElement("section");
    mainSection.setAttribute("class", "project__main py-3 px-6 flex-grow");
    main.appendChild(mainSection);

    const div = document.createElement("div");
    div.setAttribute("class", "py-6");
    mainSection.appendChild(div);

    const header = document.createElement("div");
    header.setAttribute("class", "main__header d-flex flex-justify-between");
    div.appendChild(header);

    const nameDiv = document.createElement("div");
    nameDiv.setAttribute("class", "d-flex flex-row flex-items-center");
    header.appendChild(nameDiv);

    const h1 = document.createElement("h1");
    h1.setAttribute("class", "h1");
    nameDiv.appendChild(h1);

    this._settingsButton = document.createElement("a");
    this._settingsButton.setAttribute("class", "px-2 h2 text-gray hover-text-white");
    this._settingsButton.style.marginTop = "6px";
    nameDiv.appendChild(this._settingsButton);

    const settingsSvg = document.createElementNS(svgNamespace, "svg");
    settingsSvg.setAttribute("viewBox", "0 0 24 24");
    settingsSvg.setAttribute("height", "1em");
    settingsSvg.setAttribute("width", "1em");
    this._settingsButton.appendChild(settingsSvg);

    const settingsPath = document.createElementNS(svgNamespace, "use");
    settingsPath.setAttribute("href", "/static/images/svg/gear.svg#path");
    settingsSvg.appendChild(settingsPath);

    this._projectText = document.createTextNode("");
    h1.appendChild(this._projectText);

    const buttons = document.createElement("div");
    buttons.setAttribute("class", "d-flex");
    header.appendChild(buttons);

    this._analyticsButton = document.createElement("analytics-button");
    this._analyticsButton.style.marginRight = "10px";
    buttons.appendChild(this._analyticsButton);

    this._activityButton = document.createElement("activity-button");
    buttons.appendChild(this._activityButton);

    this._description = document.createElement("project-text");
    div.appendChild(this._description);

    const subheader = document.createElement("div");
    subheader.setAttribute("class", "d-flex flex-justify-between");
    mainSection.appendChild(subheader);

    this._search = document.createElement("project-search");
    subheader.appendChild(this._search);

    this._collaborators = document.createElement("project-collaborators");
    subheader.appendChild(this._collaborators);

    this._projects = document.createElement("div");
    mainSection.appendChild(this._projects);

    this._mediaSection = document.createElement("media-section");
    this._projects.appendChild(this._mediaSection);
    this._mediaSection.addEventListener("runAlgorithm", this._openConfirmRunAlgoModal.bind(this));

    this._confirmRunAlgorithm = document.createElement("confirm-run-algorithm");
    this._projects.appendChild(this._confirmRunAlgorithm);
    this._confirmRunAlgorithm.addEventListener("close", this._closeConfirmRunAlgoModal.bind(this));

    const deleteSection = document.createElement("delete-section-form");
    this._projects.appendChild(deleteSection);

    const deleteFile = document.createElement("delete-file-form");
    this._projects.appendChild(deleteFile);

    this._modalNotify = document.createElement("modal-notify");
    this._projects.appendChild(this._modalNotify);

    const cancelJob = document.createElement("cancel-confirm");
    this._shadow.appendChild(cancelJob);

    const newSectionDialog = document.createElement("name-dialog");
    this._projects.appendChild(newSectionDialog);

    const uploadDialog = document.createElement("upload-dialog");
    this._projects.appendChild(uploadDialog);

    const attachmentDialog = document.createElement("attachment-dialog");
    this._projects.appendChild(attachmentDialog);

    this._activityNav = document.createElement("activity-nav");
    main.appendChild(this._activityNav);

    this._leaveConfirmOk = false;

    window.addEventListener("beforeunload", evt => {
      if (this._leaveConfirmOk) {
        evt.preventDefault();
        evt.returnValue = '';
        window.alert("Uploads are in progress. Still leave?");
      }
    });

    addFolderButton.addEventListener("click", evt => {
      newSectionDialog.init("Add Folder", "folder");
      newSectionDialog.setAttribute("is-open", "");
      this.setAttribute("has-open-modal", "");
    });

    archivedFoldersButton.addEventListener("click", evt => {
      this.classList.toggle("active");
      const content = this._archivedFolders
      if (content.style.display === "block") {
        content.style.display = "none";
      } else {
        content.style.display = "block";
      }
    });

    this._addSavedSearchButton.addEventListener("click", evt => {
      if (this._addSavedSearchButton.style.cursor == "pointer") {
        newSectionDialog.init("Save current search", "savedSearch");
        newSectionDialog.setAttribute("is-open", "");
        this.setAttribute("has-open-modal", "");
      }
    });

    newSectionDialog.addEventListener("close", async evt => {
      if (newSectionDialog._confirm) {
        let spec;
        if (newSectionDialog._sectionType == "folder") {
          spec = {name: newSectionDialog._input.value,
                  tator_user_sections: uuidv1(),
                  visible: true};
        } else if (newSectionDialog._sectionType == "savedSearch") {
          spec = {visible: true};

          // Check if an existing section is selected.
          const params = new URLSearchParams(document.location.search.substring(1));
          if (params.has("section")) {
            const sectionId = Number(params.get("section"));
            await fetch(`/rest/Section/${sectionId}`, {
              method: "GET",
              credentials: "same-origin",
              headers: {
                "X-CSRFToken": getCookie("csrftoken"),
                "Accept": "application/json",
                "Content-Type": "application/json"
              },
            })
            .then(response => response.json())
            .then(section => {spec = section;});
          }
          spec.name = newSectionDialog._input.value;
          if (params.has("search")) {
            if (spec.lucene_search) {
              spec.lucene_search = `(${spec.lucene_search}) AND (${params.get("search")})`;
            } else {
              spec.lucene_search = params.get("search");
            }
          }
          delete spec.id;
          if (spec.annotation_bools === null) {
            delete spec.annotation_bools;
          }
          if (spec.media_bools === null) {
            delete spec.media_bools;
          }
          if (spec.tator_user_sections === null) {
            delete spec.tator_user_sections;
          }
        } else if (newSectionDialog._sectionType == "playlist") {
          //TODO: Handle adding playlist
        }
        const projectId = Number(this.getAttribute("project-id"));
        fetch(`/rest/Sections/${projectId}`, {
          method: "POST",
          credentials: "same-origin",
          headers: {
            "X-CSRFToken": getCookie("csrftoken"),
            "Accept": "application/json",
            "Content-Type": "application/json"
          },
          body: JSON.stringify(spec),
        })
        .then(response => response.json())
        .then(section => {
          const card = document.createElement("section-card");
          const sectionObj = {id: section.id,
                              project: projectId,
                              ...spec};
          if (newSectionDialog._sectionType == "folder") {
            card.init(sectionObj, "folder");
            if (sectionObj.visible) {
              this._folders.appendChild(card);
            } else {
              this._archivedFolders.appendChild(card);
            }
            card.addEventListener("click", () => {
              this._selectSection(sectionObj, projectId);
              for (const child of this._allSections()) {
                child.active = false;
              }
              card.active = true;
            });
            card.addEventListener("visibilityChange", evt => {
              this._sectionVisibilityEL(evt)
            });
          } else if (newSectionDialog._sectionType == "savedSearch") {
            card.init(sectionObj, "savedSearch");
            this._savedSearches.appendChild(card);
            card.addEventListener("click", () => {
              this._selectSection(sectionObj, projectId);
              for (const child of this._allSections()) {
                child.active = false;
              }
              card.active = true;
            });
          }
        });
      }
      this.removeAttribute("has-open-modal");
    });

    this._mediaSection.addEventListener("filesadded", evt => {
      this._leaveConfirmOk = true;
      uploadDialog.setTotalFiles(evt.detail.numStarted);
      uploadDialog.setAttribute("is-open", "");
      this.setAttribute("has-open-modal", "");
    });

    uploadDialog.addEventListener("cancel", evt => {
      window._uploader.postMessage({command: "cancelUploads"});
      this.removeAttribute("has-open-modal");
    });

    uploadDialog.addEventListener("close", evt => {
      this.removeAttribute("has-open-modal");
    });

    window._uploader.addEventListener("message", evt => {
      const msg = evt.data;
      if (msg.command == "uploadProgress") {
        uploadDialog.setProgress(msg.percent, `Uploading ${msg.filename}`);
      } else if (msg.command == "uploadDone") {
        uploadDialog.uploadFinished();
      } else if (msg.command == "uploadFailed") {
        uploadDialog.addError(`Failed to upload ${msg.filename}`);
      } else if (msg.command == "allUploadsDone") {
        this._leaveConfirmOk = false;
      }
    });

    this._mediaSection.addEventListener("attachments", evt => {
      attachmentDialog.init(evt.detail);
      attachmentDialog.setAttribute("is-open", "");
      this.setAttribute("has-open-modal", "");
    });

    attachmentDialog.addEventListener("close", evt => {
      this.removeAttribute("has-open-modal");
    });

    this._mediaSection.addEventListener("newName", evt => {
      for (const child of this._allSections()) {
        if (child._section) {
          if (child._section.id == evt.detail.id) {
            child.rename(evt.detail.sectionName);
          }
        }
      }
    });

    this._activityButton.addEventListener("click", () => {
      this._activityNav.open();
      this._activityNav.reload();
      this.setAttribute("has-open-modal", "");
    });

    this._activityNav.addEventListener("close", evt => {
      this.removeAttribute("has-open-modal", "");
    });

    this._activityNav.addEventListener("deleteJobs", evt => {
      cancelJob.init(evt.detail.uid, evt.detail.gid, this.getAttribute("project-id"));
      cancelJob.setAttribute("is-open", "");
    });

    this._removeCallback = evt => {
      deleteSection.init(evt.detail.projectId, evt.detail.section, evt.detail.sectionParams,
                         evt.detail.deleteMedia);
      deleteSection.setAttribute("is-open", "");
      this.setAttribute("has-open-modal", "");
    };

    deleteSection.addEventListener("close", evt => {
      this.removeAttribute("has-open-modal", "");
    });

    deleteSection.addEventListener("confirmDelete", evt => {
      for (const child of this._allSections()) {
        if (child._section) {
          if (child._section.id == evt.detail.id) {
            child.parentNode.removeChild(child);
            this._folders.children[0].click();
          }
        }
      }
      deleteSection.removeAttribute("is-open");
      this.removeAttribute("has-open-modal", "");
    });

    this._deleteFileCallback = evt => {
      deleteFile.setAttribute("media-id", evt.detail.mediaId);
      deleteFile.setAttribute("media-name", evt.detail.mediaName);
      deleteFile.setAttribute("is-open", "");
      this.setAttribute("has-open-modal", "");
    };

    deleteFile.addEventListener("close", evt => {
      this.removeAttribute("has-open-modal", "");
    });

    deleteFile.addEventListener("confirmFileDelete", evt => {
      this._mediaSection.removeMedia(evt.detail.mediaId);
      deleteFile.removeAttribute("is-open");
      this.removeAttribute("has-open-modal", "");
    });

    this._modalNotify.addEventListener("close", evt => {
      this.removeAttribute("has-open-modal", "");
    });

    this._newAlgorithmCallback = evt => {
      const newAlgorithm = document.createElement("new-algorithm-form");
      this._projects.appendChild(newAlgorithm);
      newAlgorithm.setAttribute("is-open", "");
      this.setAttribute("has-open-modal", "");
      newAlgorithm.addEventListener("close", evt => {
        this.removeAttribute("has-open-modal", "");
        this._projects.removeChild(evt.target);
      });
    };

    cancelJob.addEventListener("confirmGroupCancel", () => {
      cancelJob.removeAttribute("is-open");
    });

    cancelJob.addEventListener("close", () => {
      this.removeAttribute("has-open-modal");
    });

    this._loaded = 0;
    this._needScroll = true;

    this._lastQuery = (this._search.value == "" ? null : this._search.value);
    this._search.addEventListener("filterProject", evt => {
      const query = evt.detail.query;
      if (query != this._lastQuery) {
        if (query) {
          this._lastQuery = query;
          this._addSavedSearchButton.style.opacity = 1.0;
          this._addSavedSearchButton.style.cursor = "pointer";
        } else if (query == "") {
          this._lastQuery = null;
          this._addSavedSearchButton.style.opacity = 0.5;
          this._addSavedSearchButton.style.cursor = "not-allowed";
        }
        this._mediaSection.searchString = this._lastQuery;
        this._mediaSection.reload();
      }
    });
  }

  static get observedAttributes() {
    return ["project-id", "token"].concat(TatorPage.observedAttributes);
  }

  _sectionVisibilityEL(evt) {
    const section = evt.detail.section;
    const id = section.id;
    const visible = section.visible;

    // Remove section from current list
    for (const child of this._allSections()) {
      if (child._section) {
        if (child._section.id == id) {
          child.parentNode.removeChild(child);
          break;
        }
      }
    }

    // Create new section card and add to new list
    const card = document.createElement("section-card");
    card.init(section, "folder");
    if (visible) {
      this._folders.appendChild(card);
    } else {
      this._archivedFolders.appendChild(card);
    }
    card.addEventListener("visibilityChange", evt => {
      this._sectionVisibilityEL(evt)
    });
    card.addEventListener("click", () => {
      this._selectSection(section, section.project);
      for (const child of this._allSections()) {
        child.active = false;
      }
      card.active = true;
    });
  }

  _allSections() {
    const folders = Array.from(this._folders.children);
    const hiddenFolders = Array.from(this._archivedFolders.children);
    const savedSearches = Array.from(this._savedSearches.children);
    return folders.concat(savedSearches).concat(hiddenFolders);
  }

  _notify(title, message, error_or_ok) {
    this._modalNotify.init(title, message, error_or_ok);
    this._modalNotify.setAttribute("is-open", "");
    this.setAttribute("has-open-modal", "");
  }

  _init() {
    const projectId = this.getAttribute("project-id");
    this._settingsButton.setAttribute("href", `/${projectId}/project-settings`);
    this._activityNav.init(projectId);
    // Get info about the project.
    const projectPromise = fetch("/rest/Project/" + projectId, {
      method: "GET",
      credentials: "same-origin",
      headers: {
        "X-CSRFToken": getCookie("csrftoken"),
        "Accept": "application/json",
        "Content-Type": "application/json"
      }
    });
    const sectionPromise = fetch("/rest/Sections/" + projectId, {
      method: "GET",
      credentials: "same-origin",
      headers: {
        "X-CSRFToken": getCookie("csrftoken"),
        "Accept": "application/json",
        "Content-Type": "application/json"
      }
    });
    const bookmarkPromise = fetch("/rest/Bookmarks/" + projectId, {
      method: "GET",
      credentials: "same-origin",
      headers: {
        "X-CSRFToken": getCookie("csrftoken"),
        "Accept": "application/json",
        "Content-Type": "application/json"
      }
    });
    const algoPromise = fetch("/rest/Algorithms/" + projectId, {
      method: "GET",
      credentials: "same-origin",
      headers: {
        "X-CSRFToken": getCookie("csrftoken"),
        "Accept": "application/json",
        "Content-Type": "application/json"
      }
    });
    Promise.all([
      projectPromise,
      sectionPromise,
      bookmarkPromise,
      algoPromise,
    ])
    .then(([projectResponse, sectionResponse, bookmarkResponse, algoResponse]) => {
      const projectData = projectResponse.json();
      const sectionData = sectionResponse.json();
      const bookmarkData = bookmarkResponse.json();
      const algoData = algoResponse.json();
      Promise.all([projectData, sectionData, bookmarkData, algoData])
      .then(([project, sections, bookmarks, algos]) => {
        // First hide algorithms if needed. These are not appropriate to be
        // run at the project/section/media level.
        const hiddenAlgos = ['tator_extend_track', 'tator_fill_track_gaps'];
        const parsedAlgos = algos.filter(function(alg) {
          return !hiddenAlgos.includes(alg.name);
        });
        if (!hasPermission(project.permission, "Full Control")) {
          this._settingsButton.style.display = "none";
        }
        this._algorithms = parsedAlgos;
        this._mediaSection.project = project;
        this._mediaSection.algorithms = this._algorithms;
        this._projectText.nodeValue = project.name;
        this._search.setAttribute("project-name", project.name);
        this._description.setAttribute("text", project.summary);
        this._collaborators.usernames = project.usernames;
        this._search.autocomplete = project.filter_autocomplete;
        let projectParams = null;
        const home = document.createElement("section-card");
        home.init(null, false);
        home.addEventListener("click", () => {
          this._selectSection(null, projectId);
          for (const child of this._allSections()) {
            child.active = false;
          }
          home.active = true;
        });
        this._folders.appendChild(home);
        for (const section of sections) {
          const hasSection = Boolean(section.tator_user_sections);
          const hasSearch = (Boolean(section.lucene_search)
                             || Boolean(section.media_bools)
                             || Boolean(section.annotation_bools));
          let sectionType;
          if (hasSection && !hasSearch) {
            sectionType = "folder";
          } else {
            sectionType = "savedSearch";
          }
          const card = document.createElement("section-card");
          card.init(section, sectionType);
          if (sectionType == "folder") {
            if (section.visible) {
              this._folders.appendChild(card);
            } else {
              this._archivedFolders.appendChild(card);
            }
            card.addEventListener("visibilityChange", evt => {
              this._sectionVisibilityEL(evt)
            });
          } else {
            this._savedSearches.appendChild(card);
          }
          card.addEventListener("click", () => {
            this._selectSection(section, projectId);
            for (const child of this._allSections()) {
              child.active = false;
            }
            card.active = true;
          });
        }
        // Put "Last visited" bookmark on top
        const first = "Last visited";
        bookmarks.sort((a, b) => {return a.name == first ? -1 : b.name == first ? 1 : 0;});
        for (const bookmark of bookmarks) {
          const card = document.createElement("section-card");
          card.init(bookmark, "bookmark");
          this._bookmarks.appendChild(card);
        }
        const params = new URLSearchParams(document.location.search.substring(1));
        if (params.has("search")) {
          this._mediaSection.searchString = params.get("search");
          this._addSavedSearchButton.style.opacity = 1.0;
          this._addSavedSearchButton.style.cursor = "pointer";
        }
        if (params.has("section")) {
          const sectionId = Number(params.get("section"));
          for (const child of this._allSections()) {
            if (child._section) {
              if (child._section.id == sectionId) {
                child.click();
                break;
              }
            }
          }
        } else {
          home.click();
        }
      });
    });
  }

  attributeChangedCallback(name, oldValue, newValue) {
    TatorPage.prototype.attributeChangedCallback.call(this, name, oldValue, newValue);
    switch (name) {
      case "username":
        break;
      case "project-id":
        this._analyticsButton.setAttribute("project-id", newValue);
        this._init();
        break;
      case "token":
        break;
    }
  }

  _selectSection(section, projectId) {
    this._mediaSection.init(projectId, section, this.getAttribute("username"),
                            this.getAttribute("token"));
    this._mediaSection.addEventListener("remove", this._removeCallback);
    this._mediaSection.addEventListener("deleteFile", this._deleteFileCallback);
    this._mediaSection.addEventListener("newAlgorithm", this._newAlgorithmCallback);
    let params = new URLSearchParams(document.location.search.substring(1));
    params.delete("section");
    if (section !== null) {
      params.set("section", section.id);
    }
    const path = document.location.pathname;
    const searchArgs = params.toString();
    let newUrl = path;
    newUrl += "?" + searchArgs;
    let sectionName = "All Media";
    if (section !== null) {
      sectionName = section.name;
    }
    window.history.replaceState(`${this._projectText.textContent}|${sectionName}`, "Filter", newUrl);
  }

  /**
   * Callback when user clicks on an algorithm button.
   * This launches the confirm run algorithm modal window.
   */
  _openConfirmRunAlgoModal(evt) {

    if ('mediaIds' in evt.detail)
    {
      this._confirmRunAlgorithm.init(
        evt.detail.algorithmName, evt.detail.projectId, evt.detail.mediaIds, null);
    }
    else
    {
      this._confirmRunAlgorithm.init(
        evt.detail.algorithmName, evt.detail.projectId, null, evt.detail.mediaQuery);
    }

    this._confirmRunAlgorithm.setAttribute("is-open","");
    this.setAttribute("has-open-modal", "");
    document.body.classList.add("shortcuts-disabled");
  }

  /**
   * Callback from confirm run algorithm modal choice
   */
  _closeConfirmRunAlgoModal(evt) {

    this._confirmRunAlgorithm.removeAttribute("is-open");
    this.removeAttribute("has-open-modal");
    document.body.classList.remove("shortcuts-disabled");

    var that = this;
    if (evt.detail.confirm)
    {
      if (evt.detail.mediaIds != null)
      {
        var body = JSON.stringify({
          "algorithm_name": evt.detail.algorithmName,
          "media_ids": evt.detail.mediaIds
        });
      }
      else
      {
        var body = JSON.stringify({
          "algorithm_name": evt.detail.algorithmName,
          "media_query": evt.detail.mediaQuery
        });
      }

      fetch("/rest/AlgorithmLaunch/" + evt.detail.projectId, {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "X-CSRFToken": getCookie("csrftoken"),
          "Accept": "application/json",
          "Content-Type": "application/json"
        },
        body: body,
      })
      .then(response => {
        if (response.status == 201) {
          that._notify("Algorithm launched!",
                       `Successfully launched ${evt.detail.algorithmName}! Monitor progress by clicking the "Activity" button.`,
                       "ok");
        }
        else {
          that._notify("Error launching algorithm!",
                      `Failed to launch ${evt.detail.algorithmName}: ${response.statusText}.`,
                      "error");
        }
        return response.json();
      })
      .then(data => console.log(data));
    }
  }
}

customElements.define("project-detail", ProjectDetail);
