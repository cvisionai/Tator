// Video class handles interactions between HTML presentation layer and the
// javascript application.
//

/// The video player uses seek+display strategy to an off-screen buffer.
///
/// The off-screen buffer is then copied to a buffer of GPU-backed
/// textures, whose depth is configurable by 'bufferDepth' variable in
/// 'loadFromVideoElement'.
///
/// The 'playGeneric' routine is kicked off for forward/rewind activities
/// and drives to userspace threads.
/// - The Player runs at the display rate (guiFPS is the max, but nominal
///   displays at the video FPS).
/// - The Loader runs at the fastest rate a browser codec can seek+load the
///   frame buffer. Assuming the frame buffer fills faster than the display
///   the load thread retreats for half the buffer size to fill back up again.
/// - A diagnostic thread runs to report FPS to the javascript console.
///
/// Supported formats:
/// - The video player works with any codec the html5 video object in the
///   given browser supports. This is browser specific, but both Chrome
///   and firefox support the following formats:
///      + video/mp4 (codec: libx264)
///      + video/webm (codec: vp8)
///      + video/webm (codec: vp9)
///
///
/// Frame rate limiting:
/// - guiFPS is a way to limit the maximum attempted FPS. If a video with
///   an FPS faster than guiFPS is loaded, playback rate is lowered.
/// - Playback rate can be adjusted to 'fast forward'. Frame droppage
///   occurs when the fast forward FPS exceeds the GUI FPS.
///      + As an example if the guiFPS is 30, and you load a 15 FPS video
///        the FPS of playback rate 1.0 is 15. at 2.0, the FPS is 30. If
///        the user requests a playback rate of 4.0 the FPS is 60, but the
///        screen can only display 30 fps. In this case every other frame is
///        loaded + displayed (@ 30 fps).
///
/// Known issues/Erratta:
///
///
/// - In order for the 'seek+play' strategy to work, videos need to have
///   fixed size GOP (i.e. number of frames per key frame region). This
///   aligns with notes on making videos 'streamable'. Videos should have
///   a key frame at least every 2 seconds for optimal performance. With
///   ffmpeg one can do something like `ffmpeg ... -r <fps> -g <fps*2>
///
/// - Performance in firefox is markedly less than Chrome which seems to have
///   a better implementation of handing `<video>`. On a XPS 15 9570 (2018 era)
///   the chrome browser was able to display video at 60 FPS. Firefox had
///   performance in the teens. On an XPS 15 (2008 era), Chrome performed
///   in the teens.

// Constrain the video display FPS to not allow dropped frames during playback
//
var guiFPS=30;

var Direction = { BACKWARDS:-1, STOPPED: 0, FORWARD: 1};
var State = {PLAYING: 0, IDLE: 1, LOADING: -1};

var src_path="/static/js/annotator/";

/// Support multiple off-screen videos at varying resolutions
/// the intention is this class is used to store raw video
/// frames as they are downloaded.
class VideoBufferDemux
{
  constructor()
  {
    // By default use 100 megabytes
    this._bufferSize = 100*1024*1024;
    this._numBuffers = 60; // Technically +1 to this value for onDemand

    this._totalBufferSize = this._bufferSize*this._numBuffers;
    this._vidBuffers=[];
    this._inUse=[];
    this._full=[];
    this._mediaSources=[];
    this._sourceBuffers=[];
    this._compat = false;
    this._activeBuffers = 0;

    // Video, source, and buffer for seek track
    this._seekVideo = document.createElement("VIDEO");
    this._seekVideo.setAttribute("crossorigin", "anonymous");
    this._seekReady = false;
    this._pendingSeeks = [];
    this._pendingSeekDeletes = [];

    this._mime_str = 'video/mp4; codecs="avc1.64001e"';

    for (var idx = 0; idx <= this._numBuffers; idx++)
    {
      this._vidBuffers.push(document.createElement("VIDEO"));
      this._vidBuffers[idx].setAttribute("crossorigin", "anonymous");
      this._inUse.push(0);
      this._sourceBuffers.push(null);
      this._full.push(false);
    }

    // Create another video buffer specifically used for onDemand playback
    this._onDemandBufferIndex = this._numBuffers;
    this._pendingOnDemandDeletes = [];

    this._init = false;
    this._dataLag = [];
    let init_buffers = () => {
      console.info("Init buffers");

      // Initialize the seek buffer
      this._seekBuffer = null;
      this._seekSource = new MediaSource();
      this._seekVideo.src = URL.createObjectURL(this._seekSource);
      this._seekSource.onsourceopen=() => {
        this._seekSource.onsourceopen = null;
        this._seekBuffer = this._seekSource.addSourceBuffer(this._mime_str);
        if (this._pendingSeeks.length > 0)
        {
          console.info("Applying pending seek data.");
          var pending = this._pendingSeeks.shift();
          this.appendSeekBuffer(pending.data, pending.time);
        }
      };

      // Initialize the playback buffers
      let that = this;
      var makeSourceBuffer = function(idx, event)
      {
        var args = this;
        var ms = args["ms"];
        var idx = args["idx"];
        ms.onsourceopen=null;

        // Need to add a source buffer for the video.
        that._sourceBuffers[idx]=ms.addSourceBuffer(that._mime_str);

        // Reached the onDemand buffer, rest of the function isn't associated with it
        if (idx == that._numBuffers) {
          if (that._initData){
            that.appendOnDemandBuffer(that._initData, () => {}, true);
          }
          return;
        }

        for (let idx = 0; idx < that._numBuffers; idx++)
        {
          if (that._sourceBuffers[idx] == null)
            return;
        }

        if (that._initData)
        {
          let handleDataLag = () => {
            if (that._pendingSeeks.length > 0)
            {
              var pending = that._pendingSeeks.shift();
              that.appendSeekBuffer(pending.data, pending.time);
            }
            let lag = that._dataLag.shift();
            if (lag)
            {
              if (lag.callback && that._dataLag.length == 0) {
                setTimeout(() => {that.appendLatestBuffer(lag.data, lag.callback, "handlingDataLog");},0);
              }
              else {
                setTimeout(() => {that.appendLatestBuffer(lag.data, handleDataLag, "handlingDataLog");},0);
              }
            }
            else
            {
              that._initData = undefined;
            }
          };
          that.appendAllBuffers(that._initData, () => {that._init = true; handleDataLag();}, true);
        }
        else
        {
          that._init = true;
        }
      }

      // This links the source element buffers with a paired video element and also
      // a media source
      //
      // Note: +1 for onDemand buffer
      for (var idx = 0; idx <= this._numBuffers; idx++)
      {
        var ms = new MediaSource();
        this._mediaSources[idx] = ms;
        this._vidBuffers[idx].src = URL.createObjectURL(this._mediaSources[idx]);
        ms.onsourceopen=makeSourceBuffer.bind({"idx": idx, "ms": ms});
      }
    };
    if (document.hidden == true)
    {
      document.addEventListener("visibilitychange", () => {
        if (document.hidden == false && this._init == false)
        {
          init_buffers();
        }
      });
    }
    else
    {
      init_buffers();
    }
  }

  recreateOnDemandBuffers(callback) {
    var idx = this._numBuffers;
    var ms = new MediaSource();
    this._mediaSources[idx] = ms;
    this._vidBuffers[idx] = document.createElement("VIDEO");
    this._vidBuffers[idx].setAttribute("crossorigin", "anonymous");
    this._vidBuffers[idx].src = URL.createObjectURL(this._mediaSources[idx]);

    ms.onsourceopen = () => {
      ms.onsourceopen = null;
      this._sourceBuffers[idx] = ms.addSourceBuffer(this._mime_str);
      console.log("recreateOnDemandBuffers - onsourceopen");
      callback();
    };
  }

  status()
  {
    console.info("Buffer Status");
    console.info(`Active Buffer Count = ${this._activeBuffers}`);
    var bufferSizeMb=this._bufferSize/(1024*1024);
    for (var idx = 0; idx < this._numBuffers; idx++)
    {
      var mbInUse=this._inUse[idx]/(1024*1024);
      console.info(`\t${idx} = ${mbInUse}/${bufferSizeMb} MB`);
      if (this._vidBuffers[idx] == null)
      {
        return;
      }
      var ranges=this._vidBuffers[idx].buffered;
      if (ranges.length > 0)
      {
        console.info("\tRanges:");
        for (var rIdx = 0; rIdx < ranges.length; rIdx++)
        {
          console.info(`\t\t${rIdx}: ${ranges.start(rIdx)}:${ranges.end(rIdx)}`);
        }
      }
      else
      {
        console.info("\tEmpty");
      }

    }

    console.info("Seek Buffer:")
    if (this._seekBuffer == null)
    {
      return;
    }
    var ranges=this._seekBuffer.buffered;
    if (ranges.length > 0)
    {
      console.info("\tRanges:");
      for (var rIdx = 0; rIdx < ranges.length; rIdx++)
      {
        console.info(`\t\t${rIdx}: ${ranges.start(rIdx)}:${ranges.end(rIdx)}`);
      }
    }
    else
    {
      console.info("\tEmpty");
    }
  }

  currentVideo()
  {
    for (var idx = 0; idx < this._numBuffers; idx++)
    {
      if (this._full[idx] != true)
      {
        return this._vidBuffers[idx];
      }
    }
    return null;
  }

  /**
   * Return the source buffer associated with the given frame / buffer type.
   *
   * @param {float} time - Seconds timestamp of frame request
   * @param {string} buffer - "play" | "scrub"
   * @param {Direction} direction - Forward or backward class
   * @param {float} maxTime - Maximum number of seconds in the video
   * @returns Video element based on the provided time. Returns null if the given time does not
   *          match any of the video buffers.
   */
  forTime(time, buffer, direction, maxTime)
  {
    if (this._compat == true)
    {
      return this._vidBuffers[0];
    }

    if (buffer == "play")
    {
      var ranges = this._vidBuffers[this._onDemandBufferIndex].buffered;

      // Note: The way it's setup right now, there should only be a continuous range
      //       But we'll keep the for loop for now.
      for (var rangeIdx = 0; rangeIdx < ranges.length; rangeIdx++)
      {
        var start = ranges.start(rangeIdx);
        var end = ranges.end(rangeIdx);

        if (time >= start && time <= end)
        {
          return this._vidBuffers[this._onDemandBufferIndex];
        }
      }

      /*
      if (ranges.length > 0)
      {
        console.warn(`Playback buffer doesn't contain time (ranges/start/end/time) ${ranges.length} ${start} ${end} ${time}`);
      }
      */
    }
    else if (buffer == "scrub")
    {
      for (var idx = this._activeBuffers-1; idx >= 0; idx--)
      {
        var ranges = this._vidBuffers[idx].buffered;
        for (var rangeIdx = 0; rangeIdx < ranges.length; rangeIdx++)
        {
          var start = ranges.start(rangeIdx);
          var end = ranges.end(rangeIdx);
          if (time >= start &&
              time <= end)
          {
            return this._vidBuffers[idx];
          }
        }
      }
    }

    return null;
  }

