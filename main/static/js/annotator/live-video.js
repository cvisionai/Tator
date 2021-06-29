var State = {PLAYING: 0, IDLE: 1, LOADING: -1};

class LiveCanvas extends AnnotationCanvas
{
  constructor()
  {
    super();
    this._poster = document.createElement("img");
    this._poster.setAttribute("src", "/static/images/tator-logo-symbol-only.png");
    this._loading = document.createElement("img");
    this._loading.setAttribute("src", "/static/images/please_stand_by.jpg");
    this._dims = [1920,1080]; // default size
    this._draw.resizeViewport(1920,1080);
    this.resetRoi();
    this._playThread = null;
    this._pauseTimer = null;
    this._playIdx = 0;
    this._feedVids = [];
    this._streamers = [];
    this._resolutions = [];
    this._connectTime = 0;
    this._paused = true;
    this._currentFrame = 0;
    this._diagLastFrame = 0;
    this._fps = 60;

    this._counterText = this._textOverlay.addText(0.5,0.75, "0");
    this._textOverlay.toggleTextDisplay(this._counterText,false);
  }

  // Images are neither playing or paused
  isPaused()
  {
    return this._paused;
  }

  diagThread()
  {
    if (this._paused)
    {
      return;
    }
    clearTimeout(this._diagThread);
    if (this._currentFrame - this._diagLastFrame < 10)
    {
      this.error(null, "Remote Video feed has stopped.");
    }
    this._diagLastFrame = this._currentFrame;
    this._diagThread = setTimeout(this.diagThread.bind(this), 1000);
  }

  playThread()
  {
    if (this._paused)
    {
      return;
    }
    // TODO We may need a bit more here
    let currentVideo = this._feedVids[this._playIdx];
    // Handle when live source stalls out
    let onstall = () => {
      console.log("Live feed is stalled");
      currentVideo.removeEventListener("stalled", onstall);
      this.showLoading();
      let onplay = () => {
        currentVideo.removeEventListener("playing", onplay);
        this._playThread = requestAnimationFrame(this.playThread.bind(this));
      };
      currentVideo.addEventListener("playing", onplay);
    };
    currentVideo.addEventListener("stalled", onstall);

    this._currentFrame += 1;

    this._draw.pushImage(0,
      currentVideo,
      this._roi[0],this._roi[1],
      this._roi[2],this._roi[3], //Image size
      0,0, //Place 'full-screen'
      this._dims[0],this._dims[1], // Use canvas size
      this._dirty
     );
     this._draw.dispImage(false);
     this._playThread = requestAnimationFrame(this.playThread.bind(this));
  }

  play()
  {
    this._paused = false;
    clearTimeout(this._pauseTimer);
    this._pauseTimer = null;
    this._posterTimeout = setTimeout(() => {
      this.showLoading();
    }, 250);
    if (Date.now() - this._connectTime > 10000)
    {
      this.reloadFeeds();
      setTimeout(this.play.bind(this), 1000);
      return true;
    }

    let errorCatch = () => {
      this.error(null, "Server did not respond in 20 seconds.");
    };
    let errorTimeout = setTimeout(errorCatch, 20000);
    let currentVideo = this._feedVids[this._playIdx];
    let onplay = () => {
      clearTimeout(errorTimeout);
      clearTimeout(this._posterTimeout);
      this.clearCounter();
      this._diagThread = setTimeout(this.diagThread.bind(this), 1000);
      currentVideo.removeEventListener("playing", onplay);
      this.dispatchEvent(new CustomEvent("playing", {composed: true}));
      this._playThread = requestAnimationFrame(this.playThread.bind(this));
    };
    currentVideo.addEventListener("playing", onplay);
    currentVideo.play();
    return true;
  }

  error(error, msg)
  {
    this.dispatchEvent(new CustomEvent("error", {composed: true,
      detail: {
      obj: error,
      msg: msg
    }
    }));
    if (this._paused == false)
    {
      this.pause();
    }
  }

  pause()
  {
    if (this._paused)
    {
      return;
    }
    this.clearCounter();
    clearTimeout(this._diagThread);
    this._paused = true;
    let currentVideo = this._feedVids[this._playIdx];
    currentVideo.pause();
    this._connectTime = Date.now();
    clearTimeout(this._playThread);
    this._playThread = null;
    this._realData = true;
    this.dispatchEvent(new CustomEvent("paused", {composed: true}));

    this._pauseTimer = setTimeout(()=>{
      console.log("Disconnecting from RTC server.")
      this._connectTime = 0;
      for (let idx = 0; idx < this._streamers.length; idx++)
      {
        let streamer = this._streamers[idx];
        streamer.disconnect();
      }
    }, 10000);
  }

  setVolume(level)
  {
    for (let video of this._feedVids)
    {
      video.volume = Number(level)/100;
    }
  }

