/**
 * Assumptions:
 * - All names given to types are unique
 **/
class TatorData {

  constructor(project) {
    this._project = project;

    this._mediaTypes = [];
    this._mediaTypeNames = [];

    this._localizationTypes = [];
    this._localizaitonTypeNames = [];

    this._versions = [];
    this._sections = [];
  }

  getProjectId() {
    return this._project;
  }

  getStoredLocalizationTypes() {
    return this._localizationTypes;
  }

  getStoredMediaTypes() {
    return this._mediaTypes;
  }

  getStoredVersions() {
    return this._versions;
  }

  getStoredSections() {
    return this._sections;
  }

  /**
   * #TODO May want to consider what it is actually necessary here to initialize with to speed up
   *       initial loading times. There typically aren't that many versions. There might be a good
   *       amount of sections.
   */
  async init() {
    await this.getAllLocalizationTypes();
    await this.getAllMediaTypes();
    await this.getAllVersions();
    await this.getAllSections();
  }

  /**
   * Saves the list of localization types associated with this project
   */
  async getAllLocalizationTypes() {

    var donePromise = new Promise(resolve => {

      const localizationRestUrl = "/rest/LocalizationTypes/" + this._project;
      const localizationPromise = fetchRetry(localizationRestUrl, {
        method: "GET",
        credentials: "same-origin",
        headers: {
          "X-CSRFToken": getCookie("csrftoken"),
          "Accept": "application/json",
          "Content-Type": "application/json"
        },
      });

      Promise.all([localizationPromise])
        .then(([localizationResponse]) => {
          const localizationJson = localizationResponse.json();
          Promise.all([localizationJson])
        .then(([localizationTypes]) => {
          this._localizationTypes = [...localizationTypes];
          resolve();
        });
      });

    });

    await donePromise;

    this._localizationTypeNames = [];
    this._localizationTypes.forEach(typeElem => this._localizationTypeNames.push(typeElem.name));
  }

  /**
   * Saves the list of media types associated with this project
   */
  async getAllMediaTypes() {

    var donePromise = new Promise(resolve => {

      const mediaRestUrl = "/rest/MediaTypes/" + this._project;
      const mediaPromise = fetchRetry(mediaRestUrl, {
        method: "GET",
        credentials: "same-origin",
        headers: {
          "X-CSRFToken": getCookie("csrftoken"),
          "Accept": "application/json",
          "Content-Type": "application/json"
        },
      });

      Promise.all([mediaPromise])
        .then(([mediaResponse]) => {
          const mediaJson = mediaResponse.json();
          Promise.all([mediaJson])
        .then(([mediaTypes]) => {
          this._mediaTypes = [...mediaTypes];
          resolve();
        });
      });

    });

    await donePromise;

    this._mediaTypeNames = [];
    this._mediaTypes.forEach(typeElem => this._mediaTypeNames.push(typeElem.name));
  }

  /**
   * #TODO
   */
  async getAllVersions() {
    var donePromise = new Promise(resolve => {

      const versionsRestUrl = "/rest/Versions/" + this._project;
      const versionsPromise = fetchRetry(versionsRestUrl, {
        method: "GET",
        credentials: "same-origin",
        headers: {
          "X-CSRFToken": getCookie("csrftoken"),
          "Accept": "application/json",
          "Content-Type": "application/json"
        },
      });

      Promise.all([versionsPromise])
        .then(([versionsResponse]) => {
          const versionsJson = versionsResponse.json();
          Promise.all([versionsJson])
        .then(([versions]) => {
          this._versions = [...versions];
          resolve();
        });
      });

    });

    await donePromise;
  }

  /**
   * #TODO
   */
  async getAllSections() {
    var donePromise = new Promise(resolve => {

      const sectionsRestUrl = "/rest/Sections/" + this._project;
      const sectionsPromise = fetchRetry(sectionsRestUrl, {
        method: "GET",
        credentials: "same-origin",
        headers: {
          "X-CSRFToken": getCookie("csrftoken"),
          "Accept": "application/json",
          "Content-Type": "application/json"
        },
      });

      Promise.all([sectionsPromise])
        .then(([sectionsResponse]) => {
          const sectionsJson = sectionsResponse.json();
          Promise.all([sectionsJson])
        .then(([sections]) => {
          this._sections = [...sections];
          resolve();
        });
      });

    });

    await donePromise;
  }