  // Returns the seek buffer if it is present, or
  // The time buffer if in there
  returnSeekIfPresent(time, direction)
  {
    //let time_result= this.forTime(time, "scrub");
    //if (time_result)
    //{
    //  return time_result;
    //}

    for (let idx = 0; idx < this._seekVideo.buffered.length; idx++)
    {
      // If the time is comfortably in the range don't bother getting
      // additional data
      let timeFromStart = time - this._seekVideo.buffered.start(idx);
      let bufferedLength = (this._seekVideo.buffered.end(idx) - this._seekVideo.buffered.start(idx)) * 0.75;
      if (timeFromStart <= bufferedLength && timeFromStart > 0)
      {
        return this._seekVideo;
      }
    }
    return null;
  }

  playBuffer()
  {
    return this._vidBuffers[this._onDemandBufferIndex];
  }

  /**
   * Queues the requests to delete buffered onDemand video ranges
   */
  resetOnDemandBuffer()
  {
    const video = this.playBuffer();
    this._pendingOnDemandDeletes = [];
    for (var rangeIdx = 0; rangeIdx < video.buffered.length; rangeIdx++)
    {
      let start = video.buffered.start(rangeIdx);
      let end = video.buffered.end(rangeIdx);
      this.deletePendingOnDemand([start, end]);
    }

    let promise = new Promise((resolve,_) => {
      let checkBuffer = () => {
        if (!this.isOnDemandBufferCleared()) {
          setTimeout(checkBuffer, 100);
        }
        else {
          resolve();
        }
      };

      checkBuffer();
    });

    return promise;
  }

  /**
   * @returns {boolean} True if the onDemand buffer has no data
   */
  isOnDemandBufferCleared()
  {
    const video = this.playBuffer();
    return video.buffered.length == 0;
  }

  /**
   * @returns {boolean} True if the onDemand buffer is busy
   */
  isOnDemandBufferBusy()
  {
    const buffer = this._sourceBuffers[this._onDemandBufferIndex];
    return buffer.updating;
  }

  /**
   * If there are any pending deletes for the onDemand buffer, this will rotate through
   * them and delete them
   */
  cleanOnDemandBuffer()
  {
    if (this._pendingOnDemandDeletes.length > 0)
    {
      var pending = this._pendingOnDemandDeletes.shift();
      this.deletePendingOnDemand(pending.delete_range);
    }
  }

  /**
   * Removes the given range from the play buffer
   * @param {tuple} delete_range - start/end (seconds)
   */
  deletePendingOnDemand(delete_range)
  {
    const buffer = this._sourceBuffers[this._onDemandBufferIndex];
    if (buffer.updating == false)
    {
      buffer.onupdateend = () => {
        buffer.onupdatedend = null;
        this.cleanOnDemandBuffer();
      };

      buffer.remove(delete_range[0], delete_range[1]);
    }
    else
    {
      this._pendingOnDemandDeletes.push(
        {"delete_range": delete_range});
    }
  }

  seekBuffer()
  {
    return this._seekVideo;
  }

  currentIdx()
  {
    for (var idx = 0; idx < this._numBuffers; idx++)
    {
      if (this._full[idx] != true)
      {
        return idx;
      }
    }
    return null;
  }

  error()
  {
    var currentVid = this.currentVideo();
    if (currentVid)
    {
      return currentVid.error;
    }
    else
    {
      return {code: 500, message: "All buffers full."};
    }
  }

  /**
   * Set to compatibility mode
   */
  compat(videoUrl)
  {
    this._vidBuffers[0].src=videoUrl;
    this._vidBuffers[0].load();
    this._compat = true;
  }

  /**
   * Pause each of the video elements
   */
  pause()
  {
    // <= instead of < to include onDemand buffer
    for (var idx = 0; idx <= this._numBuffers; idx++)
    {
      this._vidBuffers[idx].pause();
    }
  }

  /**
   * Used for initialization of the video object.
   * @returns Promise that is resolved when the first video element is in the ready state or
   *          data has been loaded. This promise is rejected if an error occurs
   *          with the video element.
   */
  loadedDataPromise(video)
  {
    var that = this;
    var promise = new Promise(
      function(resolve,reject)
      {
        let loaded_data_callback = function()
        {
          console.info("Called promise");
          // In version 2 buffers are immediately available
          if (video._videoVersion >= 2)
          {
            that._vidBuffers[0].onloadeddata = null;
            resolve();
          }
          else
          {
            // attempt to go to the frame that is requested to be loaded
            console.log("Going to frame " + video._dispFrame);
            video.gotoFrame(video._dispFrame).then(() => {
              resolve();
              that._vidBuffers[0].onloadeddata = null;
            });
          }
        }
        that._vidBuffers[0].onloadeddata = loaded_data_callback;
        that._vidBuffers[0].onerror = function()
        {
          reject();
          that._vidBuffers[0].onerror = null;
        }

        if (that._vidBuffers[0].readyState > 0)
        {
          resolve();
        }
      });
    return promise;
  }

  /**
   * If there are any pending deletes for the seek buffer, this will rotate through them
   * and delete them
   */
  cleanSeekBuffer()
  {
    if (this._pendingSeekDeletes.length > 0)
    {
      var pending = this._pendingSeekDeletes.shift();
      this.deletePendingSeeks(pending.delete_range);
    }
  }

  /**
   * Removes the given start/end time segment from the seek buffer
   * @param {*} delete_range
   */
  deletePendingSeeks(delete_range=undefined)
  {
    // Add to the buffer directly else add to the pending
    // seek to get it there next go around
    if (this._seekReady) {
      if (this._seekBuffer.updating == false)
      {
        this._seekBuffer.onupdateend = () => {

          // Remove this handler
          this._seekBuffer.onupdateend = null;
          this.cleanSeekBuffer();
        };

        if (delete_range)
        {
          this._seekBuffer.remove(delete_range[0], delete_range[1]);
        }
      }
      else
      {
        this._pendingSeekDeletes.push(
          {'delete_range': delete_range});
      }
    }
  }
  appendSeekBuffer(data, time=undefined)
  {
    // Add to the buffer directly else add to the pending
    // seek to get it there next go around
    if (this._seekReady) {
      if (this._seekBuffer.updating == false)
      {
        this._seekBuffer.onupdateend = () => {

          // Remove this handler
          this._seekBuffer.onupdateend = null;
          // Seek to the time requested now that it is loaded
          if (time != undefined)
          {
            this._seekVideo.currentTime = time;
          }
        };

        // If this is a data request delete the stuff currently in the buffer
        if (data != null)
        {
          for (let idx = 0; idx < this._seekBuffer.buffered.length; idx++)
          {
            let begin = this._seekBuffer.buffered.start(idx);
            let end = this._seekBuffer.buffered.end(idx);

            // If the seek buffer has 3 seconds extra on either side
            // of the request chop of 1 seconds on either side this
            // means there is a maximum of ~4 second buffer in the
            // hq seek buffer.
            if (begin < time - 3)
            {
              this._pendingSeekDeletes.push({"delete_range": [begin,
                                                              time-1]});
            }
            if (end > time + 3)
            {
              this._pendingSeekDeletes.push({"delete_range": [time+1,
                                                              end]});
            }
          }
          this._seekBuffer.appendBuffer(data);
        }
      }
      else
      {
        this._pendingSeeks.push({'data': data,
                                 'time': time});
      }

    }
  }

  appendLatestBuffer(data, callback, blah)
  {
    if (this._init == false)
    {
      this._dataLag.push({data: data, callback: null});
      setTimeout(callback,100);
      return;
    }

    var latest=this.currentIdx();
    if (latest != null)
    {
      var newSize = this._inUse[latest] + data.byteLength;
      if (newSize > this._bufferSize)
      {
        console.log(`${latest} is full, proceeding to next buffer`);
        this._full[latest] = true;
        this.appendLatestBuffer(data, callback);
      }
      else
      {
        // If we are 5% away from the end, start overlapping
        // Except for the last buffer because then we are
        // SoL.
        if (newSize > (this._bufferSize *0.95) &&
            latest != (this._numBuffers - 1))
        {
          this._updateBuffers([latest,latest+1], data, callback, "scrub");
        }
        else
        {
          this._updateBuffers([latest], data, callback, "scrub");
        }
      }
    }
    else
    {
      console.error("No Buffers available!");
    }

  }

  /**
   * Appends the video data to the onDemand buffer.
   * After the buffer has been updated, the callback routine will be called.
   *
   * @param {bytes} data - Video segment
   * @param {function} callback - Callback executed once the buffer has been updated
   * @param {bool} force - Force update if true. False will yield updates only if init'd
   */
  appendOnDemandBuffer(data, callback, force)
  {
    if (this._init == false && force != true)
    {
      console.info("Waiting for init... (onDemand)");
      return;
    }
    this._updateBuffers([this._onDemandBufferIndex], data, callback, "onDemand");
  }

  /**
   *
   * @param {array} buffersToUpdate - List of buffer indices to add data to
   * @param {array} data - Array of video bytes to store
   * @param {function} callback - Callback function
   * @param {string} bufferType - "scrub" | "onDemand"
   */
  _updateBuffers(buffersToUpdate, data, callback, bufferType)
  {
    var that = this;

    if (bufferType == "scrub")
    {
      this._activeBuffers=Math.max(...buffersToUpdate)+1;
    }

    // Callback wrapper function used to help keep track of how many buffers
    // have been updated.
    var semaphore = buffersToUpdate.length;
    var wrapper=function()
    {
      that._sourceBuffers[this].onupdateend=null;
      semaphore--;
      if (semaphore == 0)
      {
        callback();
      }
    };

    // Place the provided frame data into each of the buffers if it's safe to do so.
    // Once the all the buffers have been updated, perform the callback
    for (var idx = 0; idx < buffersToUpdate.length; idx++)
    {
      var bIdx = buffersToUpdate[idx];
      var error = this._vidBuffers[bIdx].error;
      if (error)
      {
        console.error("Error " + error.code + "; details: " + error.message);
        updateStatus("Video Decode Error", "danger", -1);
        throw `Video Decode Error: ${bufferType}`;
      }
      this.safeUpdate(this._sourceBuffers[bIdx],data).then(wrapper.bind(bIdx));
      this._inUse[bIdx] += data.byteLength;
    }
  }

  appendAllBuffers(data, callback, force)
  {
    if (force == undefined)
    {
      force = false;
    }
    if (this._init == false && force == false)
    {
      console.info("Waiting for init... (appendAllBuffers)");
      this._initData = data;
      setTimeout(callback, 0);
      return;
    }
    var semaphore = this._numBuffers;
    var wrapper = function()
    {
      semaphore--;
      if (semaphore==0)
      {
        callback();
      }
    }

    this.safeUpdate(this._seekBuffer,data).then(() => {
      this._seekReady = true;
        // Handle any pending seeks
        if (this._pendingSeeks.length > 0)
        {
          var pending = this._pendingSeeks.shift();
          this.appendSeekBuffer(pending.data, pending.time);
        }

        // Now fill the rest of the buffers
        for (var idx = 0; idx < this._numBuffers; idx++)
        {
          this.safeUpdate(this._sourceBuffers[idx], data).then(wrapper);
          this._inUse[idx] += data.byteLength;
        }
    });
  }

