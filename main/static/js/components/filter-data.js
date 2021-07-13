/**
 * This works in conjunction with FilterInterface. It is the backend portion
 * that connects with the database.
 *
 * #TODO Convert this to a TatorElement so that events can be dispatched
 */
class FilterData {

  /**
   * @param {TatorData} modelData
   *    Class that will be initialized as the interface to the Tator compliant interface
   * @param {array} algorithmCategories
   *    List of categories to display in run algorithm option
   * @param {array} excludeTypesList
   *    List of types to exclude from creating filter options for
   *    Available options: Medias|Localizations|MediaStates|TrackStates
   */
  constructor (modelData, algorithmCategories, excludeTypesList) {

    this._modelData = modelData;

    if (algorithmCategories != undefined) {
      this.algorithmCategories = algorithmCategories;
    }

    this.excludeTypesList = [];
    if (excludeTypesList) {
      this.excludeTypesList = excludeTypesList;
    }
  }

  /**
   * @precondition The provided modelData must have been initialized
   */
  init()
  {
    this.mediaStateTypes = this._modelData.getStoredMediaStateTypes();
    this.localizationStateTypes = this._modelData.getStoredLocalizationStateTypes();
    this.localizationTypes = this._modelData.getStoredLocalizationTypes();
    this.mediaTypes = this._modelData.getStoredMediaTypes();
    this.versions = this._modelData.getStoredVersions();
    this.sections = this._modelData.getStoredSections();

    this.algorithms = [];
    var algorithms = this._modelData.getStoredAlgorithms();

    if (this.algorithmCategories != undefined) {
      for (const algo of algorithms) {
        if (algo.categories != undefined) {
          for (const algoCategory of algo.categories) {
            if (this.algorithmCategories.indexOf(algoCategory) >= 0) {
              this.algorithms.push(algo);
              break;
            }
          }
        }
      }
    }
    else {
      this.algorithms = algorithms;
    }

    var stateTypeOptions = [];
    for (let idx = 0; idx < this.mediaStateTypes.length; idx++) {
      let stateType = this.mediaStateTypes[idx];
      stateTypeOptions.push(`${stateType.name} (ID:${stateType.id})`);
    }
    for (let idx = 0; idx < this.localizationStateTypes.length; idx++) {
      let stateType = this.localizationStateTypes[idx];
      stateTypeOptions.push(`${stateType.name} (ID:${stateType.id})`);
    }

    // Want to be able to filter based on localization dtypes. Package up the localization types
    // and add it as an attribute
    var localizationTypeOptions = [];
    for (let idx = 0; idx < this.localizationTypes.length; idx++) {
      let locType = this.localizationTypes[idx];
      localizationTypeOptions.push(`${locType.dtype}/${locType.name} (ID:${locType.id})`);
    }

    // Versions aren't typically part of the localization type's user attribute list.
    // Pretend that it's an attribute with the name _version and apply it to each
    // localization type so that it can be part of the filter parameters.
    var versionNames = [];
    for (let idx = 0; idx < this.versions.length; idx++) {
      let version = this.versions[idx];
      versionNames.push(`${version.name} (ID:${version.id})`);
    }

    // Media sections aren't typically part of the media type's user attribute list.
    // Pretend that it's an attribute with the name _section and apply it to each
    // media type so that it can be part of the filter parameters.
    var sectionNames = [];
    for (let idx = 0; idx < this.sections.length; idx++) {
      let section = this.sections[idx];
      if (section.tator_user_sections != null) {
        sectionNames.push(`${section.name} (ID:${section.id})`);
      }
    }

    // Create the filter options
    this._allTypes = [];

    if (this.excludeTypesList.indexOf("Medias") < 0) {
      for (let idx = 0; idx < this.mediaTypes.length; idx++) {
        let entityType = JSON.parse(JSON.stringify(this.mediaTypes[idx]));
        entityType.typeGroupName = "Media";

        var sectionAttribute = {
          choices: sectionNames,
          name: "_section",
          dtype: "enum"
        };
        entityType.attribute_types.push(sectionAttribute);

        this._allTypes.push(entityType);
      }
    }

    if (this.excludeTypesList.indexOf("Localizations") < 0) {
      for (let idx = 0; idx < this.localizationTypes.length; idx++) {
        let entityType = JSON.parse(JSON.stringify(this.localizationTypes[idx]));
        entityType.typeGroupName = "Annotation";

        var versionAttribute = {
          choices: versionNames,
          name: "_version",
          dtype: "enum"
        };
        entityType.attribute_types.push(versionAttribute);

        var dtypeAttribute = {
          choices: localizationTypeOptions,
          name: "_dtype",
          dtype: "enum"
        }
        entityType.attribute_types.push(dtypeAttribute);

        this._allTypes.push(entityType);
      }
    }

    if (this.excludeTypesList.indexOf("MediaStates") < 0) {
      for (let idx=0; idx < this.mediaStateTypes.length; idx++) {
        let entityType = JSON.parse(JSON.stringify(this.mediaStateTypes[idx]));
        entityType.typeGroupName = "Collection";

        var versionAttribute = {
          choices: versionNames,
          name: "_version",
          dtype: "enum"
        };
        entityType.attribute_types.push(versionAttribute);

        var typeAttribute = {
          choices: stateTypeOptions,
          name: "_type",
          dtype: "enum"
        }
        entityType.attribute_types.push(typeAttribute);

        this._allTypes.push(entityType);
      }
    }

    if (this.excludeTypesList.indexOf("LocalizationStates") < 0) {
      for (let idx=0; idx < this.localizationStateTypes.length; idx++) {
        let entityType = JSON.parse(JSON.stringify(this.localizationStateTypes[idx]));
        entityType.typeGroupName = "Collection";

        var versionAttribute = {
          choices: versionNames,
          name: "_version",
          dtype: "enum"
        };
        entityType.attribute_types.push(versionAttribute);

        var typeAttribute = {
          choices: stateTypeOptions,
          name: "_type",
          dtype: "enum"
        }
        entityType.attribute_types.push(typeAttribute);

        this._allTypes.push(entityType);
      }
    }
  }

  /**
   * Returns an array of all the types
   * init() must have been called prior to executing this
   *
   * @returns {array} - Array of all types (localizationType)
   *
   * #TODO Add more types
   * #TODO Add built in attributes (created by, versions, name, section)
   */
  getAllTypes()
  {
    return this._allTypes;
  }

  /**
   * #TODO
   */
  getAlgorithms() {
    return this.algorithms;
  }

  /**
   * #TODO
   */
  getProjectId() {
    return this._modelData.getProjectId();
  }

  /**
   * #TODO
   */
  async launchAlgorithm(algorithm, parameters) {
    return this._modelData.launchAlgorithm(algorithm, parameters);
  }
}