  /**
   * Returns data for getFrame with project ID
   */
  async getFrame( frameId ){
    const response = await fetch(`/rest/GetFrame/${frameId}`, {
      method: "GET",
      mode: "cors",
      credentials: "include",
      headers: {
        "X-CSRFToken": getCookie("csrftoken"),
        "Accept": "application/json",
        "Content-Type": "application/json"
      }
    });
    const data = await response.json();

    return data;
  }

    /**
   * Returns data for getLocalizationGraphic with project ID
   */
  async getLocalizationGraphic( localizationID ){
    const response = await fetch(`/rest/LocalizationGraphic/${localizationID}`, {
      method: "GET",
      mode: "cors",
      credentials: "include",
      headers: {
        "X-CSRFToken": getCookie("csrftoken"),
        "Accept": "image/*",
        "Content-Type": "image/*"
      }
    });

    const data = await response.blob();

    return data;
  }


  /**
   * Returns a data for user with user ID
   */
  async getUser( userId ){
    const response = await fetch(`/rest/User/${userId}`, {
      method: "GET",
      mode: "cors",
      credentials: "include",
      headers: {
        "X-CSRFToken": getCookie("csrftoken"),
        "Accept": "application/json",
        "Content-Type": "application/json"
      }
    });
    const data = await response.json();

    return data;
  }


  /**
   * Returns a localization count
   */
  async getLocalizationCount({params = ""} = {}){
    const response = await fetch(`/rest/LocalizationCount/${this._project}${params}`, {
      method: "GET",
      mode: "cors",
      credentials: "include",
      headers: {
        "X-CSRFToken": getCookie("csrftoken"),
        "Accept": "application/json",
        "Content-Type": "application/json"
      }
    });
    const data = await response.json();

    return data;
  }


  /**
   * Returns localizations list 
   */
  async getLocalizations({ params = "", start = 0, stop = 20} = {}){
    const response = await fetch(`/rest/Localizations/${this._project}?start=${start}&stop=${stop}${params}`, {
      method: "GET",
      mode: "cors",
      credentials: "include",
      headers: {
        "X-CSRFToken": getCookie("csrftoken"),
        "Accept": "application/json",
        "Content-Type": "application/json"
      }
    });
    const data = await response.json();

    return data;
  }

  /**
   * Returns a Media data
   */
  async getMedia( mediaId ){
    const response = await fetch(`/rest/Media/${mediaId}?presigned=28800`, {
      method: "GET",
      mode: "cors",
      credentials: "include",
      headers: {
        "X-CSRFToken": getCookie("csrftoken"),
        "Accept": "application/json",
        "Content-Type": "application/json"
      }
    });
    const data = await response.json();

    return data;
  }

  /**
   * Returns a MediaType data
   */
  async getMediaType( mediaId ){
    const response = await fetch(`/rest/MediaType/${mediaId}`, {
      method: "GET",
      mode: "cors",
      credentials: "include",
      headers: {
        "X-CSRFToken": getCookie("csrftoken"),
        "Accept": "application/json",
        "Content-Type": "application/json"
      }
    });
    const data = await response.json();

    return data;
  }

  /**
   * @param {FilterConditionData} filter - Filter to convert
   * @returns {string} Tator REST compliant parameter string
   */
   _convertFilterForTator(filter) {

    // #TODO This will just assume we are using the user-defined attributes. Allow built-in
    //       but that will require a specific conversion table

    // Adjust the modifier to be lucene compliant
    var modifier = filter.modifier;
    var modifierEnd = "";

    if (modifier == "==") {
      modifier = "";
    }
    else if (modifier == "Includes") {
      modifier = "*";
      modifierEnd = "*";
    }

    // Lucene search string requires spaces to have the backlash preceding it
    var field = filter.field.replace(/ /g,"\\ ");
    var value = filter.value.replace(/ /g,"\\ ");

    // Finally generate the final parameter string compliant with Tator's REST call
    var paramStr = `${field}:${modifier}${value}${modifierEnd}`;
    return paramStr;
  }