  // Source buffers need a mutex to protect them, return a promise when
  // the update is finished.
  safeUpdate(buffer,data)
  {
    let promise = new Promise((resolve,reject) => {
      if (buffer.updating)
      {
        setTimeout(() => {
          this.safeUpdate(buffer,data).then(resolve);
        },100);
      }
      else
      {
        buffer.onupdateend=() => {
          buffer.onupdateend=null;
          resolve();
        };
        buffer.appendBuffer(data);
      }
    });
    return promise;
  }
}

/// Used to determine system fps and calculate playback
/// schedules based on a given video fps
class MotionComp {
  constructor() {
    this._interval = null;
    this._monitorFps = null;
    this._times = [];

    // This takes ~1/3 sec
    this._TRIALS = 20;

    // First we need to do a couple of trials to figure out what the
    // interval of the system is.
    let calcTimes = (now) => {
      this._times.push(now);
      if (this._times.length > this._TRIALS)
      {
        this.calculateMonitorFPS();
        console.info(`Calculated FPS interval = ${this._interval} (${this._monitorFps})`);
      }
      else
      {
        window.requestAnimationFrame(calcTimes);
      }
    };
    window.requestAnimationFrame(calcTimes);
  }

  calculateMonitorFPS() {
    let mode = new Map();
    // Calculate the mode of the delta over the calls ignoring the first few.
    for (let idx = 2; idx < this._TRIALS-1; idx++)
    {
      let delta = this._times[idx+1]-this._times[idx]
      if (delta < 4.1666) { // Cap out at 240Hz
        delta = 4.1666;
      }
      let fps = Math.round(1000.0/(delta));
      if (mode.has(fps))
      {
        mode.set(fps, mode.get(fps) + 1);
      }
      else
      {
        mode.set(fps, 1);
      }
    }

    let maxOccurance = 0;

    for (const canidate of mode.keys())
    {
      let occurance = mode.get(canidate)
      if (canidate > 0 && occurance > maxOccurance)
      {
        maxOccurance = occurance;
        this._monitorFps = canidate;
      }
    }

    if (Math.abs(this._monitorFps-240) < 10)
    {
      this._monitorFps = 240;
    }
    else if (Math.abs(this._monitorFps-120) < 10)
    {
      this._monitorFps = 120;
    }
    else if (Math.abs(this._monitorFps-60) < 5)
    {
      this._monitorFps = 60;
    }
    else if (Math.abs(this._monitorFps-30) < 5)
    {
      this._monitorFps = 30;
    }

    this._interval = 1000.0 / this._monitorFps;
    this._times = []
  }

  clearTimesVector()
  {
    this._times = [];
  }

  periodicRateCheck(now)
  {
    this._times.push(now);
    if (this._times.length > this._TRIALS)
    {
      const oldMonitor = this._monitorFps;
      this.calculateMonitorFPS();
      if (oldMonitor != this._monitorFps)
      {
        console.warn(`ALERT: New FPS interval = ${this._interval} (${this._monitorFps})`);
        console.warn("ALERT: Recalculating playback scheduled");
        this.computePlaybackSchedule(this._videoFps, this._factor);
      }
    }
  }
  /// Given a video at a frame rate calculate the frame update
  /// schedule:
  ///
  /// Example:
  ///
  ///  Animations  *       *       *       *       * ....
  ///  60 fps :    |   0   |   1   |   2   |   3   | ....
  ///  48 fps :    |   0      |    1      |     2     | ...
  ///  30 fps :    |   0   |   0   |   1   |   1   | ....
  ///  15 fps :    |   0   |   0   |   0   |   0   | ....
  ///
  /// Fractional fps are displayed at best effort based on the
  /// monitor's actual display rate (likely 60 fps)
  ///
  /// In the example above, 48fps is actually displayed at
  /// 60fps but interpolated to be as close to 48 fps
  /// Animations  *       *       *       *       * ....
  /// 48 fps :    |   0   |   1   |   1   |   2   | .... (effective 45 fps)
  ///
  computePlaybackSchedule(videoFps, factor)
  {
    // Cache these in case we need to recalculate later
    this._videoFps = videoFps;
    this._factor = factor;

    let displayFps = videoFps;
    if (factor < 1)
    {
      displayFps *= factor;
    }
    if (factor < 2)
    {
      displayFps *= factor;
    }

    // Compute a 3-slot schedule for playback
    let animationCyclesPerFrame = (this._monitorFps / displayFps);
    if (this._safeMode)
    {
      // Safe mode slows things down by 2x
      animationCyclesPerFrame *= 2;
    }
    let regularSize = Math.round(animationCyclesPerFrame);
    let fractional = animationCyclesPerFrame - regularSize;
    let largeSize = regularSize + Math.ceil(fractional*3)
    let smallSize = regularSize + Math.floor(fractional*3)
    const MAX_SCHEDULE_LENGTH=12;
    this._schedule = [];
    this._lengthOfSchedule = 0;

    for (let idx = 0; idx < MAX_SCHEDULE_LENGTH; idx++)
    {
      const mode = idx % 3;
      let newSize = null;
      if (mode == 0 || mode == 2)
      {
        newSize = regularSize;
      }
      else if (mode == 1)
      {
        const largeProposed = ((2+this._schedule.length)*1000) / ((this._lengthOfSchedule+largeSize+regularSize)*this._interval);
        const smallProposed = ((2+this._schedule.length)*1000) / ((this._lengthOfSchedule+smallSize+regularSize)*this._interval);
        const largeDelta = Math.abs(largeProposed-videoFps);
        const smallDelta = Math.abs(smallProposed-videoFps);
        console.info(`largeD = ${largeDelta}; smallD = ${smallDelta}`);

        if (largeDelta < smallDelta)
        {
          newSize = largeSize;
        }
        else
        {
          newSize = smallSize;
        }
      }
      this._lengthOfSchedule += newSize;
      this._schedule.push(newSize);
    }
    let update = 0;
    this._updatesAt = [];
    for (let idx = 0; idx < this._schedule.length; idx++)
    {
      this._updatesAt.push(update);
      update += this._schedule[idx];
    }
    this._targetFPS = (this._schedule.length*1000) / (this._lengthOfSchedule * this._interval)
    let msg = "Playback schedule = " + this._schedule + "\n";
    msg += "Updates @ " + this._updatesAt + "\n";
    msg += "Frame Increment = " + this.frameIncrement(videoFps, factor) + "\n";
    msg += "Target FPS = " + this._targetFPS + "\n";
    msg += "video FPS = " + videoFps + "\n";
    msg += "factor = " + factor + "\n";
    console.info(msg);
    //if (this._diagnosticMode == true)
    //{
    //  Utilities.sendNotification(msg, true);
    //}
  }

  /// Given an animation idx, return true if it is an update cycle
  timeToUpdate(animationIdx)
  {
    let relIdx = animationIdx % this._lengthOfSchedule;
    return this._updatesAt.includes(relIdx);
  }
  frameIncrement(fps, factor)
  {
    let clicks = Math.ceil(fps / this._monitorFps);
    if (factor > 1)
    {
      clicks *= factor;
    }

    // We skip every other frame in safe mode
    if (this._safeMode)
    {
      clicks *= 2;
    }
    return Math.floor(clicks);
  }

  safeMode()
  {
    //Utilities.sendNotification(`Entered safe mode on ${location.href}`);
    guiFPS = 15;
    this._safeMode = true;
  }

  // Returns the number of ticks that have occured since the last
  // report
  animationIncrement(now, last)
  {
    let difference = now-last;
    let increment = Math.round(difference/this._interval);
    // Handle start up burst
    if (isNaN(increment))
    {
      increment = 0;
    }
    increment = Math.min(increment,2);
    return increment;
  }

  get targetFPS()
  {
    return this._targetFPS;
  }
}
class VideoCanvas extends AnnotationCanvas {
  constructor() {
    super();

    // Set global variable to find us
    window.tator_video = this;
    var that = this;
    this._diagnosticMode = false;
    this._videoVersion = 1;

    let parameters = new URLSearchParams(window.location.search);
    if (parameters.has('diagnostic'))
    {
      console.info("Diagnostic Mode Enabled")
      this._diagnosticMode = true;
    }
    // Make a new off-screen video reference
    this._motionComp = new MotionComp();
    this._motionComp._diagnosticMode = this._diagnosticMode;
    this._playbackRate=1.0;
    this._dispFrame=0; //represents the currently displayed frame

    const searchParams = new URLSearchParams(window.location.search);
    if (searchParams.has("frame"))
    {
      this._dispFrame = Number(searchParams.get("frame"));
    }
    this._direction=Direction.STOPPED;
    this._fpsDiag=0;
    this._fpsLoadDiag=0;

    this._playCb = [this.onPlay.bind(this)];
    this._pauseCb = [this.onPause.bind(this), this.onDemandDownloadPrefetch.bind(this)];

    // This flag is used to force a vertex reload
    this._dirty = true;

    this._startBias = 0.0;

    if (this._diagnosticMode == true)
    {
      let msg = "Startup Diagnostic\n";
      let gl = this._draw.gl;
      let debug = gl.getExtension("WEBGL_debug_renderer_info");
      msg += "==== Browser Information ====\n";
      msg += `\tappVersion = ${navigator.appVersion}\n`;
      msg += `\turl = ${window.location.href}\n`;
      msg += "===== OpenGL Information ====\n";
      msg += `\tVENDOR = ${gl.getParameter(gl.VENDOR)}\n`;
      msg += `\tRENDERER = ${gl.getParameter(gl.RENDERER)}\n`;
      msg += `\tVERSION = ${gl.getParameter(gl.VERSION)}\n`;
      msg += `\tUNMASKED VENDOR = ${gl.getParameter(debug.UNMASKED_VENDOR_WEBGL)}\n`;
      msg += `\tUNMASKED RENDERER = ${gl.getParameter(debug.UNMASKED_RENDERER_WEBGL)}\n`;
      //Utilities.sendNotification(msg, true);
    }

    this._waitPlayback = false;
    this._waitId = null;

    this._videoDiagnostics = {
      id: null,
      currentFrame: null,
      sourceFPS: null,
      actualFPS: null,
      playQuality: null,
      scrubQuality: null,
      seekQuality: null
    };

    this._addVideoDiagnosticOverlay();
    this._ftypInfo = {};
    this._disableAutoDownloads = false;
    this._allowSafeMode = true;

    // Set the onDemand watchdog download thread
    // This will request to download segments if needed
    this._onDemandInit = false;
    this._onDemandInitSent = false;
    this._onDemandPlaybackReady = false;
    this._onDemandFinished = false;
    this._onDemandId = 0;
  }

  /**
   * Permanently disable downloading the scrub buffer.
   * #TODO Allow some ability to re-enable downloading the scrub buffer.
   */
   disableAutoDownloads() {
    this._disableAutoDownloads = true;
  }

  set allowSafeMode(val) {
    this._allowSafeMode = val;
  }

