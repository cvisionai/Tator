var State = {PLAYING: 0, IDLE: 1, LOADING: -1};

class LiveCanvas extends AnnotationCanvas
{
  constructor()
  {
    super();
    this._imageElement=document.createElement("img");
    this._imageElement.crossOrigin = "anonymous";
    this._good=false;
  }

  set mediaInfo(val) {
    super.mediaInfo = val;
    this._dims = [val.width, val.height];
    this.resetRoi();
    this._videoObject = val;

    // Have to wait for canvas to draw.
    new Promise(async resolve => {
      while (true) {
        if (this._canvas.clientHeight > 0) {
          break;
        }
        await new Promise(res => setTimeout(res, 10));
      }
      let url = null;
      if (val.media_files) {
        if (val.media_files.image) {
          url = val.media_files.image[0].path;
        }
      }
      this.loadFromURL(url, this._dims)
      .then(() => {
        this._good = true;
        this.refresh()
      })
      .then(() => {
        this.dispatchEvent(new Event("canvasReady", {
          composed: true
        }));
      });
    });
  }


  // Images are neither playing or paused
  isPaused()
  {
    return true;
  }
  refresh()
  {
    // Prevent image buffer from loading prior to localizations
    if (this._good==false)
    {
      return;
    }
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
      if (this._draw.canPlay())
      {
        this._draw.updateImage(this._roi[0],this._roi[1], //No clipping
                               this._roi[2],this._roi[3], //Image size
                               leftSide,0, //Place 'full-screen'
                               sWidth,sHeight, // Use canvas size
                              );
        this.moveOffscreenBuffer(this._roi);
      }
      else
      {
        this._draw.pushImage(0,
                             this._imageElement,
                             this._roi[0],this._roi[1], //No clipping
                             this._roi[2],this._roi[3], //Image size
                             leftSide,0, //Place 'full-screen'
                             sWidth,sHeight, // Use canvas size
                             this._dirty
                            );

        this.updateOffscreenBuffer(0,
                                   this._imageElement,
                                   this._dims[0],
                                   this._dims[1],
                                   this._roi);
      }
      // Images are always paused.
      this.onPause();
      this._draw.dispImage(true);
      resolve();
    });
    return promise;
  }

  loadFromURL(URL, dims)
  {
    // The browser can't handle 4k images for various overlay
    // effects (notable preview dim). Because we only display the image
    // at the client width, we can scale the dims here to be more efficient
    // from a graphics pipeline perspective.
    // Note: dims[0] is width.
    // Because we don't display using full screen (approx 70% max out the
    // viewport at that)
    this._imageScale = (window.screen.width*0.70) / dims[0];
    this._dims=[Math.round(dims[0]*this._imageScale),
                Math.round(dims[1]*this._imageScale)];
    this._draw.resizeViewport(this._dims[0], this._dims[1]);
    this._imageElement.setAttribute("src", URL);

    this.setupResizeHandler(dims);
    return this._imageElement.decode();
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
    
  }

  captureFrame(localizations)
  {
    this.makeOffscreenDownloadable(localizations, this._mediaInfo['name']);
  }
}

customElements.define("live-canvas", LiveCanvas);
