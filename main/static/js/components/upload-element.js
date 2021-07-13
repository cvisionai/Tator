class UploadElement extends TatorElement {
  constructor() {
    super();
    this._fileSelectCallback = this._fileSelectCallback.bind(this);
    this._haveNewSection = false;
  }

  static get observedAttributes() {
    return ["project-id", "username", "token", "section"];
  }

  attributeChangedCallback(name, oldValue, newValue) {
    if (name === "project-id") {
      // Get all media types for this project.
      fetch("/rest/MediaTypes/" + newValue, {
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
        this._mediaTypes = data;
      });
    }
    else if (name === "username") {
      this._username = newValue;
    }
    else if (name === "token") {
      this._token = newValue;
    }
    else if (name === "section") {
      this._section = newValue;
    }
  }

  set worker(val) {
    this._worker = val;
    this._worker.addEventListener("message", evt => {
      const msg = evt.data;
      if (msg.command == "newUploadSection") {
        this._newSectionName = msg.sectionName;
        this._haveNewSection = true;
      }
    });
  }

  _checkFile(file, gid) {
    // File extension can have multiple components in archives
    let comps = file.name.split(".").slice(-1);
    let ext = comps.join('.'); // rejoin extension

    const isImage = ext.match(/(tiff|tif|bmp|jpe|jpg|jpeg|png|gif)$/i);
    const isVideo = ext.match(/(mp4|avi|3gp|ogg|wmv|webm|flv|mkv|mov|mts)$/i);
    const isArchive = ext.match(/^(zip|tar)/i);
    for (let idx = 0; idx < this._mediaTypes.length; idx++) {
      // TODO: It is possible for users to define two media types with
      // the same extension, in which case we might be uploading to the
      // wrong media type.
      const mediaType = this._mediaTypes[idx];
      let fileOk = false;
      if (mediaType.file_format === null) {
        if (mediaType.dtype == "image" && isImage) {
          fileOk = true;
        } else if (mediaType.dtype == "video" && isVideo) {
          fileOk = true;
        }
      } else {
        fileOk = ext.toLowerCase() === mediaType.file_format.toLowerCase();
        if (isArchive)
        {
          fileOk = true;
        }
      }

      if (fileOk) {
        this._messages.push({
          "command": "addUpload",
          "file": file,
          "gid": gid,
          "username": this._username,
          "projectId": this.getAttribute("project-id"),
          "mediaTypeId": (isArchive ? -1 : mediaType.id),
          "section": this._section,
          "token": this._token,
          "isImage": isImage,
          "isArchive": isArchive
        });
        return true;
      }
    }
    return false;
  }

  // Iterates through items from drag and drop or file select
  // event and sends them to the upload worker.
  async _fileSelectCallback(ev) {
    // Prevent browser default behavior.
    ev.preventDefault();

    // Send immediate notification of adding files.
    this.dispatchEvent(new Event("addingfiles", {composed: true}));

    // Messages to send to service worker.
    this._messages = [];

    // Set a group ID on the upload.
    const gid = uuidv1();

    // Get main page.
    const page = document.getElementsByTagName("project-detail")[0];

    // Show loading gif.
    const loading = document.createElement("img");
    loading.setAttribute("class", "loading");
    loading.setAttribute("src", "/static/images/tator_loading.gif");
    page._projects.appendChild(loading);
    page.setAttribute("has-open-modal", "");

    let numSkipped = 0;
    let numStarted = 0;
    let totalFiles = 0;
    let totalSize = 0;
    if (typeof ev.dataTransfer === "undefined") {
      const files = ev.target.files;
      totalFiles = files.length;
      for (const file of files) {
        const added = this._checkFile(file, gid);
        if (added) { numStarted++; } else { numSkipped++; }
      }
    } else {
      const items = await getAllFileEntries(ev.dataTransfer.items);
      for (const item of items) {
        if (item.isFile) {
          totalFiles++;
          item.file(file => {
            const added = this._checkFile(file, gid);
            if (added) {
              numStarted++;
              totalSize += file.size;
            } else {
              numSkipped++;
            }
          });
        }
      }
    }
    while (numSkipped + numStarted < totalFiles) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    // Remove loading gif.
    page._projects.removeChild(loading);
    page.removeAttribute("has-open-modal", "");

    // If upload is big throw up a warning.
    if (totalSize > 60000000000 || numStarted > 5000) {
      const bigUpload = document.createElement("big-upload-form");
      const page = document.getElementsByTagName("project-detail")[0];
      page._projects.appendChild(bigUpload);
      bigUpload.setAttribute("is-open", "");
      page.setAttribute("has-open-modal", "");
      bigUpload.addEventListener("close", evt => {
        page.removeAttribute("has-open-modal", "");
        page._projects.removeChild(bigUpload);
      });
      while (bigUpload.hasAttribute("is-open")) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      if (!bigUpload._confirm) {
        page._leaveConfirmOk = false;
        return;
      }
    }

    // If no files were started, notify the user.
    if (numStarted == 0 && totalFiles > 0) {
      page._notify("Invalid files!",
                   "No files were added! Make sure selected files are valid for this project.",
                   "error");
    } else if (numStarted > 0) {
      this.dispatchEvent(new CustomEvent("filesadded", {
        detail: {numSkipped: numSkipped, numStarted: numStarted},
        composed: true
      }));
      for (const msg of this._messages) {
        window._uploader.postMessage(msg);
      }
    }
  }
}

// Drop handler function to get all files
async function getAllFileEntries(dataTransferItemList) {
  let fileEntries = [];
  // Use BFS to traverse entire directory/file structure
  let queue = [];
  // Unfortunately dataTransferItemList is not iterable i.e. no forEach
  for (let i = 0; i < dataTransferItemList.length; i++) {
    queue.push(dataTransferItemList[i].webkitGetAsEntry());
  }
  while (queue.length > 0) {
    let entry = queue.shift();
    if (entry.isFile) {
      fileEntries.push(entry);
    } else if (entry.isDirectory) {
      let reader = entry.createReader();
      queue.push(...await readAllDirectoryEntries(reader));
    }
  }
  return fileEntries;
}

// Get all the entries (files or sub-directories) in a directory by calling
// readEntries until it returns empty array
async function readAllDirectoryEntries(directoryReader) {
  let entries = [];
  let readEntries = await readEntriesPromise(directoryReader);
  while (readEntries.length > 0) {
    entries.push(...readEntries);
    readEntries = await readEntriesPromise(directoryReader);
  }
  return entries;
}

// Wrap readEntries in a promise to make working with readEntries easier
async function readEntriesPromise(directoryReader) {
  try {
    return await new Promise((resolve, reject) => {
      directoryReader.readEntries(resolve, reject);
    });
  } catch (err) {
    console.log(err);
  }
}