  // #TODO Refactor this so that it uses internal variables?
  updateVideoDiagnosticOverlay(display, currentFrame, sourceFPS, actualFPS, playQuality, scrubQuality, seekQuality, id) {
    if (this._mediaType.dtype == "video" || this._mediaType.dtype == "multi") {

      if (currentFrame != undefined) {
        this._videoDiagnostics.currentFrame = currentFrame;
      }
      if (sourceFPS != undefined) {
        this._videoDiagnostics.sourceFPS = sourceFPS;
      }
      if (actualFPS != undefined) {
        this._videoDiagnostics.actualFPS = actualFPS;
      }
      if (playQuality != undefined) {
        this._videoDiagnostics.playQuality = playQuality;
      }
      if (scrubQuality != undefined) {
        this._videoDiagnostics.scrubQuality = scrubQuality;
      }
      if (seekQuality != undefined) {
        this._videoDiagnostics.seekQuality = seekQuality;
      }
      if (id != undefined) {
        this._videoDiagnostics.id = id;
      }

      var textContent = `
      Frame: ${this._videoDiagnostics.currentFrame}\r\n
      Rate: ${this._playbackRate}\r\n
      1x-4x Playback Quality: ${this._videoDiagnostics.playQuality}\r\n
      Scrub Quality: ${this._videoDiagnostics.scrubQuality}\r\n
      Seek Quality: ${this._videoDiagnostics.seekQuality}\r\n
      Source FPS: ${this._videoDiagnostics.sourceFPS}\r\n
      Actual FPS: ${this._videoDiagnostics.actualFPS}\r\n
      ID: ${this._videoDiagnostics.id}\r\n
      `;

      var enableDisplay = null;
      if (display === false) {
        enableDisplay = false;
      }
      else if (display === true) {
        enableDisplay = true;
      }

      this._textOverlay.modifyText(
        this._videoDiagOverlay,
        {content: textContent,
         style: {
           "whiteSpace": "pre-line",
           "fontSize": "10pt",
           "fontWeight": "bold",
           "color": "white",
           "background": "rgba(0,0,0,0.33)"}},
        enableDisplay);
    }
  }

  _addVideoDiagnosticOverlay() {
    this._videoDiagOverlay = this._textOverlay.addText(0.5, 0.5, "");
    this._textOverlay.toggleTextDisplay(this._videoDiagOverlay, false);
  }

  refresh(forceSeekBuffer)
  {
    // Refresh defaults to high-res buffer
    if (forceSeekBuffer == undefined)
    {
      forceSeekBuffer = true;
    }
    this._draw.beginDraw();
    return this.gotoFrame(this._dispFrame, forceSeekBuffer);
  }

  currentFrame()
  {
    return this._dispFrame;
  }

  stopDownload()
  {
    // If there is an existing download worker, kill it
    if (this._dlWorker != null)
    {
      this._dlWorker.terminate();
    }
  }

  setVolume(volume)
  {
    if (this._audioPlayer)
    {
      this._audioPlayer.volume = volume / 100;
    }
  }

  startDownload(streaming_files, offsite_config)
  {
    var that = this;

    this._dlWorker = new Worker(`${src_path}/vid_downloader.js`);
    this._scrubDownloadCount = 0;

    this._dlWorker.onmessage =
      function(e)
    {
      const type = e.data["type"];
      if (type == "finished")
      {
        console.info("Stopping download worker.");
      }
      else if (type == "seek_result")
      {
        if (that._seekFrame != e.data["frame"])
        {
          console.warn(`Out of order seek operations detected. Expected=${this.seekFrame}, Got=${e.data["frame"]}`);
          return;
        }
        that._videoElement[that._seek_idx].appendSeekBuffer(e.data["buffer"], e.data['time']);
        document.body.style.cursor = null;
        let seek_time = performance.now() - that._seekStart;
        let seek_msg = `Seek time = ${seek_time} ms`;
        console.info(seek_msg);
        //if (that._diagnosticMode == true)
        //{
        //  Utilities.sendNotification(seek_msg);
        //}
      }
      else if (type == "buffer")
      {
        //console.log(`....downloaded: ${parseInt(100*e.data["percent_complete"])} (buf_idx: ${e.data["buf_idx"]})`)
        let video_buffer = that._videoElement[e.data["buf_idx"]];
        var error = video_buffer.error();
        if (error)
        {
          console.error("dlWorker thread - video decode error");
          updateStatus("Video decode error", "danger", "-1");
          return;
        }

        // recursive lamdba function to update source buffer
        var idx = 0;
        var offsets = e.data["offsets"];
        var data = e.data["buffer"];

        // Stores the downloaded data in the appropriate local buffer
        var appendBuffer=function(callback)
        {
          var offsets = e.data["offsets"];
          if (idx < offsets.length)
          {
            if (offsets[idx][2] == 'ftyp')
            {
              // Save the file info in case we need to reinitialize again
              var ftypInfo = {};
              for(let key in e.data) {
                ftypInfo[key] = e.data[key];
              }
              that._ftypInfo[e.data["buf_idx"]] = ftypInfo;

              // First part of the fragmented mp4 segment info. Need this and the subsequent
              // "moov" atom to define the file information
              console.log(`Video init of: ${e.data["buf_idx"]}`);
              var begin=offsets[idx][0];
              var end=offsets[idx+1][0]+offsets[idx+1][1];
              video_buffer.appendAllBuffers(data.slice(begin, end), callback);
              video_buffer.appendOnDemandBuffer(data.slice(begin, end), () => {});
              idx+=2;
            }
            else
            {
              // Rest of the fragmented mp4 segment info
              var begin=offsets[idx][0];
              var end=offsets[idx][0] + offsets[idx][1];
              if (typeof video_buffer._dataLag != "undefined" && video_buffer._dataLag.length > 0) {
                console.log("dataLag has data: " + video_buffer._dataLag.length);
                video_buffer._dataLag.push({data: data.slice(begin, end), callback: callback});
              }
              else {
                video_buffer.appendLatestBuffer(data.slice(begin, end), callback);
              }
              idx++;
            }
          }
        };

        var afterUpdate = function(_)
        {
          var error = video_buffer.error();
          if (error)
          {
            console.error("Error " + error.code + "; details: " + error.message);
            updateStatus("Video Decode Error", "danger", -1);
            return;
          }

          if (idx == offsets.length)
          {
            if (e.data["buf_idx"] == that._scrub_idx)
            {
              that.dispatchEvent(new CustomEvent("bufferLoaded",
                                                {composed: true,
                                                  detail: {"percent_complete":e.data["percent_complete"]}
                                                }));

              if (that._disableAutoDownloads && that._scrubDownloadCount >= 2) {
                return;
              }
              that._scrubDownloadCount += 1
              that._dlWorker.postMessage({"type": "download",
                                          "buf_idx": e.data["buf_idx"]});;
            }
          }
          else
          {
            // Can't call append in this event handler + avoid a deep recursion stack
            setTimeout(function()
                       {
                         appendBuffer(afterUpdate);
                       },0);
          }
        };

        appendBuffer(afterUpdate);

      }
      else if (type == "ready")
      {
        if (e.data["buf_idx"] == that._scrub_idx)
        {
          that._startBias = e.data["startBias"];
          that._videoVersion = e.data["version"];
          console.info(`Video has start bias of ${that._startBias} - buffer: ${that._scrub_idx}`);
          console.info("Setting hi performance mode");
          guiFPS = 60;
        }
      }
      else if (type == "error")
      {
        // Go to compatibility mode
        console.warn("In video compatibility mode");
        that._videoElement[0].compat(streaming_files[0].path);
        that.seekFrame(0, that.drawFrame);
        that.dispatchEvent(new CustomEvent("bufferLoaded",
                                           {composed: true,
                                            detail: {"percent_complete":1.00}
                                           }));
        that.dispatchEvent(new CustomEvent("playbackReady",
                                          {composed: true,
                                           detail: {playbackReadyId: this._waitId},
                                           }));
        that._onDemandPlaybackReady = true; // fake it
      }
      else if (type == "onDemandInit")
      {
        // Download worker's onDemand mode is ready
        that._onDemandInit = true;
      }
      else if (type == "onDemandFinished")
      {
        console.log("onDemand finished downloading. Reached end of video.");
        that._onDemandFinished = true;
        that._onDemandPlaybackReady = true; //if we reached the end, we are done.
      }
      else if (type == "onDemand")
      {
        // Received the onDemand downloaded segments
        var idx = 0;
        var offsets = e.data["offsets"];
        var data = e.data["buffer"];
        var video_buffer = that._videoElement[e.data["buf_idx"]];
        var error = video_buffer.error();
        if (error)
        {
          updateStatus("Video decode error", "danger", "-1");
          return;
        }

        var restartOnDemand = function () {

          console.log("******* restarting onDemand: Clearing old buffer");
          that.stopPlayerThread();

          var video = that._videoElement[that._play_idx];

          var setupCallback = function() {
            console.log("******* restarting onDemand: Setting up new buffer");
            var offsets2 = that._ftypInfo[that._play_idx]["offsets"];
            var data2 = that._ftypInfo[that._play_idx]["buffer"];
            var begin2 = offsets2[0][0];
            var end2 = offsets2[1][0]+offsets2[1][1];
            video.appendOnDemandBuffer(data2.slice(begin2, end2), playCallback);
          }

          var playCallback = function () {
            console.log("******* restarting onDemand: Playing");
	          that.onDemandDownloadPrefetch(true);
            that._playGenericOnDemand(that._direction)
          };

          video.recreateOnDemandBuffers(setupCallback);
        }

        // Function used to apply the frame data to the onDemand buffer
        // Callback is called after the data has been applied
        var appendBuffer = function(callback)
        {
          if (idx < offsets.length)
          {
            if (offsets[idx][2] == 'ftyp')
            {
              // First part of the fragmented mp4 segment info. Need this and the subsequent
              // "moov" atom to define the file information
              var begin = offsets[idx][0];
              var end = offsets[idx+1][0] + offsets[idx+1][1];

              // Note: There is only one buffer for the onDemand buffer, unlike the other
              //       scrub buffers. So, we only need to initialize a single buffer
              //       with this video information.
              video_buffer.appendOnDemandBuffer(data.slice(begin, end), callback);
              idx += 2;
            }
            else
            {
              // Rest of the video segment information (moof / mdat / mfra)
              var begin = offsets[idx][0];
              var end = offsets[idx][0] + offsets[idx][1];

              try {
                if (!that._makeVideoError) {
                  video_buffer.appendOnDemandBuffer(data.slice(begin, end), callback);
                }
                else {
                  // #DEBUG path - Used to induce a decoding error
                  that._makeVideoError = false;
                  video_buffer.appendOnDemandBuffer(data.slice(begin, end - 5), callback);
                }
              }
              catch {
                setTimeout(function() {
                  restartOnDemand();
                },100);
              }
              idx++;
            }
          }
        }

        // Function called after frame data has been applied to the onDemand buffer
        var afterUpdate = function(_)
        {
          var error = video_buffer.error();
          if (error)
          {
            // Something catastrophic happened with the video.
            console.error("Error " + error.code + "; details: " + error.message);
            updateStatus("Video Decode Error", "danger", -1);
            setTimeout(function() {
              restartOnDemand();
            },100);
            return;
          }

          if (idx == offsets.length && e.data["buf_idx"] == that._play_idx && that._onDemandInit)
          {
            // Done processing the downloaded segment.
            // Watchdog will kick off the next segment to download.
            that._onDemandPendingDownloads -= 1;
            return;
          }
          else
          {
            // Haven't finished processing thd downloaded data. Move to the next segment
            // in the downloaded block and append that to the buffer
            setTimeout(function()
                       {
                         appendBuffer(afterUpdate);
                       },0);
          }
        }

        if (e.data["id"] == that._onDemandId) {
          appendBuffer(afterUpdate);
        }
      }
    };

    // Start downloading the scrub buffer
    this._dlWorker.postMessage({"type": "start",
                                "media_files": streaming_files,
                                "play_idx": this._play_idx,
                                "hq_idx": this._seek_idx,
                                "scrub_idx": this._scrub_idx,
                                "offsite_config": offsite_config});
  }

