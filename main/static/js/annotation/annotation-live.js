class AnnotationLive extends TatorElement {
  constructor() {
    super();

    window.tator_live = this;

    const playerDiv = document.createElement("div");
    playerDiv.setAttribute("class", "annotation__multi-player rounded-bottom-2");
    this._shadow.appendChild(playerDiv);

    this._vidDiv = document.createElement("div");
    playerDiv.appendChild(this._vidDiv);

    const div = document.createElement("div");
    div.setAttribute("class", "video__controls d-flex flex-items-center flex-justify-between px-4");
    playerDiv.appendChild(div);
    this._controls = div;

    const playButtons = document.createElement("div");
    playButtons.setAttribute("class", "d-flex flex-items-center");
    div.appendChild(playButtons);

    const play = document.createElement("play-button");
    this._play = play;
    this._play.setAttribute("is-paused", "");
    playButtons.appendChild(this._play);

    const settingsDiv = document.createElement("div");
    settingsDiv.setAttribute("class", "d-flex flex-items-center");
    div.appendChild(settingsDiv);

    this._qualityControl = document.createElement("quality-control");
    settingsDiv.appendChild(this._qualityControl);
    this._qualityControl.hideAdvanced();

    const timelineDiv = document.createElement("div");
    timelineDiv.setAttribute("class", "scrub__bar d-flex flex-items-center flex-grow px-4");
    playerDiv.appendChild(timelineDiv);
    this._timelineDiv = timelineDiv;

    const timeDiv = document.createElement("div");
    timeDiv.setAttribute("class", "d-flex flex-items-center flex-justify-between");
    playButtons.appendChild(timeDiv);

    this._currentTimeText = document.createElement("div");
    this._currentTimeText.textContent = "";
    //this._currentTimeText.style.width = "35px";
    this._currentTimeText.style.paddingLeft = "15px";
    this._currentTimeText.setAttribute("tooltip", "Last Update");
    playButtons.appendChild(this._currentTimeText);

    var outerDiv = document.createElement("div");
    outerDiv.setAttribute("class", "py-2");
    outerDiv.style.width="100%";
    var seekDiv = document.createElement("div");
    this._slider = document.createElement("seek-bar");

    this._domParents = []; //handle defered loading of video element
    seekDiv.appendChild(this._slider);
    outerDiv.appendChild(seekDiv);

    this._zoomSliderDiv = document.createElement("div");
    this._zoomSliderDiv.style.marginTop = "10px";
    outerDiv.appendChild(this._zoomSliderDiv);

    const frameDiv = document.createElement("div");
    frameDiv.setAttribute("class", "d-flex flex-items-center flex-justify-between");
    playButtons.appendChild(frameDiv);

    this._volume_control = document.createElement("volume-control");
    settingsDiv.appendChild(this._volume_control);
    this._volume_control.addEventListener("volumeChange", (evt) => {
      for (let video of this._videos)
      {
        video.setVolume(evt.detail.volume);
      }
    });
    const fullscreen = document.createElement("video-fullscreen");
    settingsDiv.appendChild(fullscreen);

    this._scrubInterval = 1000.0/Math.min(guiFPS,30);
    this._lastScrub = Date.now();
    this._rate = 1;

    // Magic number matching standard header + footer
    // #TODO This should be re-thought and more flexible initially
    this._videoHeightPadObject = {height: 210};
    this._headerFooterPad = 100; // Another magic number based on the header and padding below controls footer

    const searchParams = new URLSearchParams(window.location.search);
    this._quality = 1080;
    this._focusQuality = 1080;
    this._dockQuality = 144;
    if (searchParams.has("quality"))
    {
      this._quality = Number(searchParams.get("quality"));
    }

    this._slider.addEventListener("input", evt => {
      this.handleSliderInput(evt);
    });

    this._slider.addEventListener("change", evt => {
      this.handleSliderChange(evt);
    });

    play.addEventListener("click", () => {
      if (this.is_paused())
      {
        this.play();
      }
      else
      {
        this.pause();
      }
    });

    fullscreen.addEventListener("click", evt => {
      if (fullscreen.hasAttribute("is-maximized")) {
        fullscreen.removeAttribute("is-maximized");
        this._playerDiv.classList.remove("is-full-screen");
        this.dispatchEvent(new Event("minimize", {composed: true}));
      } else {
        fullscreen.setAttribute("is-maximized", "");
        this._playerDiv.classList.add("is-full-screen");
        this.dispatchEvent(new Event("maximize", {composed: true}));
      }
      window.dispatchEvent(new Event("resize"));
    });

    document.addEventListener("keydown", evt => {

      if (document.body.classList.contains("shortcuts-disabled"))
      {
        return;
      }

      if (evt.ctrlKey && (evt.key == "m")) {
        fullscreen.click();
      }
      else if (evt.code == "Space")
      {
        evt.preventDefault();
        if (this.is_paused())
        {
          this.play();
        }
        else
        {
          this.pause();
        }
      }
    });
  }

  static get observedAttributes() {
    return ["rate"];
  }

  attributeChangedCallback(name, oldValue, newValue) {
    switch (name) {
      case "rate":
        if (newValue >= 1) {
          this._rateControl.textContent = Math.round(newValue) + "x";
        } else {
          this._rateControl.textContent = Number(newValue).toFixed(2) + "x";
        }
        break;
    }
  }

  set quality(val)
  {
    this._qualityControl.quality = val;
  }

  enableQualityChange()
  {
    this._qualityControl.removeAttribute("disabled");
  }
  disableQualityChange()
  {
    this._qualityControl.setAttribute("disabled", "");
  }

  enableRateChange()
  {
    //pass
  }
  disableRateChange()
  {
    //pass
  }

  /**
   * Process the frame input text field and attempts to jump to that frame
   */
  processFrameInput() {

    var frame = parseInt(this._currentFrameInput.value);
    if (isNaN(frame)) {
      console.log("Provided invalid frame input: " + this._currentFrameInput.value);
      this._currentFrameInput.classList.add("has-border");
      this._currentFrameInput.classList.add("is-invalid");
      return;
    }

    const maxFrame = this._maxFrameNumber;
    if (frame > maxFrame)
    {
      frame = maxFrame;
    }
    else if (frame < 0)
    {
      frame = 0;
    }

    this._currentFrameInput.classList.remove("has-border");
    this._currentFrameInput.classList.remove("is-invalid");
    this.goToFrame(frame);
    this.checkAllReady();
  }

  /**
   * Process the time input text field and attempts to jump to the corresponding frame
   */
  processTimeInput() {

    var timeTokens = this._currentTimeInput.value.split(":");
    if (timeTokens.length != 2)
    {
      console.log("Provided invalid time (minutes:seconds) expected: " + this._currentTimeInput.value);
      this._currentTimeInput.classList.add("has-border");
      this._currentTimeInput.classList.add("is-invalid");
      return;
    }

    var minutes = parseInt(timeTokens[0]);
    if (isNaN(minutes))
    {
      console.log("Provided invalid time (minutes:seconds) expected: " + this._currentTimeInput.value);
      this._currentTimeInput.classList.add("has-border");
      this._currentTimeInput.classList.add("is-invalid");
      return;
    }

    var seconds = parseInt(timeTokens[1]);
    if (isNaN(seconds))
    {
      console.log("Provided invalid time (minutes:seconds) expected: " + this._currentTimeInput.value);
      this._currentTimeInput.classList.add("has-border");
      this._currentTimeInput.classList.add("is-invalid");
      return;
    }

    var frame = this._timeToFrame(minutes, seconds);
    const maxFrame = this._maxFrameNumber;
    if (frame > maxFrame)
    {
      frame = maxFrame;
    }
    else if (frame < 0)
    {
      frame = 0;
    }

    this._currentTimeInput.classList.remove("has-border");
    this._currentTimeInput.classList.remove("is-invalid");
    this.goToFrame(frame);
    this.checkAllReady();
  }

  set permission(val) {
    for (let video of this._videos)
    {
      video.permission = val;
    }
    this._permission = val;
  }

  addDomParent(val)
  {
    this._domParents.push(val);
  }

  set undoBuffer(val) {
    this._undoBuffer = val;
    for (let video of this._videos)
    {
      video.undoBuffer = val;
    }
  }

  set mediaInfo(val) {
    this._mediaInfo = val;
    this._videos = [];
    this._multi_layout = val.media_files['layout'];

    if (val.media_files.quality)
    {
      this._quality = val.media_files.quality;
    }

    const total_video_spots = this._multi_layout[0] * this._multi_layout[1];
    if (val.media_files['live'].length > total_video_spots)
    {
      window.alert("Invalid live object! Not enough grid spots for media.");
    }

    this.dispatchEvent(new Event("canvasReady", {
      composed: true
    }));

    // First, setup the nominal grid section which will be based off the predefined configuration
    this._gridDiv = document.createElement("div");
    this._gridDiv.setAttribute("class", "annotation__multi-grid")
    this._gridDiv.style.gridTemplateColumns =
      "auto ".repeat(this._multi_layout[1]);
      this._gridDiv.style.gridTemplateRows =
      "auto ".repeat(this._multi_layout[0]);
    this._vidDiv.appendChild(this._gridDiv);

    // Next, setup the focus video/dock areas.
    this._focusTopDiv = document.createElement("div");
    this._focusTopDiv.setAttribute("class", "d-flex");
    this._vidDiv.appendChild(this._focusTopDiv);

    this._focusDiv = document.createElement("div");
    this._focusDiv.setAttribute("class", "d-flex flex-justify-right");
    this._focusTopDiv.appendChild(this._focusDiv);

    this._focusTopDockDiv = document.createElement("div");
    this._focusTopDockDiv.setAttribute("class", "d-flex flex-wrap");
    this._focusTopDiv.appendChild(this._focusTopDockDiv);

    this._focusBottomDiv = document.createElement("div");
    this._focusBottomDiv.setAttribute("class", "d-flex");
    this._vidDiv.appendChild(this._focusBottomDiv);

    this._focusBottomDockDiv = document.createElement("div");
    this._focusBottomDockDiv.setAttribute("class", "annotation__multi-secondary d-flex flex-row");
    this._focusBottomDiv.appendChild(this._focusBottomDockDiv);

    this._videoDivs = {};
    this._videoGridInfo = {};
    let idx = 0;
    this._selectedDock = null; // Set with right click options

    this._playbackReadyId = 0;
    this._numVideos = val.media_files['live'].length;
    this._resolutions = [];
    for (let vid_id = 0; vid_id < this._numVideos; vid_id++)
    {
      let roi_vid = document.createElement("live-canvas");
      if (vid_id == 0)
      {
        roi_vid.addEventListener("healthy", () => {
          const d = new Date();
          const date_str = `${d.getUTCFullYear()}-${d.getUTCMonth()}-${d.getUTCDay()}T${d.getUTCHours()}:${d.getUTCMinutes()}:${d.getUTCSeconds()}Z`;
          this._currentTimeText.textContent = date_str;
        });
        let feeds = val.media_files['live'][vid_id]['feeds'];
        for (let feed of feeds)
        {
          this._resolutions.push(feed.resolution[0]);
        }
      }
      const wrapper_div = document.createElement("div");
      wrapper_div.setAttribute("class", "annotation__multi-grid-entry d-flex");

      this._videoDivs[vid_id] = wrapper_div;
      roi_vid.setupResizeHandler([1920,1080], this._multi_layout[0], this._videoHeightPadObject);
      roi_vid.addEventListener("error", (evt) =>{
        roi_vid.pause();
        Utilities.warningAlert(evt.detail.msg, '#ff3e1d', false);
        this.pause(true);
      });
      roi_vid.loadFeeds(val.media_files['live'][vid_id]);
      this._videoGridInfo[vid_id] = {row: Math.floor(idx / this._multi_layout[1])+1, col: (idx % this._multi_layout[1])+1, video: roi_vid};

      this._videos.push(roi_vid);
      wrapper_div.appendChild(roi_vid);

      // Setup addons for multi-menu and initialize the gridview
      this.assignToGrid(false);
      this.setupMultiMenu(vid_id);
      idx += 1;
    }
    this._qualityControl.resolutions = this._resolutions;
    this._qualityControl.show();
  }

  /**
   * Expected to occur at initialization. Dispatches the default video settings.
   */
  setDefaultVideoSettings(idx) {

    console.log(`**** Setting default video settings for: ${idx}`)

    const seekInfo = this._videos[idx].getQuality("seek");
    const scrubInfo = this._videos[idx].getQuality("scrub");
    const playInfo = this._videos[idx].nearestQuality(this._quality);
    const focusedInfo = this._videos[idx].nearestQuality(this._focusQuality);
    const dockedInfo = this._videos[idx].nearestQuality(this._dockQuality);

    this.dispatchEvent(new CustomEvent("defaultVideoSettings", {
      composed: true,
      detail: {
        media: this._videos[idx],
        seekQuality: seekInfo.quality,
        seekFPS: seekInfo.fps,
        scrubQuality: scrubInfo.quality,
        scrubFPS: scrubInfo.fps,
        playQuality: playInfo.quality,
        playFPS: playInfo.fps,
        focusedQuality: focusedInfo.quality,
        focusedFPS: focusedInfo.fps,
        dockedQuality: dockedInfo.quality,
        dockedFPS: dockedInfo.fps
      }
    }));
  }

  setMultiviewUrl(multiviewType, vid_id)
  {
    let get_pos = () => {
      let idx = 0;
      for (let videoId in this._videoDivs)
      {
        if (videoId == vid_id)
        {
          break;
        }
        else
        {
          idx++;
        }
      }
      return idx;
    };

    if (multiviewType == "horizontal")
    {
      var multiview = "hGrid";
    }
    else
    {
      var multiview = get_pos(vid_id);
    }
    var search_params = new URLSearchParams(window.location.search);
    search_params.set("multiview", multiview);
    const path = document.location.pathname;
    const searchArgs = search_params.toString();
    var newUrl = path + "?" + searchArgs;
    if (this.pushed_state)
    {
      window.history.replaceState(this.multview_state_obj, "Multiview", newUrl);
    }
    else
    {
      window.history.pushState(this.multview_state_obj, "Multiview", newUrl);
      this.pushed_state = true;
    }
  }

  setFocus(vid_id)
  {
    for (let videoId in this._videoDivs)
    {
      let video = this._videoDivs[videoId].children[0];
      video.contextMenuNone.hideMenu();
      if (videoId != vid_id)
      {
        this.assignToSecondary(Number(videoId), this._dockQuality);
      }
      else
      {
        this.setMultiviewUrl("focus", Number(videoId));
        this.assignToPrimary(Number(videoId), this._focusQuality);
      }
    }
  }

  setFocusVertical(vid_id)
  {
    this._selectedDock = this._focusTopDockDiv;
    this.setFocus(vid_id);
  }

  setHorizontal()
  {
    this._selectedDock = this._focusBottomDockDiv;
    this.setMultiviewUrl("horizontal");
    for (let videoId in this._videoDivs)
    {
      let video = this._videoDivs[videoId].children[0];
      video.contextMenuNone.hideMenu();
      this.assignToSecondary(Number(videoId), this._quality);
      video.contextMenuNone.displayEntry("Focus Video", true);
      video.contextMenuNone.displayEntry("Horizontal Multiview", false);
      video.contextMenuNone.displayEntry("Reset Multiview", true);
    }
  }

  setupMultiMenu(vid_id)
  {
    let div = this._videoDivs[vid_id];
    let video_element = div.children[0];

    this.pushed_state = false;
    this.multview_state_obj = {"state": "multiview"};
    let reset_url = () => {
      var search_params = new URLSearchParams(window.location.search);
      if (search_params.has("multiview"))
      {
        search_params.delete("multiview");
        const path = document.location.pathname;
        const searchArgs = search_params.toString();
        var newUrl = path + "?" + searchArgs;
        if (this.pushed_state)
        {
          window.history.replaceState(this.multview_state_obj, "Multiview", newUrl);
        }
        else
        {
          window.history.pushState(this.multview_state_obj, "Multiview", newUrl);
          this.pushed_state = true;
        }
      }
    };

    // Move all the videos back into their respective spots in the grid
    let reset = () => {
      for (let videoId in this._videoDivs)
      {
        let video = this._videoDivs[videoId].children[0];
        video.contextMenuNone.hideMenu();
      }
      this.assignToGrid();
      reset_url();
    };

    let focusVertical = () => {
      this.setFocusVertical(vid_id);
    };

    video_element.contextMenuNone.addMenuEntry("Focus Video", focusVertical);
    video_element.contextMenuNone.addMenuEntry("Horizontal Multiview", this.setHorizontal.bind(this));
    video_element.contextMenuNone.addMenuEntry("Reset Multiview", reset);
  }

  // Move all but the first to secondary
  debug_multi()
  {
    let pos = 0;
    for (let video in this._videoDivs)
    {
      if (pos != 0)
      {
        this.assignToSecondary(Number(video));
      }
      pos++;
    }
  }

  makeAllVisible(node)
  {
    node.style.visibility = null;
    for (let child of node.children)
    {
      this.makeAllVisible(child);
    }

    // Don't forget about the shadow children
    if (node._shadow)
    {
      for (let child of node._shadow.children)
      {
        this.makeAllVisible(child);
      }
    }
  }
  assignToPrimary(vid_id, quality)
  {
    let div = this._videoDivs[vid_id];
    this._focusDiv.appendChild(div);
    this.setMultiProportions();
    // These go invisible on a move.
    this.makeAllVisible(div);
    let video = div.children[0];
    video.setQuality(quality);
  }

  assignToSecondary(vid_id, quality)
  {
    let div = this._videoDivs[vid_id];
    this._selectedDock.appendChild(div);
    this.setMultiProportions();
    // These go invisible on a move.
    this.makeAllVisible(div);
    let video = div.children[0];
    video.setQuality(quality);
  }

  assignToGrid(setContextMenu=true)
  {
    for (let videoId in this._videoDivs)
    {
      let div = this._videoDivs[videoId];
      this._gridDiv.appendChild(div);
      this.makeAllVisible(div);

      let video = div.children[0];
      video.setQuality(this._quality);

      if (setContextMenu)
      {
        video.contextMenuNone.displayEntry("Focus Video", true);
        video.contextMenuNone.displayEntry("Horizontal Multiview", true);
        video.contextMenuNone.displayEntry("Reset Multiview", false);
      }
      video.gridRows = this._multi_layout[0];

      let gridInfo = this._videoGridInfo[videoId];
      video.style.gridColumn = gridInfo.col;
      video.style.gridRow = gridInfo.row;
    }

    this._gridDiv.style.display = "grid";
    this._focusDiv.style.display = "none";
    this._focusBottomDockDiv.style.display = "none";
    this._focusTopDockDiv.style.display = "none";

    setTimeout(() => {
      window.dispatchEvent(new Event('resize'));
    }, 250);
  }

  /**
   * Expected to be called only when a video is being focused
   */
  setMultiProportions()
  {
    var horizontalDock = this._selectedDock == this._focusBottomDockDiv;

    if (horizontalDock)
    {
      this._focusDiv.style.display = "none";
      this._selectedDock.style.display = "flex";
      this._selectedDock.style.width = "100%";
    }
    else
    {
      this._focusDiv.style.display = "flex";
      this._selectedDock.style.display = "block";
      this._focusDiv.style.width = "70%";
      this._selectedDock.style.width = "30%";
    }
    this._gridDiv.style.display = "none";

    for (let primary of this._focusDiv.children)
    {
      primary.children[0].stretch = true;
      primary.children[0].contextMenuNone.displayEntry("Focus Video", false);
      primary.children[0].contextMenuNone.displayEntry("Horizontal Multiview", true);
      primary.children[0].contextMenuNone.displayEntry("Reset Multiview", true);
      primary.children[0].gridRows = 1;
      primary.children[0].style.gridColumn = null;
      primary.children[0].style.gridRow = null;
    }

    for (let docked of this._selectedDock.children)
    {
      docked.children[0].stretch = true;
      docked.children[0].contextMenuNone.displayEntry("Focus Video", true);
      docked.children[0].contextMenuNone.displayEntry("Horizontal Multiview", true);
      docked.children[0].contextMenuNone.displayEntry("Reset Multiview", true);
      docked.children[0].style.gridColumn = null;
      docked.children[0].style.gridRow = null;

      if (horizontalDock)
      {
        docked.children[0].gridRows = 1;
      }
      else
      {
        docked.children[0].gridRows = this._selectedDock.children.length;
      }
    }

    // Wait for reassignments to calculate resize event.
    setTimeout(() => {
      window.dispatchEvent(new Event('resize'));
    }, 250);
  }

  set annotationData(val) {
    // Debounce this
    if (this._annotationData)
    {
      return;
    }

    this._annotationData = val;
    for (let video of this._videos)
    {
      video.annotationData = val;
    }
  }

  newMetadataItem(dtype, metaMode, objId) {
    for (let video of this._videos)
    {
      video.style.cursor = "crosshair";
      video.newMetadataItem(dtype, metaMode, objId);
    }
  }

  submitMetadata(data) {
    this._video.submitMetadata(data);
    this._video.refresh();
  }

  updateType(objDescription) {
    this._video.updateType(objDescription);
  }

  is_paused()
  {
    return this._play.hasAttribute("is-paused");
  }

  is_disabled()
  {
    return this._play._button.hasAttribute("disabled");
  }

  play()
  {
    if (this.is_disabled() == true)
    {
      return;
    }

    
    const paused = this.is_paused();
    if (paused) {
      let promises = [];
      document.body.style.cursor = "wait";
      this._play._button.setAttribute("disabled","");
	    this._play.removeAttribute("is-paused");
      for (let idx = 0; idx < this._videos.length; idx++)
      {
        let p = new Promise((resolve)=>{
	        let video = this._videos[idx];
          let handler = () => {
            video.removeEventListener('playing', handler);
            resolve();
          };
          video.addEventListener('playing', handler);
	        video.play();
        });
        promises.push(p);
      }
      Promise.all(promises).then(() => {
        document.body.style.cursor = null;
        this._play._button.removeAttribute("disabled");
      });

    }
  }

  onPlaying()
  {
    document.body.style.cursor = null;
    this._play._button.removeAttribute("disabled");
  }


  pause(override)
  {
    if (this.is_disabled() == true && !override)
    {
      return;
    }
    if (override)
    {
      this._play._button.removeAttribute("disabled");
      document.body.style.cursor = null;
    }
    const paused = this.is_paused();
    if (paused == false) {
      for (let video of this._videos)
      {
        video.pause();
      }
      this._play.setAttribute("is-paused", "");
    }
  }

  refresh() {
    for (let video of this._videos)
    {
      video.refresh();
    }
  }

  defaultMode() {
    for (let video of this._videos)
    {
      video.style.cursor = "default";
      video.defaultMode();
    }
  }


  setQuality(quality, buffer, isDefault) {
    for (let video of this._videos)
    {
      video.setQuality(quality, buffer);
    }
  }

  /**
   * Expected to be set by something like annotation-page.
   * @param {tator.Media object} val
   */
  setAvailableQualities(val) {
      this._qualityControl.hide();
      // TODO
  }

  zoomPlus() {
    for (let video of this._videos)
    {
      let [x, y, width, height] = video._roi;
      width /= 2.0;
      height /= 2.0;
      x += width / 2.0;
      y += height / 2.0;
      video.setRoi(x, y, width, height);
      video._dirty = true;
      video.refresh();
    }
  }

  zoomMinus() {
    for (let video of this._videos)
    {
      let [x, y, width, height] = video._roi;
      width *= 2.0;
      height *= 2.0;
      x -= width / 4.0;
      y -= height / 4.0;
      width = Math.min(width, video._dims[0]);
      height = Math.min(height, video._dims[1]);
      x = Math.max(x, 0);
      y = Math.max(y, 0);
      video.setRoi(x, y, width, height);
      video._dirty = true;
      video.refresh();
    }
  }

  zoomIn() {
    for (let video of this._videos)
    {
      video.style.cursor="zoom-in";
      video.zoomIn();
    }
  }

  zoomOut() {
    for (let video of this._videos)
    {
      video.zoomOut();
    }
  }

  pan() {
    for (let video of this._videos)
    {
      video.style.cursor="move";
      video.pan();
    }
  }

  // Go to the frame at the highest resolution
  goToFrame(frame) {
    // TODO
  }

  selectNone() {
    for (let video of this._videos)
    {
      video.selectNone();
    }
  }

  selectLocalization(loc, skipAnimation, muteOthers, skipGoToFrame) {

  }

  selectTrack(track, frameHint, skipGoToFrame) {

  }

  selectTrackUsingId(stateId, stateTypeId, frameHint, skipGoToFrame) {

  }

  deselectTrack() {

  }


  toggleBoxFills(fill) {

  }

  toggleTextOverlays(on) {
    for (let video of this._videos)
    {
      video.toggleTextOverlays(on);
    }
  }

  safeMode() {
    return 0;
  }

  _frameToTime(frame) {
    const totalSeconds = frame / this._fps_of_max;
    const seconds = Math.floor(totalSeconds % 60);
    const secFormatted = ("0" + seconds).slice(-2);
    const minutes = Math.floor(totalSeconds / 60);
    return minutes + ":" + secFormatted;
  }

  _timeToFrame(minutes, seconds) {
    var frame = minutes * 60 * this._fps_of_max + seconds * this._fps_of_max + 1;
    return frame;
  }

  getVideoSettings() {
   //none
  }

}

customElements.define("annotation-live", AnnotationLive);
