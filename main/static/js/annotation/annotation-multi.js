class AnnotationMulti extends TatorElement {
  constructor() {
    super();

    this._playerDiv = document.createElement("div");
    this._playerDiv.setAttribute("class", "annotation__multi-player rounded-bottom-2");
    this._shadow.appendChild(this._playerDiv);

    this._vidDiv = document.createElement("div");
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
    this._rewind = rewind;

    const play = document.createElement("play-button");
    this._play = play;
    this._play.setAttribute("is-paused", "");
    playButtons.appendChild(this._play);

    const fastForward = document.createElement("fast-forward-button");
    playButtons.appendChild(fastForward);
    this._fastForward = fastForward;

    const timelineDiv = document.createElement("div");
    timelineDiv.setAttribute("class", "d-flex flex-items-center flex-grow px-2");
    div.appendChild(timelineDiv);

    const timeDiv = document.createElement("div");
    timeDiv.setAttribute("class", "d-flex flex-items-center flex-justify-between");
    timelineDiv.appendChild(timeDiv);

    this._currentTimeInput = document.createElement("input");
    this._currentTimeInput.setAttribute("class", "form-control input-sm1 f2 text-center");
    this._currentTimeInput.setAttribute("type", "text");
    this._currentTimeInput.style.display = "none";
    this._currentTimeInput.style.width = "100px";
    timeDiv.appendChild(this._currentTimeInput);

    this._currentTimeText = document.createElement("div");
    this._currentTimeText.textContent = "0:00";
    this._currentTimeText.style.width = "35px";
    timeDiv.appendChild(this._currentTimeText);

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
    frameDiv.setAttribute("class", "d-flex flex-items-center flex-justify-between");
    timelineDiv.appendChild(frameDiv);

    const framePrev = document.createElement("frame-prev");
    frameDiv.appendChild(framePrev);

    const currentFrameWrapper = document.createElement("div");
    frameDiv.appendChild(currentFrameWrapper);

    this._currentFrameInput = document.createElement("input");
    this._currentFrameInput.setAttribute("class", "form-control input-sm1 f2 text-center");
    this._currentFrameInput.setAttribute("type", "text");
    this._currentFrameInput.style.display = "none";
    this._currentFrameInput.style.width = "100px";
    frameDiv.appendChild(this._currentFrameInput);

    this._currentFrameText = document.createElement("div");
    this._currentFrameText.setAttribute("class", "f2 text-center");
    this._currentFrameText.textContent = "0";
    this._currentFrameText.style.minWidth = "15px";
    currentFrameWrapper.appendChild(this._currentFrameText);

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
          video.stopPlayerThread(); // Don't use video.pause because we are seeking ourselves
          video.seekFrame(frame, video.drawFrame)
            .then(this._lastScrub = Date.now());
        }
      }
    });

    this._slider.addEventListener("change", evt => {
      play.setAttribute("is-paused","");
      this.dispatchEvent(new Event("displayLoading", {composed: true}));

      // Only use the current frame to prevent glitches
      let frame = this._videos[0].currentFrame();
      if (evt.detail)
      {
        frame = evt.detail.frame;
      }

      var seekPromiseList = [];
      for (let video of this._videos)
      {
        video.stopPlayerThread();  // Don't use video.pause because we are seeking ourselves
        const seekPromise = video.seekFrame(frame, video.drawFrame, true);
        seekPromiseList.push(seekPromise);
      }

      // It's possible that the prime video will be out of sync with other videos if
      // there are network seek expired. Until that's addressed, this will verify
      // the videos are the same frame and if not, it'll attempt to seek to the
      // prime video's location. This essentially is only a +1 retry.
      Promise.allSettled(seekPromiseList).then(() => {
        let primeFrame = that._videos[0].currentFrame();
        this._lastScrub = Date.now();
        for (const video of that._videos)
        {
          if (primeFrame != video.currentFrame())
          {
            video.seekFrame(frame, video.drawFrame, true).then(this._lastScrub = Date.now());
          }
        };
        this.dispatchEvent(new Event("hideLoading", {composed: true}));
      })
      .catch(() => {
        this.dispatchEvent(new Event("hideLoading", {composed: true}));
      });
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
      this.playBackwards();
    });

    fastForward.addEventListener("click", () => {
      for (let video of this._videos)
      {
        video.pause();
        video.rateChange(2 * this._rate); // #TODO This is a bug, play() sets the rate back to 1.0
      }
      this.play();
    });

    framePrev.addEventListener("click", () => {
      for (let video of this._videos)
      {
        if (this.is_paused() == false)
        {
          this.dispatchEvent(new Event("paused", {composed: true}));
          fastForward.removeAttribute("disabled");
          rewind.removeAttribute("disabled");
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
          this.dispatchEvent(new Event("paused", {composed: true}));
          fastForward.removeAttribute("disabled");
          rewind.removeAttribute("disabled");
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

    this._currentFrameInput.addEventListener("focus", () => {
      document.body.classList.add("shortcuts-disabled");
    });

    this._currentFrameInput.addEventListener("change", () => {
      this._currentFrameInput.blur(); // Lose focus to invoke the blur event
    });

    this._currentFrameInput.addEventListener("blur", () => {
      document.body.classList.remove("shortcuts-disabled");
      this._currentFrameText.style.display = "block";
      this._currentFrameInput.style.display = "none";
      this.processFrameInput();
    });

    this._currentFrameText.addEventListener("click", () => {
      this._currentFrameInput.style.display = "block";
      this._currentFrameInput.focus();
      this._currentFrameText.style.display = "none";
    });

    this._currentTimeInput.addEventListener("focus", () => {
      document.body.classList.add("shortcuts-disabled");
    });

    this._currentTimeInput.addEventListener("change", () => {
      this._currentTimeInput.blur(); // Lose focus to invoke the blur event
    });

    this._currentTimeInput.addEventListener("blur", () => {
      document.body.classList.remove("shortcuts-disabled");
      this._currentTimeText.style.display = "block";
      this._currentTimeInput.style.display = "none";
      this.processTimeInput();
    });

    this._currentTimeText.addEventListener("click", () => {
      this._currentTimeInput.style.display = "block";
      this._currentTimeInput.focus();
      this._currentTimeText.style.display = "none";
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
        this._fps = video_info.fps;
        this._totalTime.textContent = "/ " + this._frameToTime(video_info.num_frames);
        this._totalTime.style.width = 10 * (this._totalTime.textContent.length - 1) + 5 + "px";
        this.parent._browser.canvas = prime;
        prime.addEventListener("frameChange", evt => {
             const frame = evt.detail.frame;
             this._slider.value = frame;
             const time = this._frameToTime(frame);
             this._currentTimeText.textContent = time;
             this._currentFrameText.textContent = frame;
             this._currentTimeText.style.width = 10 * (time.length - 1) + 5 + "px";
             this._currentFrameText.style.width = (15 * String(frame).length) + "px";
           });

        prime.addEventListener("playbackEnded", evt => {
          this.pause();
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

      this._videos[idx].addEventListener("safeMode", () => {
        this.safeMode();
      });
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
    let multi_container = document.createElement("div");
    multi_container.setAttribute("class", "annotation__multi-grid")
    multi_container.style.gridTemplateColumns =
      "auto ".repeat(this._multi_layout[1]);
    multi_container.style.gridTemplateRows =
      "auto ".repeat(this._multi_layout[0]);
    this._vidDiv.appendChild(multi_container);
    let idx = 0;

    this._playbackReadyId = 0;
    this._numVideos = val.media_files['ids'].length;
    for (const vid_id of val.media_files['ids'])
    {
      const wrapper_div = document.createElement("div");
      wrapper_div.setAttribute("class", "annotation__multi-grid-entry d-flex flex-items-center ");
      multi_container.appendChild(wrapper_div);

      let roi_vid = document.createElement("video-canvas");
      roi_vid.style.gridColumn = (idx % this._multi_layout[1])+1;
      roi_vid.style.gridRow = Math.floor(idx / this._multi_layout[1])+1;

      this._videos.push(roi_vid);
      wrapper_div.appendChild(roi_vid);
      video_resp.push(fetch(`/rest/Media/${vid_id}?presigned=28800`));

      roi_vid.addEventListener("playbackReady", (evt) =>
      {
        if (evt.detail.playbackReadyId == this._playbackReadyId)
        {
          this._playbackReadyCount += 1;
          if (this._playbackReadyCount == this._numVideos)
          {
            for (var video of this._videos)
            {
              video.waitPlayback(false, this._playbackReadyId);
            }
          }
        }
      });

      idx += 1;
    }

    let video_info = [];
    Promise.all(video_resp).then((values) => {
      for (let resp of values)
      {
        video_info.push(resp.json());
      }
      Promise.all(video_info).then((info) => {
        let max_frames = 0;
        for (let idx = 0; idx < video_info.length; idx++)
        {
          if (Number(info[idx].num_frames) > max_frames)
          {
            max_frames = Number(info[idx].num_frames);
          }
          setup_video(idx, info[idx]);
        }
        this._slider.setAttribute("max", max_frames-1);
        this._maxFrameNumber = max_frames - 1;

        this.dispatchEvent(new Event("canvasReady", {
          composed: true
        }));
      });
    });

    // Audio for multi might get fun...
    // Hide volume on videos with no audio
    this._volume_control.style.display = "none";
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
    if (this._rate > 1.0)
    {
      // Check to see if the video player can play at this rate
      // at the current frame. If not, inform the user.
      for (let video of this._videos)
      {
        if (!video.canPlayRate(this._rate))
        {
          window.alert("Please wait until this portion of the video has been downloaded. Playing at speeds greater than 1x require the video to be buffered.")
          return;
        }
      }
    }

    this.dispatchEvent(new Event("playing", {composed: true}));
    this._fastForward.setAttribute("disabled", "");
    this._rewind.setAttribute("disabled", "");

    const paused = this.is_paused();
    if (paused) {
      let playing = false;
      this._playbackReadyId += 1;
      this._playbackReadyCount = 0;
      this.goToFrame(this._videos[0].currentFrame()).then(() => {
        for (let video of this._videos)
        {
          video.waitPlayback(true, this._playbackReadyId);
          video.rateChange(this._rate);
          playing |= video.play();
        }
        if (playing)
        {
          this._play.removeAttribute("is-paused");
        }
      });
    }
  }

  playBackwards()
  {
    this.dispatchEvent(new Event("playing", {composed: true}));
    this._fastForward.removeAttribute("disabled");
    this._rewind.removeAttribute("disabled");

    this._playbackReadyId += 1;
    this._playbackReadyCount = 0;
    this._pauseId = this._playbackReadyId;
    this.goToFrame(this._videos[0].currentFrame()).then(() => {
      for (let video of this._videos)
      {
        video.waitPlayback(true, this._playbackReadyId);
        video.pause();
        video.rateChange(this._rate);
        if (video.playBackwards())
        {
          this._play.setAttribute("is-paused", "");
        }
      }
    });
  }

  pause()
  {
    this.dispatchEvent(new Event("paused", {composed: true}));
    this._fastForward.removeAttribute("disabled");
    this._rewind.removeAttribute("disabled");

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

  setRate(val) {
    this._rate = val;
    for (let video of this._videos)
    {
        video.rateChange(this._rate);
    }
  }

  setQuality(quality) {
    for (let video of this._videos)
    {
      video.setQuality(quality);
    }
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

  selectTrackUsingId(stateId, stateTypeId, frameHint, skipGoToFrame) {
    const ids = this._annotationData._dataByType.get(stateTypeId).map(elem => elem.id);
    const index = ids.indexOf(stateId);
    const track = this._annotationData._dataByType.get(stateTypeId)[index];
    this.selectTrack(track, frameHint, skipGoToFrame);
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

  enableDisplayFrame() {
    for (let video of this._videos)
    {
      video.setupOverlay({mode: "displayFrameNumber"});
    }
  }

  safeMode() {
    for (let video of this._videos)
    {
      video.safeMode();
    }

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

  _frameToTime(frame) {
    const totalSeconds = frame / this._fps;
    const seconds = Math.floor(totalSeconds % 60);
    const secFormatted = ("0" + seconds).slice(-2);
    const minutes = Math.floor(totalSeconds / 60);
    return minutes + ":" + secFormatted;
  }

  _timeToFrame(minutes, seconds) {
    var frame = minutes * 60 * this._fps + seconds * this._fps + 1;
    return frame;
  }
}

customElements.define("annotation-multi", AnnotationMulti);