  /**
   * Returns the video quality information of the provided video buffer
   *
   * @param {string} buffer - play|scrub|seek
   * @returns {object} Object will have the following fields:
   *    .quality {float}
   *    .fps {float}
   */
  getQuality(buffer)
  {
    var outVal = {quality: null, fps: null};
    if (buffer == "play")
    {
      outVal.quality = this._videoObject.media_files["streaming"][this._play_idx].resolution[0];
      outVal.fps = this._videoObject.fps;
    }
    else if (buffer == "scrub")
    {
      outVal.quality = this._videoObject.media_files["streaming"][this._scrub_idx].resolution[0];
      outVal.fps = this._videoObject.fps;
    }
    else if (buffer = "seek")
    {
      outVal.quality = this._videoObject.media_files["streaming"][this._seek_idx].resolution[0];
      outVal.fps = this._videoObject.fps;
    }
    return outVal;
  }

  /**
   * @param {integer} quality - e.g. 144,360,720 (width parameter)
   * @returns {object} Object will have the following fields:
   *    .quality {float}
   *    .fps {float}
   */
  nearestQuality(quality)
  {
    let find_closest = (videoObject, resolution) => {
      let play_idx = -1;
      let max_delta = Number.MAX_SAFE_INTEGER;
      let resolutions = videoObject.media_files["streaming"].length;
      for (let idx = 0; idx < resolutions; idx++)
      {
        let height = videoObject.media_files["streaming"][idx].resolution[0];
        let delta = Math.abs(quality - height);
        if (delta < max_delta)
        {
          max_delta = delta;
          play_idx = idx;
        }
      }
      return play_idx;
    };

    let selectedIndex = find_closest(this._videoObject, quality);
    let outValue = {
      quality: this._videoObject.media_files["streaming"][selectedIndex].resolution[0],
      fps: this._videoObject.fps
    };
    return outValue;
  }

  /**
   *
   * @param {Number} quality - Target width dimension
   * @param {string} buffer - scrub|seek|play
   */
  setQuality(quality, buffer)
  {
    let find_closest = (videoObject, resolution) => {
      let play_idx = -1;
      let max_delta = Number.MAX_SAFE_INTEGER;
      let resolutions = videoObject.media_files["streaming"].length;
      for (let idx = 0; idx < resolutions; idx++)
      {
        let height = videoObject.media_files["streaming"][idx].resolution[0];
        let delta = Math.abs(quality - height);
        if (delta < max_delta)
        {
          max_delta = delta;
          play_idx = idx;
        }
      }
      return play_idx;
    };

    if (this._videoObject)
    {
      let new_play_idx = find_closest(this._videoObject, quality);

      if (buffer == undefined) {
        this._play_idx = new_play_idx;
      }
      else if (buffer == "play") {
        this._play_idx = new_play_idx;
      }
      else if (buffer == "seek") {
        this._seek_idx = new_play_idx;
      }
      else if (buffer == "scrub") {
        if (new_play_idx != this._scrub_idx) {
          this.stopDownload();
          this.startDownload(this._videoObject.media_files["streaming"], this._offsiteConfig);
        }
        this._scrub_idx = new_play_idx;
      }
      console.log("Setting 1x-4x playback quality to: " + quality);

      // This try/catch exists only because setQuality is sometimes called and
      // invalid indexes are selected.
      // #TODO Understand why this occurs in multiview
      try {
        this.updateVideoDiagnosticOverlay(
          null, this._dispFrame, "N/A", "N/A",
          this._videoObject.media_files["streaming"][this._play_idx].resolution[0],
          this._videoObject.media_files["streaming"][this._scrub_idx].resolution[0],
          this._videoObject.media_files["streaming"][this._seek_idx].resolution[0],
          this._videoObject.id);
      }
      catch {}
    }
  }

  video_id()
  {
    return this._videoObject.id;
  }
  /// Load a video from URL (whole video) with associated metadata
  /// Returns a promise when the video resource is loaded
  loadFromVideoObject(videoObject, mediaType, quality, resizeHandler, offsite_config, numGridRows, heightPadObject)
  {
    this.mediaInfo = videoObject;
    if (mediaType)
      this.mediaType = mediaType;
    this._videoObject = videoObject;
    // If quality is not supplied default to 720
    if (quality == undefined || quality == null)
    {
      quality = 720;
    }
    if (resizeHandler == undefined)
    {
      resizeHandler = true;
    }
    if (offsite_config == undefined)
    {
      offsite_config = {}
    }
    this._offsiteConfig = offsite_config;

    // Note: dims is width,height here
    let videoUrl, fps, numFrames, dims;
    fps = videoObject.fps;
    numFrames = videoObject.num_frames;

    let find_closest = (videoObject, target_quality) => {
      let play_idx = -1;
      let max_delta = videoObject.height;
      let resolutions = videoObject.media_files["streaming"].length;
      for (let idx = 0; idx < resolutions; idx++)
      {
        let height = videoObject.media_files["streaming"][idx].resolution[0];
        let delta = Math.abs(target_quality - height);
        if (delta < max_delta)
        {
          max_delta = delta;
          play_idx = idx;
        }
      }
      return play_idx;
    };

    let play_idx = -1;
    let scrub_idx = -1;
    let hq_idx = -1;
    let streaming_files = null;
    this._lastSeekFrame = -1;
    if (videoObject.media_files)
    {
      streaming_files = videoObject.media_files["streaming"];
      play_idx = find_closest(videoObject, quality);
      // Todo parameterize this to maximize flexibility
      scrub_idx = find_closest(videoObject, 320);
      console.info(`NOTICE: Choose video stream ${play_idx}`);

      if ('audio' in videoObject.media_files && !offsite_config.hasOwnProperty('host'))
      {
        let audio_def = videoObject.media_files['audio'][0];
        this._audioPlayer = document.createElement("AUDIO");
        this._audioPlayer.setAttribute('src', audio_def.path);
        this._audioPlayer.volume = 0.5; // Default volume
        this.audio = true;
        this.addPauseListener(() => {
          this._audioPlayer.pause();
        });
      }

      // The streaming files may not be in order, find the largest resolution
      hq_idx = 0;
      var largest_height = 0;
      for (let idx = 0; idx < videoObject.media_files["streaming"].length; idx++)
      {
        let height = videoObject.media_files["streaming"][idx].resolution[0];
        if (height > largest_height)
        {
          largest_height = height;
          hq_idx = idx;
        }
      }

      // Use the largest resolution to set the viewport
      dims = [streaming_files[hq_idx].resolution[1],
              streaming_files[hq_idx].resolution[0]];
    }
    // Handle cases when there are no streaming files in the set
    if (play_idx == -1)
    {
      videoUrl = "/media/" + videoObject.file;
      dims = [videoObject.width,videoObject.height];
      console.warn("Using old access method!");
      streaming_files = [{"path": "/media/" + videoObject.file,
                          "resolution": [videoObject.height,videoObject.width]}];
      play_idx = 0;
      scrub_idx = 0;
      hq_idx = 0;
    }

    // Set initial buffer index values
    this._play_idx = play_idx;
    this._scrub_idx = scrub_idx;
    this._seek_idx = hq_idx;
    console.log(`video buffer indexes: ${play_idx} ${scrub_idx} ${hq_idx}`);

    this._videoElement = [];
    for (let idx = 0; idx < streaming_files.length; idx++)
    {
      this._videoElement.push(new VideoBufferDemux());
      this._videoElement[idx].named_idx = idx;
    }
    // Clear the buffer in case this is a hot-swap
    this._draw.clear();

    console.info(`Video dimensions = ${dims}`);

    // Resize the viewport
    this._draw.resizeViewport(dims[0], dims[1]);
    this._fps=fps;
    this._numFrames=numFrames;
    this._numSeconds=fps*numFrames;
    this._dims=dims;
    this.resetRoi();

    this.stopDownload();
    var promise = this._videoElement[this._scrub_idx].loadedDataPromise(this);

    this.startDownload(streaming_files, offsite_config);
    if (fps > guiFPS)
    {
      this._playbackRate=guiFPS/fps;
      this.rateChange(this._playbackRate);
      var msg = "Loading a video with faster framerate than supported then display.\n";
      msg+= "Adjusting playrate to avoid dropping frames.\n";
      msg+= "\tDisplay FPS=" + guiFPS + "\n";
      msg+= "\tVideo FPS=" + fps + "\n";
      msg+= "\tPlayrate = " + this._playbackRate;
      console.warn(msg);
    }

    // Set up slider max + scrub thresholds
    this.scrubThreshold = Math.max(25,numFrames/200);
    this._draw.resizeViewport(dims[0], dims[1]);
    if (resizeHandler)
    {
      this.setupResizeHandler(dims, numGridRows, heightPadObject);
    }

    // #debug
    // Display the video qualities used for each of the buffers
    console.log(`--- Quality on scrub ${streaming_files[this._scrub_idx].resolution[0]}`)
    console.log(`--- Quality on play ${streaming_files[this._play_idx].resolution[0]}`)
    console.log(`--- Quality on pause ${streaming_files[this._seek_idx].resolution[0]}`)

    this.updateVideoDiagnosticOverlay(
      null, this._dispFrame, "N/A", "N/A",
      streaming_files[this._play_idx].resolution[0],
      streaming_files[this._scrub_idx].resolution[0],
      streaming_files[this._seek_idx].resolution[0],
      videoObject.id);

    // On load seek to frame 0
    return promise;
  }

  isInCompatibilityMode()
  {
    return this._videoElement[0]._compat;
  }

  clearFrame()
  {
    var cWidth=this._canvas.width;
    var cHeight=this._canvas.height;
    this._draw.clearRect(0,0,cWidth, cHeight);

    //Clear the buffer too
    this._draw.clear();

    this._dispFrame=null;
  }

  // Update the canvas (immediate) with the source material, centered on
  // the view screen (resets GPU-bound frame buffer)
  // holds the buffer
  drawFrame(frameIdx, source, width, height)
  {
    // Need to draw the image to the viewable size of the canvas
    // .width is actually the rendering width which may be different
    // in high DPI monitors.
    var cWidth=this._draw.clientWidth;
    var cHeight=this._draw.clientHeight;
    // Calculate scaled image height, such that
    // the height matches the height of the viewscreen
    // and set the scaled width accordingly to maintain aspect
    var scale=cHeight/height;
    var sHeight=height*scale;
    var sWidth=width*scale;

    // Calculate the margin we have in width
    var margin=cWidth-sWidth;
    // We want half of the margin to the left of the image frame
    var leftSide=margin/2;

    // Handle the buffer synchronously because we are seeking in this
    // function. Clear the pipeline, Push the latest image, and display
    this._draw.clear();
    this._draw.pushImage(frameIdx,
                         source,
                         this._roi[0],this._roi[1],
                         this._roi[2],this._roi[3], //Image size
                         leftSide,0, //Place 'full-screen'
                         sWidth,sHeight, // Use canvas size
                         this._dirty
                        );
    this._dirty=false;

    this.displayLatest(true);
    this.updateOffscreenBuffer(frameIdx,
                               source,
                               width,
                               height);
  }

