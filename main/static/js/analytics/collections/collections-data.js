/**
 * Class that contains the data about the collections analytics gallery.
 * This provides an interface between the UI elements to the underlying data calls.
 * 
 * This will retrieve media-associated states
 */
class CollectionsData extends HTMLElement {
  constructor() {
    super();
  }

  /**
   * @precondition The provided modelData must have been initialized
   * @param {TatorData} modelData
   */
  init(modelData) {
    this._modelData = modelData;

    var mediaStateTypes = this._modelData.getStoredMediaStateTypes();
    var locStateTypes = this._modelData.getStoredLocalizationStateTypes();
    this._stateTypes = mediaStateTypes.concat(locStateTypes);
    this._stateTypesMap = new Map();
    for (const stateType of this._stateTypes) {
      this._stateTypesMap.set(stateType.id, stateType);
    }

    this._totalStateCount = 0;
    this.filterConditions = null;
    this.afterMap = new Map();
  }

  /**
   * @param {array} filterConditions array of FilterConditionData objects
   */
  async _reload(filterConditions) {
    this.filterConditions = filterConditions;
    this._totalStateCount = await this._modelData.getFilteredStates("count", filterConditions);
    this.afterMap = new Map();
  }

  /**
   * Note: If the filters are in a different order, this will return with True still.
   * @param {array} filterConditions array of FilterConditionData objects
   * @returns True if reload() needs to be called
   */
  _needReload(filterConditions) {
    return JSON.stringify(filterConditions) != JSON.stringify(this.filterConditions);
  }

  /**
   * Note: Utilizes internal paginationState
   * @param {array} filterConditions array of FilterConditionData objects
   * @postconditions
   *   getState
   */
  async updateData(filterConditions) {

    if (this._needReload(filterConditions)) {
      await this._reload(filterConditions);
    }

    this._states = await this._modelData.getFilteredStates(
      "objects",
      filterConditions,
      this._paginationState.start,
      this._paginationState.stop,
      this.afterMap);

    for (let idx = 0; idx < this._states.length; idx++) {
      this._states[idx].typeData = this._stateTypesMap.get(this._states[idx].meta);
    }
  }

  getStates() {
    return this._states;
  }

  getStateTypes() {
    return this._stateTypes;
  }

  getNumberOfResults() {
    return this._totalStateCount;
  }
  
  getPage() {
    return this._paginationState.page;
  }

  getPageSize() {
    return this._paginationState.pageSize;
  }

  getPaginationState() {
    return this._paginationState;
  }

  /**
   * @param {object} paginationState 
   *   Must have the following fields:
   *     start
   *     stop
   *     page
   *     pageSize
   *     init
   */
  setPaginationState(paginationState) {
    this._paginationState = paginationState;
  }
}

customElements.define("collections-data", CollectionsData);