  /**
   * Gets data from the corresponding Tator REST endpoint
   * #TODO Currently, this will search through all of a given entity type
   *
   * @param {string} outputType -
   *  ids|objects|count
   *
   * @param {array of objects} filterData -
   *   Objects must have the following:
   *     .filters {array of FilterConditionData}
   *     .entityType {object} - media|localization
   *
   * @param {integer} dataStart -
   *   Used in conjunction with dataStop and pagination of data.
   *   If null, pagination is ignored.
   *
   * @param {integer} dataStop =
   *   Used in conjunction with dataStart and pagination of data.
   *   If null, pagination is ignored.
   *
   * @param #TODO mediaIds
   *
   * @param #TODO versionIds
   *
   * @param #TODO sectionIds
   *
   * @returns {array}
   *   Results based on outputType and given filterData
   */
  async _getData(outputType, filterData, filterString, dataStart, dataStop, mediaIds, versionIds, sectionIds) {

    // #TODO In the future, this may turn into promises per meta/dtype
    var promises = [];

    var entityType;
    var mediaIds;
    var paramString = "";
    var paramSearch = "";

    // Create the paramString
    for (const name in filterData) {
      entityType = filterData[name].entityType;
      for (let idx = 0; idx < filterData[name].filters.length; idx++) {
        paramSearch += encodeURIComponent(this._convertFilterForTator(filterData[name].filters[idx]));
        if (idx < filterData[name].filters.length - 1) {
          paramSearch += encodeURIComponent(" AND ");
        }
      }
    }

    if (paramSearch) {
      paramString = "&search=" + paramSearch;
    }

    if (mediaIds != undefined && mediaIds.length > 0) {
      paramString += "&media_id=";
      for (let idx = 0; idx < mediaIds.length; idx++) {
        paramString += mediaIds[idx];
        if (idx < mediaIds.length - 1) {
          paramString += ","
        }
      }
    }

    if (versionIds != undefined && versionIds.length > 0) {
      paramString += "&version=";
      for (let idx = 0; idx < versionIds.length; idx++) {
        paramString += versionIds[idx];
        if (idx < versionIds.length - 1) {
          paramString += ","
        }
      }
    }

    if (sectionIds != undefined && sectionIds.length > 0) {
      paramString += "&section=";
      for (let idx = 0; idx < sectionIds.length; idx++) {
        paramString += sectionIds[idx];
        if (idx < sectionIds.length - 1) {
          paramString += ","
        }
      }
    }

    // **********
    // @TODO
    // if(filterString !== "" && filterString !== null && typeof filterString !== "undefined"){
    //   paramString = filterString;
    // }
    // *********
    

    let url = "/rest";

    if (this._localizationTypes.indexOf(entityType) >= 0) {
      if (outputType == "count") {
        url += "/LocalizationCount/";
      }
      else {
        url += "/Localizations/";
      }
    }
    else if (this._mediaTypes.indexOf(entityType) >= 0) {
      if (outputType == "count") {
        url += "/MediaCount/";
      }
      else {
        url += "/Medias/";
      }
    }
    
    if (!isNaN(dataStart) && !isNaN(dataStop)) {
      // Note: & into paramString is taken care of by paramString itself
      url += `${this._project}?start=${dataStart}&stop=${dataStop}${paramString}`;
    }
    else {
      url += `${this._project}?${paramString}`;
    }
    console.log("Getting data with URL: " + url);

    // **********
    // @TODO this doesn't belong here, will be lost if we decouple data?
    // Only place where we have access to the param string, so pushed here
    // Need to expose elsewhere for history management? or reconstruct?
    // this._filterState = {};
    // this._filterState.paramString = paramString;
    // this._paginationState = {};
    // this._paginationState.start = dataStart; // @TODO could go w/ NaN check but has error handler downstream
    // this._paginationState.stop = dataStop;
    // this.history = new FilterHistoryManagement();
    // this.history._handlePushState({ 
    //   fp : this._filterState, 
    //   ps : this._paginationState
    // });
    // **********

    promises.push(fetchRetry(url, {
        method: "GET",
        credentials: "same-origin",
        headers: {
          "X-CSRFToken": getCookie("csrftoken"),
          "Accept": "application/json",
          "Content-Type": "application/json"
        },
    }));

    let resultsJson = [];
    await Promise.all(promises).then((responses) => {
      for (let response of responses) {
        resultsJson.push(response.json());
      }
    });
    const outData = Promise.all(resultsJson).then((results) => {
      var flatResults = results.flat();
      if (outputType == "ids") {
        var finalResults = [];
        flatResults.forEach(data => {
          finalResults.push(data.id);
        });
      }
      else {
        finalResults = flatResults;
      }
      return finalResults;
    });

    return outData;
  }