  /**
   * Emits the latest image in the off-screen buffer
   *
   * Only call this function from the context of an animation frame
   * Only call this function if the drawing context can play.
   *
   * @param {boolean} hold - Defaults to false. #TODO fill in with more information
   * @emits frameChange Emitted with frame info
   * @emits playbackEnded Only emitted if we've reached either end of the video
   */
  displayLatest(hold)
  {
    this._fpsDiag++;
    this._dispFrame=this._draw.dispImage(hold);

    this.dispatchEvent(new CustomEvent("frameChange", {
      detail: {frame: this._dispFrame},
      composed: true
    }));

    this.updateVideoDiagnosticOverlay(null, this._dispFrame);

    let ended = false;
    if (this._direction == Direction.FORWARD &&
        this._dispFrame >= (this._numFrames - 2))
    {
      ended = true;
    }
    else if (this._direction == Direction.BACKWARDS &&
             this._dispFrame <= 0)
    {
      ended = true;
    }

    if (ended == true)
    {
      console.log("video.playbackEnded");
      this.dispatchEvent(new CustomEvent("playbackEnded", {
      composed: true
      }));
    }
  }

  /**
   * Pushes the frame stored in the given source into the drawGL buffer
   *
   * @param {integer} frameIdx - Frame number
   * @param {array} source - Array of bytes representing the frame image
   * @param {float} width - Width of image
   * @param {float} height - Height of image
   */
  pushFrame(frameIdx, source, width, height)
  {
    var cWidth=this._canvas.width;
    var cHeight=this._canvas.height;
    // Calculate scaled image height, such that
    // the height matches the height of the viewscreen
    // and set the scaled width accordingly to maintain aspect
    var scale=cHeight/height;
    var sHeight=height*scale;
    var sWidth=width*scale;

    // Calculate the margin we have in width
    var margin=cWidth-sWidth;
    // We want half of the margin to the left of the image frame
    var leftSide=margin/2;

    this._draw.pushImage(frameIdx,
                         source,
                         this._roi[0],this._roi[1],
                         this._roi[2],this._roi[3], //Image size
                         leftSide,0, //Place 'full-screen'
                         sWidth,sHeight, // Use canvas size
                         this._dirty
                        );
    this._dirty=false;
  }

  /**
   * Get the video element associated with the given buffer type and frame number
   *
   * @param {integer} frame - Target frame number
   * @param {string} bufferType - "scrub" | "play" | "seek"
   * @returns {video HTMLelement}
   */
  videoBuffer(frame, bufferType)
  {
    if (frame == undefined)
    {
      frame = this.currentFrame();
    }
    var time=this.frameToTime(frame);
    var direction = this._direction;
    if (direction == Direction.STOPPED)
    {
      if (frame > this.currentFrame() || frame == this.currentFrame())
      {
        direction = Direction.FORWARD;
      }
      else
      {
        direction = Direction.BACKWARD;
      }
    }

    if (bufferType == "seek")
    {
      return this._videoElement[this._seek_idx].returnSeekIfPresent(time, direction);
    }
    else if (bufferType == "play")
    {
      return this._videoElement[this._play_idx].forTime(time, bufferType, direction, this._numSeconds);
    }
    else
    {
      return this._videoElement[this._scrub_idx].forTime(time, bufferType, direction, this._numSeconds);
    }
  }

  frameToTime(frame)
  {
    return this._startBias + ((1/this._fps)*frame)+(1/(this._fps*4));
  }

  frameToAudioTime(frame)
  {
    return this._startBias + ((1/this._fps)*frame);
  }

  /**
   * Seeks to a specific frame of playback
   *
   * This is used for both jumping to a particular frame and for scrubbing as well.
   * If scrubbing (which involves jumping frames very quickly), then the forceSeekBuffer
   * should not be used.
   *
   * @param {integer} frame - Frame number to jump to
   * @param {function} callback - Callback to execute when the frame has been updated.
   *                              Expected callback signature -> data, width, height
   * @param {bool} forceSeekBuffer - True if the high quality, single fetch should be used.
   *                                 False if the downloaded scrub buffer should be used.
   * @param {bool} bufferType - Buffer to use if seek buffer is not forced
   */
  seekFrame(frame, callback, forceSeekBuffer, bufferType)
  {
    var that = this;
    var time = this.frameToTime(frame);
    var audio_time = this.frameToAudioTime(frame);
    var downloadSeekFrame = false;
    var createTimeout = false;

    if (bufferType == undefined)
    {
      bufferType = "scrub";
    }
    if (forceSeekBuffer)
    {
      bufferType = "seek";
    }
    //console.log(`seekFrame: ${frame} ${bufferType}`)
    var video = this.videoBuffer(frame, bufferType);

    // Only support seeking if we are stopped (i.e. not playing) and we are not
    // attempting to seek to another frame
    if (video == null && this._direction == Direction.STOPPED)
    {
      // Set the seek buffer, and command worker to get the seek
      // response
      document.body.style.cursor = "progress";

      this._masked=true;
      // Only mask edits if seeking to a different frame
      if (this.currentFrame() != frame)
      {
        this.dispatchEvent(new CustomEvent("temporarilyMaskEdits",
                                       {composed: true,
                                        detail: {enabled: true}}));
      }
      video = this._videoElement[this._seek_idx].seekBuffer();
      this._seekStart = performance.now();

      // Use the frame as a cookie to keep track of duplicated
      // seek operations
      this._seekFrame = frame;

      if (this._lastSeekFrame != this._seekFrame)
      {
        downloadSeekFrame = true;
      }

      clearTimeout(this._seek_expire);
      createTimeout = true;
    }
    else if (video == null)
    {
      return new Promise(
        function(resolve,reject)
        {
          callback = callback.bind(that);
          callback(frame, video, that._dims[0], that._dims[1]);
          resolve();
        });
    }

    var promise = new Promise(
      function(resolve,reject)
      {
        // Because we are using off-screen rendering we need to defer
        // updating the canvas until the video/frame is actually ready, we do this
        // by waiting for a signal off the video + then scheduling an animation frame.
        video.oncanplay=function()
        {
          clearTimeout(that._seek_expire);
          that._seek_expire = null;
          // if we are masked, take it off
          if (that._masked == true)
          {
            that._masked = false;
            that.dispatchEvent(new CustomEvent("temporarilyMaskEdits",
                                               {composed: true,
                                                detail: {enabled: false}}));
          }
          // Don't do anything busy in the canplay interrupt as it holds up the GUI
          // rasterizer.
          // Need to bind the member function to the result handler
          callback=callback.bind(that);
          callback(frame, video, that._dims[0], that._dims[1])
          resolve();
          video.oncanplay=null;
          if (forceSeekBuffer && that._audioPlayer)
          {
            that._audioPlayer.currentTime = audio_time;
            console.info("Setting audio to " + audio_time);
          }

          // Remove entries (if required to do so) now that we've drawn the frame
          that._videoElement[that._seek_idx].cleanSeekBuffer();
        };

        if (createTimeout)
        {
          that._seek_expire = setTimeout(() => {
            that._lastSeekFrame = that._seekFrame;
            that._seekFrame = -1;
            that._seek_expire = null;
            document.body.style.cursor = null;
            console.warn("Network Seek expired");
            that.refresh(false);
            reject();
          }, 3000);
        }

        if (downloadSeekFrame)
        {
          that._dlWorker.postMessage(
            {"type": "seek",
             "frame": frame,
             "time": time,
             "buf_idx": that._seek_idx});
        }
      });

    if (time <= video.duration || isNaN(video.duration))
    {
      video.currentTime = time;
    }
    else if (time > video.duration)
    {
      var end = video.duration;
      time = end;
      frame = end*this._fps;
      video.currentTime = end;
    }
    else
    {
      time = 0;
      frame = 0;
      video.currentTime = 0;
    }
    return promise;
  }

  /**
   * Note: Once in safe mode, there's no mechanism to get out of it.
   */
  safeMode()
  {
    this._motionComp.safeMode();
  }

  ////////////////////////////////
  /// Button handlers
  ////////////////////////////////
  rateChange(newRate)
  {
    this._playbackRate=newRate;
    if (this._direction != Direction.STOPPED)
    {
      this._motionComp.computePlaybackSchedule(this._fps,this._playbackRate);
    }
    this.dispatchEvent(new CustomEvent("rateChange", {
      detail: {rate: newRate},
      composed: true,
    }));
  }

  processRateChange(event)
  {
    this._playbackRate=this._controls.rateControl.val();
    console.log("Set playback rate to: " + this._playbackRate);
    return false;
  }

  /**
   * Only attempt to seek to a frame if the player is paused
   *
   * @param {integer} frameIdx - Frame number to go to
   * @param {boolean} forceSeekBuffer - True if use high quality fetch, false uses scrub buffer
   */
  gotoFrame(frameIdx, forceSeekBuffer)
  {
    if (this._direction != Direction.STOPPED)
    {
      return;
    }

    // In the event some out of band drawing has happened, make sure to clear any latent
    // draw buffers.
    this._draw.beginDraw();

    var finalPromise = new Promise((resolve, reject) => {
      var promise = this.seekFrame(parseInt(frameIdx), this.drawFrame, forceSeekBuffer);
      promise.then(() =>
        {
          this._pauseCb.forEach(cb => {cb(frameIdx);
          resolve();
        });
      }).catch(error =>
        {
          resolve();
        });
    });
    return finalPromise;
  }

  captureFrame(localizations,frame)
  {
    if (frame == undefined)
    {
      frame = this.currentFrame()
    }

    const filename = `Frame_${frame}_${this._mediaInfo['name']}`;
    this.makeOffscreenDownloadable(localizations, filename);
  }


  _playGenericScrub(direction)
  {
    var that = this;
    console.log("Setting playback direction " + direction);
    this._direction=direction;

    // Reset the GPU buffer on a new play action
    this._draw.clear();

    // Reset perioidc health check in motion comp
    this._motionComp.clearTimesVector();
    this._motionComp.computePlaybackSchedule(this._fps,this._playbackRate);


    this._lastTime = performance.now();
    this._animationIdx = 0;

    // We are eligible for audio if we are at a supported playback rate
    // have audio, and are going forward.
    this._audioEligible=false;
    if (this._playbackRate >= 1.0 &&
        this._playbackRate <= 4.0 &&
        this._audioPlayer &&
        direction == Direction.FORWARD)
    {
      this._audioEligible = true;
      this._audioPlayer.playbackRate = this._playbackRate;
    }

    this._sentPlaybackReady = false;
    // Kick off the loader
    this._loaderTimeout=setTimeout(()=>{this.loaderThread(true, "scrub");}, 0);
  }

  /**
   * Debug only
   */
  _createVideoError() {
    this._makeVideoError = true;
  }

