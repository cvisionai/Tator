class AnnotationMulti extends TatorElement {
  constructor() {
    super();

    window.tator_multi = this;

    this._playerDiv = document.createElement("div");
    this._playerDiv.setAttribute("class", "annotation__multi-player rounded-bottom-2");
    this._shadow.appendChild(this._playerDiv);

    this._vidDiv = document.createElement("div");
    this._vidDiv.style.display = "flex";
    this._playerDiv.appendChild(this._vidDiv);

    const div = document.createElement("div");
    div.setAttribute("class", "video__controls d-flex flex-items-center flex-justify-between px-4");
    this._playerDiv.appendChild(div);
    this._controls = div;

    const playButtons = document.createElement("div");
    playButtons.setAttribute("class", "d-flex flex-items-center");
    div.appendChild(playButtons);

    const rewind = document.createElement("rewind-button");
    playButtons.appendChild(rewind);

    const play = document.createElement("play-button");
    this._play = play;
    this._play.setAttribute("is-paused", "");
    playButtons.appendChild(this._play);

    const fastForward = document.createElement("fast-forward-button");
    playButtons.appendChild(fastForward);

    const timelineDiv = document.createElement("div");
    timelineDiv.setAttribute("class", "d-flex flex-items-center flex-grow px-2");
    div.appendChild(timelineDiv);

    const timeDiv = document.createElement("div");
    timeDiv.style.display = "flex";
    timelineDiv.appendChild(timeDiv);

    this._currentTime = document.createElement("div");
    this._currentTime.textContent = "0:00";
    this._currentTime.style.width = "35px";
    //currentTime.style.float = "right";
    timeDiv.appendChild(this._currentTime);

    this._totalTime = document.createElement("div");
    this._totalTime.setAttribute("class", "px-2 text-gray");
    this._totalTime.textContent = "/ 0:00";
    timeDiv.appendChild(this._totalTime);

    this._timelineMore = document.createElement("entity-more");
    this._timelineMore.style.display = "none";
    timelineDiv.appendChild(this._timelineMore);
    this._displayTimelineLabels = false;

    var outerDiv = document.createElement("div");
    outerDiv.setAttribute("class", "py-4");
    outerDiv.style.width="100%";
    var seekDiv = document.createElement("div");
    this._slider = document.createElement("seek-bar");

    this._domParents = []; //handle defered loading of video element
    seekDiv.appendChild(this._slider);
    outerDiv.appendChild(seekDiv);

    var innerDiv = document.createElement("div");
    this._timeline = document.createElement("timeline-canvas");
    this._timeline.rangeInput = this._slider;
    this._timelineAttrRange = document.createElement("timeline-canvas");
    this._timelineAttrRange.rangeInput = this._slider;
    innerDiv.appendChild(this._timeline);
    innerDiv.appendChild(this._timelineAttrRange);
    outerDiv.appendChild(innerDiv);
    timelineDiv.appendChild(outerDiv);

    const frameDiv = document.createElement("div");
    frameDiv.style.display = "flex";
    timelineDiv.appendChild(frameDiv);
    const framePrev = document.createElement("frame-prev");
    frameDiv.appendChild(framePrev);

    this._currentFrame = document.createElement("div");
    this._currentFrame.setAttribute("class", "f2 text-center");
    this._currentFrame.textContent = "0";
    this._currentFrame.style.width = "15px";
    frameDiv.appendChild(this._currentFrame);

    const frameNext = document.createElement("frame-next");
    frameDiv.appendChild(frameNext);

    this._volume_control = document.createElement("volume-control");
    div.appendChild(this._volume_control);
    this._volume_control.addEventListener("volumeChange", (evt) => {
      this._video.setVolume(evt.detail.volume);
    });
    const fullscreen = document.createElement("video-fullscreen");
    div.appendChild(fullscreen);

    this._scrubInterval = 1000.0/Math.min(guiFPS,30);
    this._lastScrub = Date.now();
    this._rate = 1;

    // Magic number matching standard header + footer
    // #TODO This should be re-thought and more flexible initially
    this._videoHeightPadObject = {height: 175};
    this._headerFooterPad = 100; // Another magic number based on the header and padding below controls footer

    const searchParams = new URLSearchParams(window.location.search);
    this._quality = 720;
    if (searchParams.has("quality"))
    {
      this._quality = Number(searchParams.get("quality"));
    }

    this._timelineMore.addEventListener("click", () => {
      this._displayTimelineLabels = !this._displayTimelineLabels;
      this._timelineAttrRange.showLabels = this._displayTimelineLabels;
      this._videoHeightPadObject.height = this._headerFooterPad + this._controls.offsetHeight;
      window.dispatchEvent(new Event("resize"));
    });

    this._timelineAttrRange.addEventListener("multiCanvas", evt => {
      if (evt.detail.active) {
        this._timelineMore.style.display = "block";
      }
      else {
        this._timelineMore.style.display = "none";
      }

      this._videoHeightPadObject.height = this._headerFooterPad + this._controls.offsetHeight;
      window.dispatchEvent(new Event("resize"));
    });

    this._slider.addEventListener("input", evt => {
      // Along allow a scrub display as the user is going
      // slow
      const now = Date.now();
      const frame = Number(evt.target.value);
      const waitOk = now - this._lastScrub > this._scrubInterval;
      if (waitOk) {
        play.setAttribute("is-paused","");
        for (let video of this._videos)
        {
          video.stopPlayerThread();
          video.seekFrame(frame, video.drawFrame)
            .then(this._lastScrub = Date.now());
        }
      }
    });

    this._slider.addEventListener("change", evt => {
      play.setAttribute("is-paused","");
      // Only use the current frame to prevent glitches
      let frame = this._videos[0].currentFrame();
      if (evt.detail)
      {
        frame = evt.detail.frame;
      }

      for (let video of this._videos)
      {
        video.stopPlayerThread();
        // Use the hq buffer when the input is finalized
        video.seekFrame(frame, video.drawFrame, true)
          .then(this._lastScrub = Date.now());
      }
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

    rewind.addEventListener("click", () => {
      for (let video of this._videos)
      {
        video.pause();
        video.rateChange(this._rate);
        if (video.playBackwards())
        {
          play.removeAttribute("is-paused");
        }
      }
    });

    fastForward.addEventListener("click", () => {
      for (let video of this._videos)
      {
        video.pause();
        video.rateChange(2 * this._rate);
      }
      this.play();
    });

    framePrev.addEventListener("click", () => {
      for (let video of this._videos)
      {
        if (this.is_paused() == false)
        {
          video.pause().then(() => {
            video.back();
          });
        }
        else
        {
          video.back();
        }
      }
    });

    frameNext.addEventListener("click", () => {
      for (let video of this._videos)
      {
        if (this.is_paused() == false)
        {
          video.pause().then(() => {
            video.advance();
          });
        }
        else
        {
          video.advance();
        }
      }
    });

    this._timeline.addEventListener("select", evt => {
      this.goToFrame(evt.detail.frame);
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
      if (evt.ctrlKey && (evt.key == "m")) {
        fullscreen.click();
      }
    });
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
    if (val.media_files['ids'].length > total_video_spots)
    {
      window.alert("Invalid multiview object! Not enough grid spots for media.");
    }

    const video_count = val.media_files['ids'].length;

    let global_frame = new Array(video_count).fill(0);
    // Functor to monitor any frame drift
    let global_frame_change = (vid_idx,evt) => {
      global_frame[vid_idx] = evt.detail.frame;
      if (evt.detail.frame % 60 == 0 && vid_idx == 0)
      {
        let max_diff = 0;
        for (let j = 0; j < global_frame.length; j++)
        {
          for (let i = 0; i < global_frame.length; i++)
          {
            const diff = Math.abs(global_frame[i]-global_frame[j]);
            if (diff > max_diff)
            {
              max_diff = diff;
            }
          }
        }
        if (max_diff > 10)
        {
          console.warn("Frame slippage occuring in multi-view " + max_diff);
        }
      }
    }
    // Functor to normalize the progress bar
    let global_progress = new Array(video_count).fill(0);
    let handle_buffer_load = (vid_idx,evt) =>
        {
          if (global_progress[vid_idx] == 0)
          {
            this._videos[vid_idx].refresh(); //draw first frame
          }
          global_progress[vid_idx] = evt.detail.percent_complete;
          let fakeEvt = {
            detail: {
              percent_complete:Math.min(...global_progress)
            }
          };
          this._slider.onBufferLoaded(fakeEvt);
        };
    let setup_video = (idx, video_info) => {
      this._slider.setAttribute("min", 0);

      if (idx == 0)
      {
        let prime = this._videos[idx];
        this._slider.setAttribute("max", Number(video_info.num_frames)-1);
        this._fps = video_info.fps;
        this._totalTime.textContent = "/ " + this._frameToTime(video_info.num_frames);
        this._totalTime.style.width = 10 * (this._totalTime.textContent.length - 1) + 5 + "px";
        this.parent._browser.canvas = prime;
        prime.addEventListener("frameChange", evt => {
             const frame = evt.detail.frame;
             this._slider.value = frame;
             const time = this._frameToTime(frame);
             this._currentTime.textContent = time;
             this._currentFrame.textContent = frame;
             this._currentTime.style.width = 10 * (time.length - 1) + 5 + "px";
             this._currentFrame.style.width = (15 * String(frame).length) + "px";
           });

        prime.addEventListener("playbackEnded", evt => {
          this.pause();
        });

        prime.addEventListener("safeMode", () => {
          this.safeMode();
        });

        prime.addPauseListener(() => {
          const prime_frame = prime.currentFrame();
          for (let idx = 1; idx < this._videos.length; idx++)
          {
            this._videos[idx]._dispFrame =
              Math.min(prime_frame,
                       this._videos[idx]._numFrames-1);
          }
        });
      }
      this._videos[idx].addEventListener("bufferLoaded",
                             (evt) => {
                               handle_buffer_load(idx,evt);
                             });
      this._videos[idx].addEventListener("frameChange",
                             (evt) => {
                               global_frame_change(idx,evt);
                             });
      const smallTextStyle =
        {"fontSize": "16pt",
         "fontWeight": "bold",
         "color": "white",
         "background": "rgba(0,0,0,0.33)"};
      this._videos[idx].overlayTextStyle = smallTextStyle;
      this._videos[idx].loadFromVideoObject(video_info, this.mediaType, this._quality, undefined, undefined, this._multi_layout[0], this._videoHeightPadObject);

      // #TODO This should be changed to dispatched events vs. calling the parent directly.
      this.parent._getMetadataTypes(this,
                                    this._videos[idx]._canvas,
                                    idx != 0, //whether to block signal registration
                                    video_info.id, // sub-element real-id
                                    false,// only update on last video
                                    );
      // Mute multi-video
      this._videos[idx].setVolume(0);

      if (this._permission)
      {
        this._videos[idx].permission = this._permission;
      }
      if (this._undoBuffer)
      {
        this._videos[idx].undoBuffer = this._undoBuffer;
      }
    };

    let video_resp = [];
    this._multi_container = document.createElement("div");
    this._multi_container.setAttribute("class", "annotation__multi-grid")
    this._dock_container = document.createElement("div");
    this._dock_container.setAttribute("class", "annotation__multi-grid")

    this._videoDivs = {};

    this._multi_container.style.width="70%";
    this._dock_container.style.width="30%";
    this._vidDiv.appendChild(this._multi_container);
    this._vidDiv.appendChild(this._dock_container);
    let idx = 0;
    for (const vid_id of val.media_files['ids'])
    {
      const wrapper_div = document.createElement("div");
      wrapper_div.setAttribute("class", "annotation__multi-grid-entry d-flex flex-items-center ");

      this._videoDivs[vid_id] = wrapper_div;
      this.assignToPrimary(vid_id);
      let roi_vid = document.createElement("video-canvas");

      this._videos.push(roi_vid);
      wrapper_div.appendChild(roi_vid);
      video_resp.push(fetch(`/rest/Media/${vid_id}?presigned=28800`));

      idx += 1;
    }

    let video_info = [];
    Promise.all(video_resp).then((values) => {
      for (let resp of values)
      {
        video_info.push(resp.json());
      }
      Promise.all(video_info).then((info) => {
        for (let idx = 0; idx < video_info.length; idx++)
        {
          setup_video(idx, info[idx]);
        }

        this.dispatchEvent(new Event("canvasReady", {
          composed: true
        }));
      });
    });

    // Audio for multi might get fun...
    // Hide volume on videos with no audio
    this._volume_control.style.display = "none";
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

  // Move all to primary
  all_primary()
  {
    for (let video in this._videoDivs)
    {
        this.assignToPrimary(Number(video));
    }
  }

  assignToPrimary(vid_id)
  {
    let div = this._videoDivs[vid_id];
    this._multi_container.appendChild(div);
    this.setMultiProportions();
    if (div.childElementCount)
      div.children[0].style.visibility = null;
  }

  assignToSecondary(vid_id)
  {
    let div = this._videoDivs[vid_id];
    this._dock_container.appendChild(div);
    this.setMultiProportions();
    if (div.childElementCount)
      div.children[0].style.visibility = null;
  }

  setMultiProportions()
  {
    let primaryCount = this._multi_container.childElementCount;
    let secondaryCount = this._dock_container.childElementCount;
    if (secondaryCount != 0)
    {
      this._multi_container.style.width="70%";
      this._dock_container.style.width="30%";
      let rowsNeeded = Math.ceil(primaryCount / this._multi_layout[1]);
      let colsNeeded = this._multi_layout[0];

      if (primaryCount < this._multi_layout[1])
        colsNeeded = primaryCount;
      for (let primary of this._multi_container.children)
      {
        if (primary.childElementCount)
        {
          primary.children[0].stretch = true;
          primary.children[0].gridRows = null;
        }
      }

      for (let secondary of this._dock_container.children)
      {
        if (secondary.childElementCount)
        {
          secondary.children[0].stretch = false;
          secondary.children[0].stretch = childElementCount;
        }
      }
    }
    else
    {
      this._multi_container.style.width="100%";
      this._dock_container.style.width="0%";
      for (let primary of this._multi_container.children)
      {
        if (primary.childElementCount)
        {
          primary.children[0].stretch = false;
          primary.children[0].gridRows = this._multi_layout[0];
        }
      }
    }

    window.dispatchEvent(new Event('resize'));
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
    this._timeline.annotationData = val;
    this._timelineAttrRange.stateInterpolationType = "attr_style_range";
    this._timelineAttrRange.annotationData = val;
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

  play()
  {
    const paused = this.is_paused();
    if (paused) {
      let playing = false;
      for (let video of this._videos)
      {
        video.rateChange(this._rate);
        playing |= video.play();
      }
      if (playing)
      {
        this._play.removeAttribute("is-paused");
      }
    }
  }

  pause()
  {
    const paused = this.is_paused();
    if (paused == false) {
      for (let video of this._videos)
      {
        video.pause();
      }
      this._play.setAttribute("is-paused", "")
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

  setRate(val) {
    this._rate = val;
    for (let video of this._videos)
    {
        video.rateChange(this._rate);
    }
  }

  setQuality(quality) {
    // For now reload the video
    if (this.is_paused())
    {
      this._video.setQuality(quality);
    }
    else
    {
      this.pause();
      this._video.setQuality(quality);
    }
    this._video.refresh(true);
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
    let p_list=[];
    for (let video of this._videos)
    {
      video.onPlay();
      p_list.push(video.gotoFrame(Math.min(frame,video._numFrames-1), true));
    }
    return Promise.all(p_list);
  }

  selectNone() {
    for (let video of this._videos)
    {
      video.selectNone();
    }
  }

  selectLocalization(loc, skipAnimation, muteOthers, skipGoToFrame) {
    for (let video of this._videos)
    {
      if (video.video_id() == loc.media ||
          video.video_id() == loc.media_id)
      {
        video.selectLocalization(loc, skipAnimation, muteOthers, skipGoToFrame);
      }
    }
  }

  selectTrack(track, frameHint, skipGoToFrame) {
    for (let video of this._videos)
    {
      if (video.video_id() == track.media ||
          video.video_id() == track.media_id)
      {
        video.selectTrack(track, frameHint, skipGoToFrame);
      }
    }

  }

  deselectTrack() {
    for (let video of this._videos)
    {
      video.deselectTrack();
    }
  }

  addCreateTrackType(stateTypeObj) {
    for (let video of this._videos)
    {
      video.addCreateTrackType(stateTypeObj);
    }
  }

  enableFillTrackGapsOption() {
    for (let video of this._videos)
    {
      this._video.enableFillTrackGapsOption();
    }
  }

  toggleBoxFills(fill) {
    for (let video of this._videos)
    {
      video.toggleBoxFills(fill);
    }
  }

  toggleTextOverlays(on) {
    for (let video of this._videos)
    {
      video.toggleTextOverlays(on);
    }
  }

  safeMode() {
    this._scrubInterval = 1000.0/guiFPS;
    console.info("Entered video safe mode");
    return 0;
  }

  drawTimeline(typeId) {
    this._timeline.draw(typeId);
    this._timelineAttrRange.draw(typeId);
  }

  selectTimelineData(data) {
    this._timelineAttrRange.selectData(data);
  }

  frameChange(frame) {
    for (let video of this._video)
    {
      video.goToFrame
    }
  }

  _frameToTime(frame) {
    const totalSeconds = frame / this._fps;
    const seconds = Math.floor(totalSeconds % 60);
    const secFormatted = ("0" + seconds).slice(-2);
    const minutes = Math.floor(totalSeconds / 60);
    return minutes + ":" + secFormatted;
  }
}

customElements.define("annotation-multi", AnnotationMulti);
