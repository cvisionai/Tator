/**
 * Class that contains the data about the annotation analytics gallery.
 * This provides an interface between the UI elements to the underlying data calls.
 */
class AnnotationCardData extends HTMLElement {
  constructor() {
    super();
  }

  /**
   * @precondition The provided modelData must have been initialized
   * @param {TatorData} modelData
   */
  init(modelData) {
    this._modelData = modelData;

    this.mediaTypes = this._modelData.getStoredMediaTypes();
    this.mediaTypeMap = new Map();
    for (const mediaType of this.mediaTypes) {
      this.mediaTypeMap.set(mediaType.id, mediaType);
    }

    this.localizationTypes = this._modelData.getStoredLocalizationTypes();
    this.localizationTypeMap = new Map();
    for (const locType of this.localizationTypes) {
      this.localizationTypeMap.set(locType.id, locType);
    }

    this.projectId = this._modelData.getProjectId();
    this.filterConditions = "";
  }

  /**
   * @param {array} filterConditions array of FilterConditionData objects
   */
  async _reload(filterConditions) {
    this.filterConditions = filterConditions;
    this.cardList = {};
    this.cardList.cards = [];
    this.cardList.total = await this._modelData.getFilteredLocalizations("count", filterConditions);
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
   * @param {array} localizations Localizations to displays in the annotation gallery
   * @returns {Promise}
   */
  _getCardList(localizations, medias) {
    return new Promise((resolve, reject) => {

      let counter = localizations.length;
      var haveCardShells = function () {
        if (counter <= 0) { resolve(); }
      }

      // Handle the case where we get nothing back
      haveCardShells();

      for (let [i, l] of localizations.entries()) {
        let id = l.id;
        let mediaLink = this._modelData.generateMediaLink(l.media, l.frame, l.id, l.meta, l.version);
        let entityType = this.localizationTypeMap.get(l.meta);

        let attributes = l.attributes;
        let created = new Date(l.created_datetime);
        let modified = new Date(l.modified_datetime);
        let mediaId = l.media;

        let position = i + this.cardList.paginationState.start;
        let posText = `${position + 1} of ${this.cardList.total}`;

        let media;
        for (let idx = 0; idx < medias.length; idx++) {
          if (medias[idx].id == mediaId) {
            media = medias[idx];
            break;
          }
        }

        let mediaInfo = {
          id: mediaId,
          entityType: this.mediaTypeMap.get(media.meta),
          attributes: media.attributes,
          media: media,
        }

        let card = {
          id,
          localization: l,
          entityType,
          mediaId,
          mediaInfo,
          mediaLink,
          attributes,
          created,
          modified,
          posText
        };

        this.cardList.cards.push(card);
        counter--;
        haveCardShells();

        this._modelData.getLocalizationGraphic(l.id).then((image) => {
          this.dispatchEvent(new CustomEvent("setCardImage", {
            composed: true,
            detail: {
              id: l.id,
              image: image
            }
          }));
        });
      }
    });
  }

  /**
   * @param {array} filterConditions array of FilterConditionData objects
   * @param {object} paginationState
   * @returns {object}
   */
  async makeCardList(filterConditions, paginationState) {
    if (this._needReload(filterConditions)) {
      await this._reload(filterConditions);
    }
    this.cardList.cards = [];
    this.cardList.paginationState = paginationState;

    // Get the localizations for the current page
    var localizations = await this._modelData.getFilteredLocalizations(
      "objects",
      filterConditions,
      paginationState.start,
      paginationState.stop,
      this.afterMap);

    // Query the media data associated with each localization
    var mediaPromises = [];
    var mediaList = [];
    for (let idx = 0; idx < localizations.length; idx++) {
      if (!mediaList.includes(localizations[idx].media)) {
        mediaList.push(localizations[idx].media);
      }
    }

    // #TODO change this to the put command to get the object list
    //       this potentially could move to a separate async pathway
    for (let idx = 0; idx < mediaList.length; idx++) {
      mediaPromises.push(this._modelData.getMedia(mediaList[idx]));
    }
    var medias = await Promise.all(mediaPromises);

    // Now gather all the card information
    await this._getCardList(localizations, medias);
    return this.cardList;
  }

  /**
   * Updates the provided localization card's attributes
   * @param {} cardObj Modified by this function
   */
  async updateLocalizationAttributes(cardObj) {
    var locData = await this._modelData.getLocalization(cardObj.id);
    cardObj.localization = locData;
    cardObj.attributes = locData.attributes;
    cardObj.created = new Date(locData.created_datetime);
    cardObj.modified = new Date(locData.modified_datetime);
  }

  /**
   * Updates the media attributes for all cards with the same media ID
   * @param {integer} mediaId - Media ID to retrieve and update cards with
   */
  async updateMediaAttributes(mediaId) {

    var media = await this._modelData.getMedia(mediaId);

    let mediaInfo = {
      id: mediaId,
      entityType: this.mediaTypeMap.get(media.meta),
      attributes: media.attributes,
      media: media,
    }

    for (let card of this.cardList.cards) {
      if (card.mediaId == mediaId) {
        card.mediaInfo = mediaInfo;
      }
    }
  }
}

customElements.define("annotation-card-data", AnnotationCardData);