  /**
   * Start the video onDemand playback
   *
   * Launches the following threads:
   * - player thread
   * - loader thread
   * - diagnostics/audiosync thread
   *
   * @param {Direction} direction Forward or backward playback
   */
  _playGenericOnDemand(direction)
  {
    var that = this;
    console.log(`_playGenericOnDemand (ID:${this._videoObject.id}) Setting direction ${direction}`);
    this._direction=direction;

    // If we are going backwards re-init the buffers
    // as we are optimized for forward playback on pause.
    if (this._direction == Direction.BACKWARDS)
    {
      this._onDemandInit = false;
      this._onDemandInitSent = false;
      this._onDemandPlaybackReady = false;
      this._onDemandFinished = false;
      var that = this;
      this._videoElement[this._play_idx].resetOnDemandBuffer().then(() => {
        that.onDemandDownload(true);
      });
    }
    // Reset the GPU buffer on a new play action
    this._draw.clear();

    // Reset perioidc health check in motion comp
    this._motionComp.clearTimesVector();

    this._playing = false;

    // We are eligible for audio if we are at a supported playback rate
    // have audio, and are going forward.
    this._audioEligible=false;
    if (this._playbackRate >= 1.0 &&
        this._playbackRate <= 4.0 &&
        this._audioPlayer &&
        direction == Direction.FORWARD)
    {
      this._audioEligible = true;
      this._audioPlayer.playbackRate = this._playbackRate;
    }

    // Diagnostics and audio readjust thread
    this._fpsDiag = 0;
    this._fpsLoadDiag = 0;
    this._fpsScore = 3;
    this._networkUpdate = 0;
    this._audioCheck = 0;




    this._loaderStarted = false;
    this._sentPlaybackReady = false;
    this._lastTime = null;
    this._animationIdx = 0;

    this._motionComp.computePlaybackSchedule(this._fps,this._playbackRate);
    // Kick off the onDemand thread immediately
    this._onDemandDownloadTimeout = setTimeout(() => {this.onDemandDownload();}, 0);

  }

  // This function gets proxy called from requestAnimationFrame which supplies a hi-res timer
  // as the argument
  playerThread(domtime)
  {
    /// This is the notional scheduled diagnostic interval
    var schedDiagInterval=2000.0;

    let player = (domtime) => {this.playerThread(domtime);};
    // Video player thread
    // This schedules the browser to update with the latest image and audio
    // Start the FPS monitor once we start playing
    if (this._diagTimeout == null)
    {
      const lastTime = performance.now();
      this._diagTimeout = setTimeout(() => {this.diagThread(lastTime);}, schedDiagInterval);
    }

    let increment = 0;
    if (this._lastTime)
    {
      this._motionComp.periodicRateCheck(this._lastTime);
      increment = this._motionComp.animationIncrement(domtime, this._lastTime);
    }
    else
    {
      this._lastTime = domtime;
    }
    if (increment > 0)
    {
      this._lastTime=domtime;
      // Based on how many clocks happened we may actually
      // have to update late
      for (let tempIdx = increment; tempIdx > 0; tempIdx--)
      {
        if (this._motionComp.timeToUpdate(this._animationIdx+increment))
        {
          this.displayLatest();
          if (this._audioEligible && this._audioPlayer.paused)
          {
            this._audioPlayer.play();
          }
          break;
        }
      }
      this._animationIdx = this._animationIdx + increment;
    }

    if (this._draw.canPlay())
    {
      // Ready to update the video.
      // Request browser to call player function to update an animation before the next repaint
      this._playerTimeout = window.requestAnimationFrame(player);
    }
    else
    {
      // Done playing, clear playback.
      if (this._audioEligible && this._audioPlayer.paused)
      {
        this._audioPlayer.pause();
      }
      this._motionComp.clearTimesVector();
      this._playerTimeout = null;
    }
  }

  diagThread(last)
  {
    const AUDIO_CHECK_INTERVAL = 1; // This could be tweaked if we are too CPU intensive
    var diagInterval = performance.now()-last;
    var calculatedFPS = (this._fpsDiag / diagInterval)*1000.0;
    var loadFPS = ((this._fpsLoadDiag / diagInterval)*1000.0);
    var targetFPS = this._motionComp.targetFPS;
    let fps_msg = `(ID:${this._videoObject.id}) FPS = ${calculatedFPS}, Load FPS = ${loadFPS}, Score=${this._fpsScore}, targetFPS=${targetFPS}`;
    this._audioCheck++;
    if (this._audioPlayer && this._audioCheck % AUDIO_CHECK_INTERVAL == 0)
    {
      // Audio can be corrected by up to a +/- 1% to arrive at audio/visual sync
      const audioDelta = (this.frameToAudioTime(this._dispFrame)-this._audioPlayer.currentTime) * 1000;
      const correction = 1.0 + (audioDelta/2000);
      const swag = Math.max(0.99,Math.min(1.01,correction));
      this._audioPlayer.playbackRate = (swag) * this._playbackRate;

      fps_msg = fps_msg + `, Audio drift = ${audioDelta}ms`;
      if (Math.abs(audioDelta) >= 100)
      {
        console.info("Readjusting audio time");
        const audio_increment = 1+this._motionComp.frameIncrement(this._fps,this._playbackRate);
        this._audioPlayer.currentTime = this.frameToAudioTime(this._dispFrame+audio_increment);
      }
    }
    console.info(fps_msg);
    this._fpsDiag=0;
    this._fpsLoadDiag=0;

    //if ((this._networkUpdate % 3) == 0 && this._diagnosticMode == true)
    //{
    //  Utilities.sendNotification(fps_msg);
    //}
    this._networkUpdate += 1;

    if (this._fpsScore)
    {
      var healthyFPS = targetFPS * 0.90;
      if (calculatedFPS < healthyFPS)
      {
        this._fpsScore--;
      }
      else
      {
        this._fpsScore = Math.min(this._fpsScore + 1,7);
      }

      if (this._fpsScore == 0)
      {
        if (this._allowSafeMode) {
          console.warn(`(ID:${this._videoObject.id}) Detected slow performance, entering safe mode.`);

          this.dispatchEvent(new Event("safeMode"));
          this._motionComp.safeMode();
          this.rateChange(this._playbackRate);
        }
      }
    }

    this.updateVideoDiagnosticOverlay(
      null, this._dispFrame, targetFPS.toFixed(2), calculatedFPS.toFixed(2),
      this._videoObject.media_files["streaming"][this._play_idx].resolution[0],
      this._videoObject.media_files["streaming"][this._scrub_idx].resolution[0],
      this._videoObject.media_files["streaming"][this._seek_idx].resolution[0],
      this._videoObject.id);

    last = performance.now();
    if (this._direction!=Direction.STOPPED)
    {
      this._diagTimeout = setTimeout(() => {this.diagThread(last);}, 2000.0);
    }
  }

  loaderThread(initialize, bufferName)
  {
    let fpsInterval = 1000.0 / (this._fps);
    var bufferWaitTime=fpsInterval*4;
    if (bufferName == undefined)
    {
      bufferName = "seek";
    }
    let loader = () => {this.loaderThread(false, bufferName)};
    // Loader thread that seeks to the current frame and continually kicks off seeking
    // to the next frame.
    //
    // If the draw buffer is full try again in the load interval
    if (this._draw.canLoad() == false)
    {
      this._loaderTimeout = setTimeout(loader, bufferWaitTime);
      return;
    }

    if (initialize)
    {
      this._loadFrame = this._dispFrame;
    }

    let frameIncrement = this._motionComp.frameIncrement(this._fps, this._playbackRate);
    var nextFrame = this._loadFrame + (this._direction * frameIncrement);

    // Callback function that pushes the given frame/image to the drawGL buffer
    // and then schedules the next frame to be loaded
    var pushAndGoToNextFrame=function(frameIdx, source, width, height)
    {
      if (source == null)
      {
        // Video isn't ready yet, wait and try again
        console.log(`video buffer not ready for loading - (ID:${this._videoObject.id}) frame: ` + frameIdx);
        this._loaderTimeout = setTimeout(loader, 250);
      }
      else
      {
        // Normal playback
        this._fpsLoadDiag++;
        this.pushFrame(frameIdx, source, width, height);
        this._playing = true;

        // If the next frame is loadable and we didn't get paused set a timer, else exit
        if (nextFrame >= 0 && nextFrame < this._numFrames && this._direction != Direction.STOPPED)
        {
          this._loadFrame = nextFrame;
          this._loaderTimeout = setTimeout(loader, 0);
        }
        else
        {
          this._loaderTimeout = null;
        }
      }
    }

    // Seek to the current frame and call our atomic callback
    this.seekFrame(this._loadFrame, pushAndGoToNextFrame, false, bufferName);

    // Kick off the player thread
    if (this._playerTimeout == null && this._draw.canPlay())
    {
      this._playerTimeout = setTimeout(()=>{this.playerThread();}, bufferWaitTime);
    }
  }