  showLoading()
  {
    let x = 0;//(cWidth/2) - (this._poster.width/4);
    let y = 0;//(cHeight/2) - (this._poster.height/4);
    this._draw.clear();
    this._draw.pushImage(0,
                         this._loading,
                         0,0, //No clipping
                         1,1, 
                         x,0-y, 
                         this._dims[0],this._dims[1], // Use canvas size
                         true
                         );
    this._draw.dispImage(true);

    this._count = 0;
    this._textOverlay.modifyText(this._counterText, {"content": `${this._count}`}, true);
    this.counterThread();
  }

  counterThread()
  {
      clearTimeout(this._counterThreadIdx);
      this._textOverlay.modifyText(this._counterText, {"content": `${this._count}`}, true);
      this._count += 1;
      this._counterThreadIdx = setTimeout(this.counterThread.bind(this), 1000);
  }

  clearCounter()
  {
      clearTimeout(this._counterThreadIdx);
      this._textOverlay.toggleTextDisplay(this._counterText, false);
  }

  refresh()
  {
    let currentVideo = this._feedVids[this._playIdx]
    const cWidth=this._canvas.width;
    const cHeight=this._canvas.height;
    // Calculate scaled image height, such that
    // the height matches the height of the viewscreen
    // and set the scaled width accordingly to maintain aspect
    const scale=cHeight/this._dims[1];
    const sHeight=this._dims[1]*scale;
    const sWidth=this._dims[0]*scale;

    // Calculate the margin we have in width
    const margin=cWidth-sWidth;
    // We want half of the margin to the left of the image frame
    const leftSide=margin/2;

    const promise = new Promise(resolve => {
      this._draw.clear();
      if (this._playThread == null)
      {
        if (this._realData)
        {
          this._draw.pushImage(0,
            currentVideo,
            this._roi[0],this._roi[1], //No clipping
            this._roi[2],this._roi[3], //Image size
            leftSide,0, //Place 'full-screen'
            sWidth,sHeight, // Use canvas size
            this._dirty
            );
        }
        else
        {
          let x = (cWidth/2) - (this._poster.width/2);
          let y = (cHeight/2) - (this._poster.height/2);
          this._draw.pushImage(0,
                              this._poster,
                              0,0, //No clipping
                              1,1, 
                              x,0-y, 
                              this._poster.width,this._poster.height, // Use canvas size
                              this._dirty
                              );
        }

        this.updateOffscreenBuffer(0,
                                   this._poster,
                                   this._dims[0],
                                   this._dims[1],
                                   this._roi);
      }
      else if (this.connectTime > 0)
      {
        this._draw.pushImage(0,
          currentVideo,
          this._roi[0],this._roi[1], //No clipping
          this._roi[2],this._roi[3], //Image size
          leftSide,0, //Place 'full-screen'
          sWidth,sHeight, // Use canvas size
          this._dirty
         );

        this.updateOffscreenBuffer(0,
                currentVideo,
                this._dims[0],
                this._dims[1],
                this._roi);
      }
      this._draw.dispImage(true);
      resolve();
    });
    return promise;
  }

  reloadFeeds()
  {
    let keys = Object.keys(this._feeds);
    for (let idx = 0; idx < keys.length; idx++)
    {
        let feed = keys[idx];
        let streamer = this._streamers[idx];
        streamer.disconnect();
        streamer.connect(feed, feed);
    }
    this._connectTime = Date.now();
  }
  loadFeeds(info)
  {
    this._url = info.url;
    this._feeds = info.feeds;
    this._feedVids = [];
    this._streamers = [];
    this._resolutions = [];
    console.info(info);
    for (let feed of Object.keys(this._feeds))
    {
      let resolution = this._feeds[feed];
      let video = document.createElement("video");
      this._feedVids.push(video);
      this._resolutions.push(resolution);
      let streamer = new WebRtcStreamer(video,this._url, () => {
        console.info(`Notice: Feed ${feed} (${resolution}) reports ready`);
      });
      streamer.onError = (error) => {
        const msg = `Live stream '${feed}' from ${this._url} is not available.`;
        console.error(error);
        console.error(msg)
        this.error(error, msg);
      };
      streamer.connect(feed, feed);
      this._streamers.push(streamer);
    }
    this._connectTime = Date.now();

    window.addEventListener("beforeunload", () => {
      for (let streamer of this._streamers)
      {
        streamer.disconnect();
      }
    });
  }

  // 'Media Interface' implementations
  currentFrame()
  {
    return 0;
  }

  gotoFrame(frame)
  {
    return this.refresh();
  }

  setupButtons(state)
  {

  }

  setQuality(quality)
  {
    this.pause();
    let distance = Math.max(1080,this._resolutions[0][0]);
    let matchingIdx = 0;
    for (let idx = 0; idx < this._resolutions.length; idx++)
    {
      let thisDistance = Math.abs(quality - this._resolutions[idx][0]);
      if (thisDistance < distance)
      {
        matchingIdx = idx;
        distance = thisDistance;
      }
    }
    this._playIdx = matchingIdx;
    console.info(`Live quality is now at ${this._resolutions[this._playIdx]}`);
  }

  captureFrame(localizations)
  {
    this.makeOffscreenDownloadable(localizations, this._mediaInfo['name']);
  }
}

customElements.define("live-canvas", LiveCanvas);
