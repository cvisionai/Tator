class AnnotationData extends HTMLElement {
  constructor() {
    super();

    this._dataTypesRaw = [];
    this._dataTypes = {};
    this._trackDb = new Map();
    this._updateUrls = new Map();
    this._dataByType = new Map();
    this._stateMediaIds = new Array();
    this._localizationMediaIds = new Array();
  }

  init(dataTypes, version, projectId, mediaId, update, allowNonTrackStateData) {
    // Update defaults to true
    if (update == undefined)
    {
      update = true;
    }

    for (const dataType of dataTypes){
      if (dataType.dtype == "state"){
        if (allowNonTrackStateData == undefined || dataType.isTrack == true) {
          this._stateMediaIds.push(mediaId);
        }
        else if (allowNonTrackStateData) {
          this._stateMediaIds.push(mediaId);
        }
      }
      else {
        this._localizationMediaIds.push(mediaId);
      }
    }

    this._version = version;
    this._projectId = projectId;

    if (update)
    {
      for (const dataType of dataTypes) {
        this._dataTypesRaw.push(dataType);
      }
      this.updateAll(dataTypes, version)
      .then(() => {
        this.dispatchEvent(new Event("initialized"));
      });
    }

    // Convert datatypes array to a map for faster access
    this._dataByType = new Map();
    for (const dataType of dataTypes) {
      let dataTypeRegistered = dataType.id in this._dataTypes;
      if (!dataTypeRegistered) {
        this._dataTypes[dataType.id] = dataType;
        this._dataTypesRaw.push(dataType);
      }
    }
  }

  initialUpdate() {
    this.updateAll(this._dataTypesRaw, this._version)
    .then(() => {
      this.dispatchEvent(new Event("initialized"));
    });
  }

  // Returns a promise when done
  setVersion(version) {
    this._version = version;
    return this.updateAll(this._dataTypesRaw, version);
  }

  getVersion()
  {
    return this._version;
  }

  // Returns a promise when done
  updateAll(dataTypes, version) {
    const trackTypeIds=[];
    const localTypeIds=[];

    // Clear the track database
    this._trackDb = new Map();
    for (const [idx, dataType] of dataTypes.entries()) {

      if (dataType.isTrack) {
        trackTypeIds.push(idx);
      } else {
        localTypeIds.push(idx);
      }
    }

    // Define function for getting data url.
    const getDataUrl = (dataType) => {
      const dataEndpoint = dataType.dtype == "state" ? "States" : "Localizations";
      const mediaIds = dataType.dtype == "state" ? this._stateMediaIds : this._localizationMediaIds;
      let dataUrl = "/rest/" + dataEndpoint + "/" + this._projectId + "?media_id=" +
        mediaIds.join(',') + "&type=" + dataType.id.split("_")[1];
      if (dataEndpoint == "Localizations")
      {
        // TODO probably want this for States as well once it is supported there
        dataUrl += "&excludeParents=1";
      }
      return dataUrl;
    };

    // Update tracks first
    const tracksDone = new Promise(resolve => {
      if (trackTypeIds.length == 0) {
        resolve();
      }

      // Only trigger the promise after all tracks are processed
      let count = trackTypeIds.length;
      const semaphore = function() {
        count = count - 1;
        if (count == 0) {
          resolve();
        }
      };

      trackTypeIds.forEach(typeIdx => {
        this._updateUrls.set(dataTypes[typeIdx].id, getDataUrl(dataTypes[typeIdx]));
        this.updateType(dataTypes[typeIdx], semaphore);
      });
    });

    const initDone = new Promise(resolve => {
      let count = localTypeIds.length;
      if (count == 0) {
        resolve();
      }
      const semaphore = function() {
        count = count - 1;
        if (count == 0) {
          resolve();
        }
      };

      //Update localizations after
      tracksDone.then(() => {
        localTypeIds.forEach(typeIdx => {
          this._updateUrls.set(dataTypes[typeIdx].id, getDataUrl(dataTypes[typeIdx]));
          this.updateType(dataTypes[typeIdx], semaphore);
        });
      });
    });

    return initDone;
  }

  updateLocalizations(callback, search) {
    for (const key in this._dataTypes)
    {
      let dataType = this._dataTypes[key];
      let isLocalization=false;
      if ("dtype" in dataType)
      {
        isLocalization = ["box", "line", "dot"].includes(dataType.dtype);
      }

      if (isLocalization)
      {
        this.updateType(dataType, callback, search);
      }
    }
  }

  /**
   * #TODO Update this to allow states
   */
  updateTypeWithData(typeObj, data) {
    const typeId = typeObj.id;

    if (this._dataByType.has(typeId)) {
      this._dataByType.get(typeId).push(data);
    }
    else {
      this._dataByType.set(typeId, []);
      this._dataByType.get(typeId).push(data);
    }

    this.dispatchEvent(new CustomEvent("freshData", {
      detail: {
        typeObj: typeObj,
        data: this._dataByType.get(typeId),
      }
    }));
  }

  updateTypeLocal(method, id, body, typeObj) {
    const typeId = typeObj.id;
    if (this._updateUrls.has(typeId) == false) {
      console.error("Unregistered type " + typeId);
      return;
    }

    const attributeNames = typeObj.attribute_types.map(column => column.name);
    const setupObject = obj => {
      obj.id = id;
      obj.meta = typeId;
      obj.attributes = {};
      for (const key in body) {
        if (attributeNames.includes(key)) {
          obj.attributes[key] = body[key];
        }
      }
      if (typeObj.isTLState) {
        obj = {
          ...obj,
          frame: body.frame,
          media: [Number(body.media_ids)],
        };
      }
      return body;
    };
    if (method == "POST") {
      // Only push the object if it's a localization. The state object has some other
      // content that is generated by the endpoint and not by the annotation frontend.
      if (this._dataTypes[typeId].id.includes("state")) {
        // Force retrieving the data from the REST API
        this.updateType(typeObj, null, null);
        return;
      }
      else {
        this._dataByType.get(typeId).push(setupObject(body));
      }
    } else if (method == "PATCH") {
      const ids = this._dataByType.get(typeId).map(elem => elem.id);
      const index = ids.indexOf(id);
      const elem = this._dataByType.get(typeId)[index];
      for (const key in body) {
        if (key in elem) {
          elem[key] = body[key];
        }
      }
      this._dataByType.get(typeId)[index] = elem;
    } else if (method == "DELETE") {
      const ids = this._dataByType.get(typeId).map(elem => elem.id);
      const index = ids.indexOf(id);
      // It is possible for the ID to not exist if it is part of a different version/layer.
      if (index == -1) {
        return;
      }
      this._dataByType.get(typeId).splice(index, 1);
    }
    this.dispatchEvent(new CustomEvent("freshData", {
      detail: {
        typeObj: typeObj,
        data: this._dataByType.get(typeId),
      }
    }));
  }

  updateType(typeObj, callback, query) {
    const typeId = typeObj.id;
    if (this._updateUrls.has(typeId) == false) {
      console.error("Unregistered type " + typeId);
      return;
    }

    let url = new URL(this._updateUrls.get(typeId), location.protocol + '//' + location.host);
    let searchParams = new URLSearchParams(url.search.slice(1));
    if (query) {
        searchParams.set('search',query);
    }

    searchParams.set('version',[...this._version.bases,this._version.id]);
    url.search = searchParams;

    // Fetch new ones from server
    fetchRetry(url)
    .then(response => {
      if (response.ok) {
        return response.json();
      } else {
        console.error("Error fetching updated data for type ID " + typeId);
        response.json()
        .then(json => console.log(JSON.stringify(json)));
      }
    })
    .then(json => {
      json.forEach(obj => {obj.meta = typeId});
      this._dataByType.set(typeId, json);
      this.dispatchEvent(new CustomEvent("freshData", {
        detail: {
          typeObj: typeObj,
          data: json,
        }
      }));
      if (callback) {
        callback();
      }
    });
  }
}

customElements.define("annotation-data", AnnotationData);
