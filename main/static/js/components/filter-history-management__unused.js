// @TODO
// This should allow a filtered page view to be triggered via URL params
// Needs testings for accuracy
// Integrated with entity-gallery-paginator and filter modules to show the correct data listed

class FilterHistoryManagement {
  constructor(){
    this._paginationState = {};
    this._filterState = {};
  }
  // Handle push state, will not remake query param if no change in pagination or filter
  // uses passed states instead of reading in case there are changes
  _handlePushState({ fs = null, ps = null} = {}){
    const state = { 'page_id': this.projectId }
    const title = ''
    const urlBase = window.location.pathname;
    let pq = "";
    let fq = "";

    // Get pagination info for URL
    if(ps !== null && ps && typeof ps !== "undefined") {
      let start = typeof ps.start != "undefined" ? ps.start : 0;
      let stop = typeof ps.stop != "undefined" ? ps.stop : 10;
      let page = typeof ps.page != "undefined" ? ps.page : 1;
      let pageSize = typeof ps.pageSize != "undefined" ? ps.pageSize : 10;

      pq = `start=${start}&stop=${stop}&page=${page}&pageSize=${pageSize}`;
    }

     // Get filter info for URL
    if(fs != null && typeof fs !== "undefined") {
      let searchString = typeof fs.paramString !== "undefined" ? fs.paramString : "";
      fq =`search=${searchString}`;
    }

    const URL = `${urlBase}?${pq}${fq != null ? "&" : ""}${fq} `;

    if(pq || fq) return history.pushState(state, title, URL);
  }

  // @TODO start of integrating query params into pages
  _readQueryParams(){
    // example query: ?&search=test_bool%5C%20gff%5C%20123%3Atrue
    let thereWereFixes = false;
    // Reads Query params and updates the default states before card gallery is drawn
    const queryString = window.location.search;
    const urlParams = new URLSearchParams(queryString);

    //Update filter with query params
    if(urlParams.get("search")) {
      let paramVal = urlParams.get("search");
      this._filterState.paramString = "search="+ encodeURI( paramVal );
    } 

    // Update pagination state from query params
    // Only if we minimally have either a page, or a start & stop
    if(urlParams.get("page") || (urlParams.get("start") && urlParams.get("stop"))){
      // Set start and stop
      if(urlParams.get("start")) this._paginationState.start = urlParams.get("start");
      if(urlParams.get("stop")) this._paginationState.stop = urlParams.get("stop");      
      
      // Page size (with conditions for != start stop, or page #)
      if(urlParams.get("pageSize")) {
        if( urlParams.get("start") && urlParams.get("stop") ) {
          let paramSize = Number(urlParams.get("pageSize"));
          let paramStart = Number(urlParams.get("start"));
          let paramStop = Number(urlParams.get("stop"));
          let startStopRange = (paramStop - paramStart);

          if( startStopRange !== paramSize) {
            if( (startStopRange == 10) || (startStopRange == 25) || (startStopRange == 50)){
              // if it on track with our page size options this use instead of passed pagesz
              this._paginationState.pageSize = startStopRange;
              let page = startStopRange / paramStart;
              if( page !== this._paginationState.page ){
                this._paginationState.page = page;
                thereWereFixes = true;
              }
            } else { // If stop & start don't make sense ignore them 
              // Means the start and stop match pgsize... reset them to match, use pgSize as truth
              // @TODO
              // find start & stop using pageSize and page
            }
            
          }
          }
        } else {
          // Means the start and stop match pgsize...
          // Double check the page value & set the size as it is passed
          this._paginationState.pageSize = urlParams.get("pageSize");
        }

        // Use start and top to double check page selected
        // let pageCalc = this._paginationState.stop / this._paginationState.start;
        // if( pageCalc !== this._paginationState.page ){
        //   this._paginationState.page = page;
        // }
      
    }

    if(thereWereFixes){
      // Pushes path + new Query param so we can continue on happy path easier next time
      //this._handlePushState({ fp : this._filterState, ps : this._paginationState});
    }

    return { pagState : this._paginationState, filtState : this._filterState }
  }
}

