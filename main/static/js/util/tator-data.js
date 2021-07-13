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
    this._algorithms = [];
    this._stateTypes = [];
    this._stateTypeNames = [];
    this._stateTypeAssociations = {media: [], frame: [], localization: []};

    this._maxFetchCount = 100000;
  }

  getMaxFetchCount() {
    return this._maxFetchCount;
  }

  getProjectId() {
    return this._project;
  }

  getStoredLocalizationTypes() {
    return this._localizationTypes;
  }

  getStoredStateTypes() {
    return this._stateTypes;
  }

  getStoredMediaStateTypes() {
    return this._stateTypeAssociations.media;
  }

  getStoredLocalizationStateTypes() {
    return this._stateTypeAssociations.localization;
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

  getStoredAlgorithms() {
    return this._algorithms;
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
    await this.getAllAlgorithms();
    await this.getAllStateTypes();
  }

  /**
   * Saves the list of localization types associated with this project
   */
   async getAllStateTypes() {

    var donePromise = new Promise(resolve => {

      const restUrl = "/rest/StateTypes/" + this._project;
      const dataPromise = fetchRetry(restUrl, {
        method: "GET",
        credentials: "same-origin",
        headers: {
          "X-CSRFToken": getCookie("csrftoken"),
          "Accept": "application/json",
          "Content-Type": "application/json"
        },
      });

      Promise.all([dataPromise])
        .then(([dataResponse]) => {
          const dataJson = dataResponse.json();
          Promise.all([dataJson])
        .then(([stateTypes]) => {
          this._stateTypes = [...stateTypes];
          this._stateTypeNames = [];
          this._stateTypes.forEach(typeElem => this._stateTypeNames.push(typeElem.name));

          // Also separate out the state types into the different association types
          this._stateTypeAssociations = {media: [], frame: [], localization: []};
          for (let idx=0; idx < this._stateTypes.length; idx++) {
            const stateType = this._stateTypes[idx];
            if (stateType.association == "Media") {
              this._stateTypeAssociations.media.push(stateType);
            }
            else if (stateType.association == "Localization") {
              this._stateTypeAssociations.localization.push(stateType);
            }
            else if (stateType.association == "Frame") {
              this._stateTypeAssociations.frame.push(stateType);
            }
          }

          resolve();
        });
      });

    });

    await donePromise;
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
   * #TODO
   */
   async getAllAlgorithms() {
    var donePromise = new Promise(resolve => {

      const restUrl = "/rest/Algorithms/" + this._project;
      const resultsPromise = fetchRetry(restUrl, {
        method: "GET",
        credentials: "same-origin",
        headers: {
          "X-CSRFToken": getCookie("csrftoken"),
          "Accept": "application/json",
          "Content-Type": "application/json"
        },
      });

      Promise.all([resultsPromise])
        .then(([resultsPromise]) => {
          const resultsJson = resultsPromise.json();
          Promise.all([resultsJson])
        .then(([algorithms]) => {
          this._algorithms = [...algorithms];
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
   * Gets localization object based on ID
   */
  async getLocalization(localizationId){
    const response = await fetch(`/rest/Localization/${localizationId}`, {
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
   * Note: Much of this code has been copied from media-section.js
   *       The constants chosen are based on the Tator endpoint restrictions
   *
   * The "list" the pagination is operating on is based on the url
   *
   * @param {integer} start Desired start index in list
   * @param {integer} stop Desired stop index in list
   * @param {Map} afterMap Specific to the endpoint and search criteria combination. Modified here.
   * @param {string} url Tator REST endpoint list call with query but no pagination
   * @returns {integer} Undefined if after parameter is not needed.
   */
   async _getAfterParameter(start, stop, afterMap, url) {
    let afterPromise = Promise.resolve(null);
    var pageParameters;
    if ((start + stop) >= 10000) {
      const afterIndex = 5000 * Math.floor(start / 5000);
      const newStart = start % afterIndex;
      let newStop = stop % afterIndex;
      if (newStop < newStart) {
        newStop += 5000;
      }
      afterPromise = this._getAfter(afterIndex, afterMap, url);
      var afterParameter = await afterPromise;
      pageParameters = {after: afterParameter, start: newStart, stop: newStop};
    }
    else {
      pageParameters = {after: null, start: start, stop: stop};
    }
    return pageParameters;
  }


  /**
   * Note: Much of this code has been copied from media-section.js
   *       The constants chosen are based on the Tator endpoint restrictions
   *       Constants match up with _getAfterParameter()
   *
   * @param {integer} index
   * @param {string} endpointQuery URL safe query string
   * @param {Map} afterMap . Modified here.
   * @param {string} url Tator REST endpoint list call with query but no pagination
   */
  _getAfter(index, afterMap, url) {
    const recursiveFetch = (current) => {
      let after = "";
      if (afterMap.has(current - 5000)) {
        after = `&after=${afterMap.get(current - 5000)}`;
      }
      return fetch(`${url}&start=4999&stop=5000${after}&presigned=28800`, {
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
        afterMap.set(current, data[0].id);
        if (current < index) {
          return recursiveFetch(current + 5000);
        }
        return Promise.resolve(data[0].id);
      });
    }
    if (afterMap.has(index)) {
      return Promise.resolve(afterMap.get(index));
    } else {
      return recursiveFetch(5000);
    }
  }

  /**
   * @param {integer} sectionId - Section ID to convert into the user attribute form for searching
   * @returns {string} tator_user_section value associated with given section ID
   */
   _getTatorUserSection(sectionId) {
    for (const section of this._sections) {
      if (section.id == sectionId) {
        return section.tator_user_sections;
      }
    }
  }

  /**
   * @param {FilterConditionData} filter - Filter to convert
   * @returns {string} Tator REST compliant parameter string
   */
  _convertFilterForTator(filter) {

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
    var field = filter.field.replace(/ /g,"\\ ")
    field = field.replace(/\(/g,"\\(")
    field = field.replace(/\)/g,"\\)")
    var value = filter.value.replace(/ /g,"\\ ")
    value = value.replace(/\(/g,"\\(")
    value = value.replace(/\)/g,"\\)")

    // Finally generate the final parameter string compliant with Tator's REST call
    var paramStr = `${field}:${modifier}${value}${modifierEnd}`;
    return paramStr;
  }

  /**
   * @param {string} outputType ids|objects|count
   * @param {string} annotationType Localizations|States
   * @param {array of FilterConditionData} annotationFilterData
   * @param {array of FilterConditionData} mediaFilterData
   * @param {integer} listStart
   * @param {integer} listStop
   * @param {Map} afterMap
   * @param {array} versionIds
   * @param {integer} dtype
   */
  async _getAnnotationData(
    outputType,
    annotationType,
    annotationFilterData,
    mediaFilterData,
    listStart,
    listStop,
    afterMap,
    versionIds,
    dtype) {

    var promises = [];

    var paramString = "";

    var annotationSearch = "";
    for (let idx = 0; idx < annotationFilterData.length; idx++) {
      var filter = annotationFilterData[idx];
      annotationSearch += encodeURIComponent(this._convertFilterForTator(filter));
      if (idx < annotationFilterData.length - 1) {
        annotationSearch += encodeURIComponent(" AND ");
      }
    }

    if (annotationSearch) {
      paramString += "&search=" + annotationSearch;
    }

    var mediaSearch = "";
    for (let idx = 0; idx < mediaFilterData.length; idx++) {
      var filter = mediaFilterData[idx];
      mediaSearch += encodeURIComponent(this._convertFilterForTator(filter));
      if (idx < mediaFilterData.length - 1) {
        mediaSearch += encodeURIComponent(" AND ");
      }
    }

    if (mediaSearch) {
      paramString += "&media_search=" + mediaSearch;
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

    if (dtype != undefined) {
      paramString += `&type=${dtype}`
    }

    let url = "/rest";

    if (annotationType == "Localizations") {
      if (outputType == "count") {
        url += "/LocalizationCount/";
      }
      else {
        url += "/Localizations/";
      }
    }
    else if (annotationType == "States") {
      if (outputType == "count") {
        url += "/StateCount/";
      }
      else {
        url += "/States/";
      }
    }

    url += `${this._project}?${paramString}`;
    if (!isNaN(listStart) && !isNaN(listStop) && afterMap != null) {
      // Note: & into paramString is taken care of by paramString itself
      var pageValues = await this._getAfterParameter(listStart, listStop, afterMap, url);
      url += `&start=${pageValues.start}&stop=${pageValues.stop}`;
      if (pageValues.after != undefined) {
        url += `&after=${pageValues.after}`;
      }
    }

    console.log("Getting data with URL: " + url);
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
   *
   * @param {string} outputType -
   *    ids|objects|count
   *
   * @param {array of FilterConditionData objects} filters -
   *    List of FilterConditionData to apply
   *    Only conditions associated with media and localizations will be applied.
   *
   * @param {integer} listStart -
   *   Used in conjunction with listStop and pagination of data.
   *   If null, pagination is ignored.
   *
   * @param {integer} listStop =
   *   Used in conjunction with listStart and pagination of data.
   *   If null, pagination is ignored.
   *
   * @param {Map} afterMap -
   *   Used in conjunction with the other pagination. Modified here.
   *   If null, pagination is ignored.
   *
   * @returns {array of integers}
   *    List of localization IDs matching the filter criteria
   */
  async getFilteredLocalizations(outputType, filters, listStart, listStop, afterMap) {

    // Loop through the filters, if there are any media specific ones
    var mediaFilters = [];
    var localizationFilters = [];
    var dtypeIds = [];
    var versionIds = [];
    var typePromises = [];

    // Separate out the filter conditions into their groups
    if (Array.isArray(filters)) {
      filters.forEach(filter => {
        if (this._mediaTypeNames.indexOf(filter.category) >= 0) {
          if (filter.field == "_section") {
            var newFilter = Object.assign({}, filter);
            newFilter.field = "tator_user_sections";
            newFilter.value = this._getTatorUserSection(filter.value.split('(ID:')[1].replace(")",""));
            mediaFilters.push(newFilter);
          }
          else {
            mediaFilters.push(filter);
          }
        }
        else if (this._localizationTypeNames.indexOf(filter.category) >= 0) {
          if (filter.field == "_version") {
            versionIds.push(Number(filter.value.split('(ID:')[1].replace(")","")));
          }
          else if (filter.field == "_dtype") {
            dtypeIds.push(Number(filter.value.split('(ID:')[1].replace(")","")));
          }
          else {
            localizationFilters.push(filter);
          }
        }
      });
    }

    if (dtypeIds.length > 0) {
      dtypeIds.forEach(dtypeId => {
        typePromises.push(this._getAnnotationData(
          outputType,
          "Localizations",
          localizationFilters,
          mediaFilters,
          listStart,
          listStop,
          afterMap,
          versionIds,
          dtypeId
        ));
      });
    }
    else {
      typePromises.push(this._getAnnotationData(
        outputType,
        "Localizations",
        localizationFilters,
        mediaFilters,
        listStart,
        listStop,
        afterMap,
        versionIds
      ));
    }

    // Wait for all the data requests to complete. Once complete, return the appropriate data.
    var typeResults = await Promise.all(typePromises);
    var outData;
    if (outputType == "count") {
      outData = 0;
    }
    else {
      outData = [];
    }

    for (let idx = 0; idx < typeResults.length; idx++) {
      if (outputType == "count") {
        outData += Number(typeResults[idx]);
      }
      else {
        outData.push(...typeResults[idx]);
      }
    }
    return outData;
  }

  /**
   * Retrieves a list of state data matching the filter criteria
   *
   * @param {string} outputType -
   *    objects|count
   *
   * @param {array of FilterConditionData objects} filters -
   *    List of FilterConditionData to apply
   *    Only conditions associated with media and states will be applied.
   *
   * @param {integer} listStart -
   *   Used in conjunction with listStop and pagination of data.
   *   If null, pagination is ignored.
   *
   * @param {integer} listStop =
   *   Used in conjunction with listStart and pagination of data.
   *   If null, pagination is ignored.
   *
   * @param {Map} afterMap -
   *   Used in conjunction with the other pagination. Modified here.
   *   If null, pagination is ignored.
   *
   * @returns {array of integers}
   *    List of localization IDs matching the filter criteria
   */
   async getFilteredStates(outputType, filters, listStart, listStop, afterMap) {

    // Loop through the filters, if there are any media specific ones
    var mediaFilters = [];
    var stateFilters = [];
    var typeIds = [];
    var versionIds = [];
    var typePromises = [];

    // Separate out the filter conditions into their groups
    if (Array.isArray(filters)) {
      filters.forEach(filter => {
        if (this._mediaTypeNames.indexOf(filter.category) >= 0) {
          if (filter.field == "_section") {
            var newFilter = Object.assign({}, filter);
            newFilter.field = "tator_user_sections";
            newFilter.value = this._getTatorUserSection(filter.value.split('(ID:')[1].replace(")",""));
            mediaFilters.push(newFilter);
          }
          else {
            mediaFilters.push(filter);
          }
        }
        else if (this._stateTypeNames.indexOf(filter.category) >= 0) {
          if (filter.field == "_version") {
            versionIds.push(Number(filter.value.split('(ID:')[1].replace(")","")));
          }
          else if (filter.field == "_type") {
            typeIds.push(Number(filter.value.split('(ID:')[1].replace(")","")));
          }
          else {
            stateFilters.push(filter);
          }
        }
      });
    }

    if (typeIds.length > 0) {
      typeIds.forEach(dtypeId => {
        typePromises.push(this._getAnnotationData(
          outputType,
          "States",
          stateFilters,
          mediaFilters,
          listStart,
          listStop,
          afterMap,
          versionIds,
          dtypeId
        ));
      });
    }
    else {
      typePromises.push(this._getAnnotationData(
        outputType,
        "States",
        stateFilters,
        mediaFilters,
        listStart,
        listStop,
        afterMap,
        versionIds
      ));
    }

    // Wait for all the data requests to complete. Once complete, return the appropriate data.
    var typeResults = await Promise.all(typePromises);
    var outData;
    if (outputType == "count") {
      outData = 0;
    }
    else {
      outData = [];
    }

    for (let idx = 0; idx < typeResults.length; idx++) {
      if (outputType == "count") {
        outData += Number(typeResults[idx]);
      }
      else {
        outData.push(...typeResults[idx]);
      }
    }
    return outData;
  }

  /**
   * Launches the given algorithm with the provided parameters
   * @param {string} algorithmName - Name of registered algorithm to launch
   * @param {array} parameters - Array of {name:..., value:...} objects
   *
   * #TODO Add media_query and media_ids parameters
   */
  async launchAlgorithm(algorithmName, parameters) {

    // Have to provide a valid media ID list or query for now. #TODO revisit

    var media_id;
    await fetchRetry(`/rest/Medias/${this._project}?start=0&stop=1`, {
      method: "GET",
      credentials: "same-origin",
      headers: {
        "X-CSRFToken": getCookie("csrftoken"),
        "Accept": "application/json",
        "Content-Type": "application/json"
      },
    }).then((response) => {
      return response.json()
    }).then((results) => {
      media_id = results[0].id;
    });

    let body = {
      "algorithm_name": algorithmName,
      "extra_params": parameters,
      "media_ids": [media_id]
    }

    var launched = false;
    await fetchRetry("/rest/AlgorithmLaunch/" + this._project, {
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
      if (response.status == 201) {
        launched = true;
      }
      return response.json();
    })
    .then(data => {
      console.log(data);
    });

    return launched;
  }

  /**
   * Creates a Tator link to the given media and provided parameters
   * Assumes the media is in the same project as this tator data module.
   * @param {integer} mediaId
   * @param {integer} frame - optional
   * @param {integer} entityId - optional
   * @param {integer} typeId - optional, will convert to Tator annotator friendly link
   * @param {integer} version - optional
   * @returns {str} Tator link using given parameters
   */
  generateMediaLink(mediaId, frame, entityId, typeId, version) {
    var outStr = `/${this._project}/annotation/${mediaId}?`;
    var addedParam = false;

    if (frame) {
      if (addedParam) {
        outStr += "&"
      }
      outStr += `frame=${frame}`;
      addedParam = true;
    }

    if (entityId) {
      if (addedParam) {
        outStr += "&"
      }
      outStr += `selected_entity=${entityId}`;
      addedParam = true;
    }

    if (typeId) {
      if (addedParam) {
        outStr += "&"
      }

      let annotatorTypeId;
      for (let type of this._localizationTypes) {
        if (type.id == typeId) {
          annotatorTypeId = type.dtype;
          break;
        }
      }
      annotatorTypeId += `_${typeId}`

      outStr += `selected_type=${annotatorTypeId}`;
      addedParam = true;
    }

    if (version) {
      if (addedParam) {
        outStr += "&"
      }
      outStr += `version=${version}`;
      addedParam = true;
    }

    return outStr;
  }
}
