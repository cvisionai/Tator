class AnnotationPanelData extends HTMLElement {
    constructor(){
        super();
    }

    init( modelData ) {
        // Connect to model for fetch calls
        this._modelData = modelData;
    }

    /*
    * Gets Media information for the localization
    * - Required information is what type of media (image/video/multi)
    * - Other parts of media info used to get media image URL
    * - Manipulate data here to provide that to page
    */
    async getMediaData(mediaId) {
        this.mediaInfo = await this._modelData.getMedia( mediaId );
        this.mediaTypeData = await this._modelData.getMediaType( this.mediaInfo.meta );

        const mediaData = {
            mediaInfo : this.mediaInfo,
            mediaTypeData : this.mediaTypeData
        };

        return mediaData;
    }

    /* Future object to be returned like.... */
    // Assumes we already have the loc coordinates
    /*
        {
            mediaInfo : {
                id : [int]
                type : "image",
                url : [ path to image ] 
            }
        }


    */

    

}

customElements.define("annotation-panel-data", AnnotationPanelData);