  onDemandDownloadPrefetch(reset)
  {
    // Only prefetch if the frame is different or if there's an explicit reset.
    if (this._onDemandInitStartFrame == this.currentFrame() && reset != true) {
      return;
    }

    // Don't use on-demand downloading for legacy videos.
    if (this.isInCompatibilityMode() == true)
    {
      return;
    }

    if (this._onDemandDownloadTimeout)
    {
      clearTimeout(this._onDemandDownloadTimeout);
      this._onDemandDownloadTimeout=null;
      this._dlWorker.postMessage({"type": "onDemandShutdown"});
    }
    // Prefetch ondemand download data so it's ready to go.
    this._onDemandInit = false;
    this._onDemandInitSent = false;
    this._onDemandPlaybackReady = false;
    this._onDemandFinished = false;
    var that = this;
    this._videoElement[this._play_idx].resetOnDemandBuffer().then(() => {
      that.onDemandDownload(true);
    });
  }
  onDemandDownload(inhibited)
  {
    if (this._disableAutoDownloads) {
      return;
    }

    if (inhibited == undefined)
    {
      inhibited = false;
    }
    const video = this._videoElement[this._play_idx];
    const ranges = video.playBuffer().buffered;
    let currentFrame = this._dispFrame;
    var downloadDirection;
    if (this._direction == Direction.FORWARD || inhibited)
    {
      downloadDirection = "forward";
    }
    else
    {
      downloadDirection = "backward";
    }

    if (!this._onDemandInit)
    {
      if (!this._onDemandInitSent)
      {
        // Have not initialized yet.
        // Send out the onDemandInit only if the buffer is clear. Otherwise, reset the
        // underlying source buffer.
        if (ranges.length == 0 && !video.isOnDemandBufferBusy())
        {
          this._onDemandPendingDownloads = 0;
          this._onDemandInitSent = true;

          // Note: These are here because it's possible that currentFrame gets out of sync.
          //       Perhaps this is more of a #TODO, but this is some defensive programming
          //       to keep things in line.
          this._onDemandInitStartFrame = this._dispFrame;
          currentFrame = this._dispFrame;

          this._onDemandId += 1;

          this._dlWorker.postMessage(
            {
              "type": "onDemandInit",
              "frame": this._dispFrame,
              "fps": this._fps,
              "maxFrame": this._numFrames - 1,
              "direction": downloadDirection,
              "mediaFileIndex": this._play_idx,
              "id": this._onDemandId
            }
          );
        }
      }
    }
    else
    {
      // Stop if we've reached the end
      if (this._direction == Direction.FORWARD)
      {
        // #TODO This needs to be relooked at
        if ((this._numFrames - 2) == this._dispFrame)
        {
          return;
        }
      }
      else if (this._direction == Direction.BACKWARDS)
      {
        if (this._dispFrame == 0)
        {
          return;
        }
      }

      // Look at how much time is stored in the buffer and where we currently are.
      // If we are within X seconds of the end of the buffer, drop the frames before
      // the current one and start downloading again.
      //console.log(`Pending onDemand downloads: ${this._onDemandPendingDownloads} ranges.length: ${ranges.length}`);

      var needMoreData = false;
      if (ranges.length == 0 && this._onDemandPendingDownloads < 1)
      {
        // No data in the buffer, big surprise - need more data.
        needMoreData = true;
      }
      else
      {
        const currentTime = this.frameToTime(this._dispFrame);
        const appendThreshold = 15; // Worth revisiting to make this configurable

        // Adjust the playback threshold if we're close to the edge of the video
        var playbackReadyThreshold = 10; // Seconds
        const totalVideoTime = this.frameToTime(this._numFrames);
        if (this._direction == Direction.FORWARD &&
          (totalVideoTime - currentTime < playbackReadyThreshold))
        {
          playbackReadyThreshold = 0;
        }
        else if (this._direction == Direction.BACKWARDS &&
            (currentTime < playbackReadyThreshold))
        {
          playbackReadyThreshold = 0;
        }

        var foundMatchingRange = false;
        for (var rangeIdx = 0; rangeIdx < ranges.length; rangeIdx++)
        {
          var end = ranges.end(rangeIdx);
          var start = ranges.start(rangeIdx);

          if (this._direction == Direction.FORWARD || this._direction == Direction.STOPPED)
          {
            var timeToEnd = end - currentTime;
          }
          else
          {
            var timeToEnd = currentTime - start;
          }

          if (currentTime <= end && currentTime >= start)
          {
            foundMatchingRange = true;
            if (timeToEnd > playbackReadyThreshold)
            {
              //#TODO This block can probably be removed since this was here to support sync'ing
              //      when hitting play
              if (this._waitPlayback)
              {
                if (!this._sentPlaybackReady)
                {
                  if (video.playBuffer().readyState > 0 && this.videoBuffer(this.currentFrame(), "play") != null)
                  {
                    console.log(`(ID:${this._videoObject.id}) playbackReady (start/end/current/timeToEnd): ${start} ${end} ${currentTime} ${timeToEnd}`)
                    this._sentPlaybackReady = true;
                    this.dispatchEvent(new CustomEvent(
                      "playbackReady",
                      {
                        composed: true,
                        detail: {playbackReadyId: this._waitId},
                      }));
                  }
                }
              }
              else
              {
                // Enough data to start playback
                if (!this._onDemandPlaybackReady)
                {
                  console.log(`(ID:${this._videoObject.id}) onDemandPlaybackReady (start/end/current/timeToEnd): ${start} ${end} ${currentTime} ${timeToEnd}`);
                  this._onDemandPlaybackReady = true;
                  this.dispatchEvent(new CustomEvent(
                    "playbackReady",
                    {
                      composed: true,
                      detail: {playbackReadyId: this._waitId},
                    }));
                }
              }
            }

            if (timeToEnd < appendThreshold && this._onDemandPendingDownloads < 1)
            {
              // Need to download more video playback data
              // Since we are requesting more data, trim the buffer
              needMoreData = true;

              if (this._direction == Direction.FORWARD || this._direction == Direction.STOPPED)
              {
                var trimEnd = currentTime - 2;
                if (trimEnd > start && this._playing)
                {
                  console.log(`(ID:${this._videoObject.id}) ...Removing seconds ${start} to ${trimEnd} in sourceBuffer`);
                  video.deletePendingOnDemand([start, trimEnd]);
                }
              }
              else
              {
                var trimEnd = currentTime + 2;
                if (trimEnd < end && this._playing)
                {
                  console.log(`(ID:${this._videoObject.id}) ...Removing seconds ${trimEnd} to ${end} in sourceBuffer`);
                  video.deletePendingOnDemand([trimEnd, end]);
                }
              }
            }
          }
          else
          {
            //console.warn("Video playback buffer range not overlapping currentTime");
          }

          //console.log(`(start/end/current/timeToEnd): ${start} ${end} ${currentTime} ${timeToEnd}`)
        }
        if (!foundMatchingRange && this._onDemandPendingDownloads < 1 && !this._onDemandPlaybackReady)
        {
          if (this._onDemandInitStartFrame != this._dispFrame)
          {
            // If for some reason the onDemand was initialized incorrectly, reinitialize
            // #TODO Worth looking at in the future to figure out how to prevent this scenario.
            console.log(`(ID:${this._videoObject.id}) onDemand was initialized with frame ${this._onDemandInitStartFrame} - reinitializing with ${this._dispFrame}`);
            this._onDemandInitSent = false;
            this._onDemandInit = false;
            this._onDemandPlaybackReady = false;
          }
          else
          {
            // Request more data, we received a block of data but it's likely on the boundary.
            console.log(`(ID:${this._videoObject.id}) playback not ready -- downloading additional data`);
            needMoreData = true;
          }
        }
      }

      if (needMoreData && !this._onDemandFinished)// && !(this._direction == Direction.STOPPED && this._onDemandPlaybackReady))
      {
        // Kick of the download worker to get the next onDemand segments
        console.log(`(ID:${this._videoObject.id}) Requesting more onDemand data: ${this._onDemandPendingDownloads} ${this._onDemandPlaybackReady}`);
        this._onDemandPendingDownloads += 1;
        this._dlWorker.postMessage({"type": "onDemandDownload"});
      }

      // Clear out unecessary parts of the video if there are pending deletes
      video.cleanOnDemandBuffer();

      // Kick off the loader thread once we have buffered enough data (do this just once)
      if (this._onDemandPlaybackReady && !this._loaderStarted && !inhibited)
      {
        console.log(`(ID:${this._videoObject.id}) Launching playback loader`);
        this._loaderStarted = true;
        this._loaderTimeout = setTimeout(() => {this.loaderThread(true, "play")}, 0);
      }
    }

    // Sleep for a period before checking the onDemand buffer again
    if (!this._onDemandPlaybackReady)
    {
      this._onDemandDownloadTimeout = setTimeout(() => {this.onDemandDownload(inhibited)}, 50);
    }
    else
    {
      if (!this._onDemandFinished && !inhibited)
      {
        this._onDemandDownloadTimeout = setTimeout(() => {this.onDemandDownload()}, 50);
      }
    }
  }

  // Return whether the video is paused/stopped
  isPaused()
  {
    return this._direction == Direction.STOPPED;
  }

  addPlayListener(cb)
  {
    this._playCb.push(cb);
  }

  addPauseListener(cb)
  {
    this._pauseCb.push(cb);
  }

  /**
   * @param {boolean} waitStatus - True if playback should wait until this is set to false.
   *                               False, playback immediately
   * @param {integer} waitId - Unique ID associated with this wait used for synchronization purposes
   */
  waitPlayback(waitStatus, waitId)
  {
    this._waitPlayback = waitStatus;
    this._waitId = waitId;
    console.log(`waitPlayback (status/ID) ${waitStatus} ${waitId}`)
  }

  /**
   * @param {float} rate - Playback rate
   * @param {integer} frame - Frame number to start playing at
   * @returns {boolean} True if video can play with the given parameters. False otherwise.
   */
  canPlayRate(rate, frame)
  {
    // If the rate is 1.0 or less, we will use the onDemand buffer so we're good to go.
    if (rate <= 4.0)
    {
      return true;
    }

    // Rate is higher than 1.0, we need to check if we've buffered enough data in
    // the scrub buffer.
    const video = this.videoBuffer(frame, "scrub");
    return video != null;
  }

  play()
  {
    if (this._dispFrame >= (this._numFrames - 2))
    {
      return false;
    }
    else
    {
      this._playCb.forEach(cb => {cb();});
      if (this._playbackRate > 4.0)
      {
        this._playGenericScrub(Direction.FORWARD);
      }
      else
      {
        if (this._play_idx == this._scrub_idx && this.videoBuffer(this.currentFrame(), "scrub") != null)
        {
          this._playGenericScrub(Direction.FORWARD);
        }
        else
        {
          this._playGenericOnDemand(Direction.FORWARD);
        }
      }
      return true;
    }
  }

  playBackwards()
  {
    if (this._dispFrame <= 0)
    {
      return false;
    }
    else
    {
      this._playCb.forEach(cb => {cb();});
      if (this._playbackRate > 4.0)
      {
        this._playGenericScrub(Direction.BACKWARDS);
      }
      else
      {
        if (this._play_idx == this._scrub_idx && this.videoBuffer(this.currentFrame(), "scrub") != null)
        {
          this._playGenericScrub(Direction.BACKWARDS);
        }
        else
        {
          this._playGenericOnDemand(Direction.BACKWARDS);
        }
      }
      return true;
    }
  }

  /**
   * Stops the threads that are kicked off when playing
   * Seek frame and scrub buffer downloading will resume.
   */
  stopPlayerThread()
  {
    if (this._audioPlayer)
    {
      this._audioPlayer.pause();
    }
    if (this._playerTimeout)
    {
      clearTimeout(this._playerTimeout);
      cancelAnimationFrame(this._playerTimeout)
      this._playerTimeout=null;
    }
    if (this._loaderTimeout)
    {
      clearTimeout(this._loaderTimeout);
      this._loaderTimeout=null;
    }
    if (this._diagTimeout)
    {
      clearTimeout(this._diagTimeout);
      this._diagTimeout=null;
    }
    if (this._onDemandDownloadTimeout)
    {
      clearTimeout(this._onDemandDownloadTimeout);
      this._onDemandDownloadTimeout=null;
      this._dlWorker.postMessage({"type": "onDemandShutdown"});
    }
  }

  /**
   * This will stop all the player threads and set the video player to paused
   * A redraw of the currently displayed frame will occur using the highest quality source
   */
  pause()
  {
    // Stoping the player thread sets the direction to stop
    const currentDirection = this._direction;

    // Stop the player thread first
    this.stopPlayerThread();

    // If we weren't already paused send the event
    if (currentDirection != Direction.STOPPED)
    {
      this._pauseCb.forEach(cb => {cb();});

      this._direction=Direction.STOPPED;
      this._videoElement[this._play_idx].pause();

      // force a redraw at the currently displayed frame
      var finalPromise = new Promise((resolve, reject) => {
        var seekPromise = this.seekFrame(this._dispFrame, this.drawFrame, true);
        seekPromise.then(() => {
          resolve();
        }).catch(() => {
          resolve();
        });
      });
      return finalPromise;
    }
  }

  /**
   * Move a single frame backward, forcing a fetch from the highest quality source
   */
  back()
  {
    var newFrame=this._dispFrame-1;
    if (newFrame >= 0)
    {
      this.gotoFrame(newFrame, true);
    }
  }

  /**
   * Move a single frame forward, forcing a fetch from the highest quality source
   */
  advance()
  {
    var newFrame=this._dispFrame+1;
    if (newFrame < this._numFrames)
    {
      this.gotoFrame(newFrame, true);
    }
  }

  //////////////////////////////////
  /// End button handlers
  //////////////////////////////////
};

customElements.define("video-canvas", VideoCanvas);