  /**
   * Retrieves a list of localization data matching the filter criteria
   * #TODO Currently, this will search through all localization types.
   *
   * @param {string} outputType -
   *  ids|objects|count
   *
   * @param {array of FilterConditionData objects} filters -
   *    List of FilterConditionData to apply
   *    Only conditions associated with media and localizations will be applied.
   *
   * @param {integer} dataStart -
   *   Used in conjunction with dataStop and pagination of data.
   *   If null, pagination is ignored.
   *
   * @param {integer} dataStop =
   *   Used in conjunction with dataStart and pagination of data.
   *   If null, pagination is ignored.
   *
   * @returns {array of integers}
   *    List of localization IDs matching the filter criteria
   */
  async getFilteredLocalizations(outputType, filters, filterString, dataStart, dataStop) {
   
    // Loop through the filters, if there are any media specific ones
    var mediaFilters = [];
    var localizationFilters = [];
    var versionFilters = [];
    var locGroups = {};
      this._localizationTypes.forEach(locType => {
        locGroups[locType.name] = {filters: [], entityType: locType};
      });

    if (filters != undefined && filters != null && filters != "") {
      console.log("Filters: ");
      console.log(filters);
      filters.forEach(filter => {
        if (this._mediaTypeNames.indexOf(filter.category) >= 0) {
          mediaFilters.push(filter);
        }
        else {
          if (filter.field == "_version") {
            versionFilters.push(filter);
          }
          else {
            localizationFilters.push(filter);
          }
        }
      });

      // First, grab the media IDs we care about if there are media filters. Otherwise, ignore.
      var mediaIds = [];
      if (mediaFilters.length > 0) {
        mediaIds = await this.getFilteredMedia("ids", mediaFilters);
        console.log("matching mediaIds: " + mediaIds);

        if (mediaIds.length == 0) {
          // Found no matching media, so bail
          return [];
        }
      }

      var versionIds = [];
      if (versionFilters.length > 0) {
        for (let idx = 0; idx < versionFilters.length; idx++) {
            // Expected format (Name (ID:#))
            // #TODO Maybe this should be moved elsewhere to remove this dependency
            versionIds.push(Number(versionFilters[idx].value.split('(ID:')[1].replace(")","")));
        }
      }

      localizationFilters.forEach(filter => {
        if (this._localizationTypeNames.indexOf(filter.category) >= 0) {
          locGroups[filter.category].filters.push(filter);
        }
      });
      filterString = "";
    }

    var outData = await this._getData(outputType, locGroups, filterString, dataStart, dataStop, mediaIds, versionIds);

    return outData;
  }

  /**
   * Retrieves a list of media data based on the given filters.
   * #TODO Currently, this will search through all media types.
   *
   * @param {string} outputType -
   *  ids|objects|count
   *
   * @param {array of FilterConditionData} filters -
   *   List of FilterConditionData to apply
   *   Only conditions associated with media will be applied
   *   If there are no filters, this will just return
   *
   * @param {integer} dataStart -
   *   Used in conjunction with dataStop and pagination of data.
   *   If null, pagination is ignored.
   *
   * @param {integer} dataStop =
   *   Used in conjunction with dataStart and pagination of data.
   *   If null, pagination is ignored.
   *
   * @returns {array of integers} List of media IDs matching the filter criteria
   */
  async getFilteredMedia(outputType, filters, dataStart, dataStop) {

    let mediaGroups = {};
    var sectionFilters = [];

    this._mediaTypes.forEach(mediaType => {
      mediaGroups[mediaType.name] = {entityType: mediaType, filters: []};
    });

    if (filters != undefined && filters != null && filters != "" ){
      filters.forEach(filter => {
        if (this._mediaTypeNames.indexOf(filter.category) >= 0) {
          if (filter.field == "_section") {
            sectionFilters.push(filter);
          }
          else {
            mediaGroups[filter.category].filters.push(filter);
          }
        }
      });
    }

    var sectionIds = [];
    if (sectionFilters.length > 0) {
      for (let idx = 0; idx < sectionFilters.length; idx++) {
          // Expected format (Name (ID:#))
          // #TODO Maybe this should be moved elsewhere to remove this dependency
          sectionIds.push(Number(sectionFilters[idx].value.split('(ID:')[1].replace(")","")));
      }
    }

    var outData = await this._getData(outputType, mediaGroups, "", dataStart, dataStop, null, null, sectionIds);
    return outData;
  }

  _getMediaTypeById(id){
    for(let mediaType of this._mediaTypes){
      if(mediaType.id == id){
        return mediaType;
      }
    }
    return null;
  }

  _getLocTypeById(id){
    for(let localizationType of this._localizationTypes){
      if( localizationType.id == id ){
        return localizationType;
      }
    }
    return null;
  }
}