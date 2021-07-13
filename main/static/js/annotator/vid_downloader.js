importScripts("/static/js/util/fetch-retry.js");

class VideoDownloader
{
  constructor(media_files, blockSize, offsite_config)
  {
    this._media_files = media_files;
    this._blockSize = blockSize;
    this._offsite_config = offsite_config;
    this._headers = {};
    if (this._offsite_config && this._offsite_config.method)
    {
      const auth_str = `${this._offsite_config.method} ${this._offsite_config.value}`;
      this._headers["Authorization"] = auth_str;
    }
    this._num_res = media_files.length;
    this._currentPacket = [];
    this._numPackets = [];
    this._fileInfoSent = [];
    this._readyMessages = [];
    this._readyMessagesSent = false;
    this._info = [];
    this._fileInfoRequested = false;
    this._infoObjectsInitialized = 0;
    for (var idx = 0; idx < this._num_res; idx++)
    {
      this._currentPacket[idx] = 0;
      this._numPackets[idx] = 0;
      this._fileInfoSent[idx] = false;
    }

    // In addition, the downloader can also handle on demand downloading for a media file
    this._onDemandConfig = null;

    // These buffers will store the download requests that occur while the downloader
    // is in onDemand mode
    this._bufferedSegmentDownloads = [];
    this._bufferedSeeks = null;

    // Used with the initial download to get the initial set of frames quicker to the player
    // (assuming that blockSize is large than this)
    this._startUpBlockSize = 1024 * 1024

    this.initializeInfoObjects();
  }

  specificBufferInitialized(buf_idx)
  {
    return this._fileInfoSent[buf_idx];
  }

  buffersInitialized()
  {
    // Processed all the segment files yet?
    if (this._infoObjectsInitialized < this._num_res)
    {
      return false;
    }

    // Sent over the file info messages?
    for (const fileInfoSent of this._fileInfoSent)
    {
      if (!fileInfoSent)
      {
        return false;
      }
    }
    return true;
  }

  sendReadyMessages()
  {
    if (this.buffersInitialized())
    {
      if (!this._readyMessagesSent)
      {
        this._readyMessagesSent = true;
        for (const msg of this._readyMessages)
        {
          postMessage(msg);
        }
      }
    }
  }

  initializeInfoObjects()
  {
    let init_promises = [];
    for (let buf_idx = 0; buf_idx < this._media_files.length; buf_idx++)
    {
      let info_url = this._media_files[buf_idx].segment_info;
      const info = new Request(info_url, {headers:this._headers});
      init_promises.push(fetch(info));
    }
    Promise.all(init_promises).then((responses) => {
      for (let buf_idx = 0; buf_idx < responses.length; buf_idx++)
      {
        this.processInitResponses(buf_idx,responses[buf_idx]);
      }
    });
  }

  processInitResponses(buf_idx,info)
  {
    var that = this;
    if (info.status == 200)
    {
      info.json().then(data => {
        that._info[buf_idx] = data
        that._numPackets[buf_idx]=data["segments"].length

        //console.log("Fetched media file info (" + buf_idx + ") Number of segments: " + that._numPackets[buf_idx]);

        var version = 1;
        try
        {
          version = data["file"]["version"];
        }
        catch(error)
        {

        }
        var startBias = 0.0;
        if ('file' in data)
        {
          startBias = data.file.start;
        }

        that._readyMessages.push(
          {
            "type": "ready",
            "startBias": startBias,
            "version": version,
            "buf_idx": buf_idx
          });

        that._infoObjectsInitialized += 1;
        if (that._infoObjectsInitialized == that._num_res)
        {
          that._fileInfoRequested = true;
          for (let buf_idx = 0; buf_idx < that._media_files.length; buf_idx++)
          {
            // Download the initial fragment info into each buffer
            that.downloadNextSegment(buf_idx, 2);
          }
        }

      });
    }
    else
    {
      postMessage({"type": "error", "status": info.status});
      console.warn(`Couldn't fetch '${info.url}'`);
    }
  }

  /**
   * Initializes the onDemand downlaoding feature.
   * This also resets the internal on-demand downloading.
   *
   * @param {string} direction - 'forward'|'backward'
   * @param {integer} frame - Target frame number to include in the next packet
   * @param {integer} mediaFileIndex - Index of media file list from constructor to use
   * @param {float} fps
   * @param {integer} maxFrame - Last valid frame number
   */
  setupOnDemandDownload(direction, frame, mediaFileIndex, fps, maxFrame, id)
  {
    this._onDemandConfig = {};
    this._onDemandConfig["direction"] = direction;
    this._onDemandConfig["frame"] = frame;
    this._onDemandConfig["mediaFileIndex"] = mediaFileIndex;
    this._onDemandConfig["currentPacket"] = 0;
    this._onDemandConfig["numPacketsDownloaded"] = 0;
    this._onDemandConfig["init"] = false;
    this._onDemandConfig["lastStartByte"] = -1;
    this._onDemandConfig["fps"] = fps;
    this._onDemandConfig["maxFrame"] = maxFrame;
    this._onDemandConfig["id"] = id;

    console.log(`setupOnDemandDownload (direction/frame/fileIndex/fps/maxFrame/ID): ${direction} ${frame} ${mediaFileIndex} ${fps} ${maxFrame} ${id}`);

    postMessage({"type": "onDemandInit", "id": id});
  }

  /**
   * @returns {boolean} True if in onDemand mode. False otherwise.
   */
  inOnDemandMode()
  {
    return this._onDemandConfig != null;
  }

  /**
   * Save the download next segment request
   * @param {integer} buf_idx - Index of media file list (ie mediaFileIndex)
   */
  saveDownloadNextSegmentRequest(buf_idx)
  {
    this._bufferedSegmentDownloads.push(buf_idx);
  }

  /**
   * Save the download seek request.
   * This will only save a single seek request
   *
   * @param {integer} buf_idx - Index of media file list (ie mediaFileIndex)
   * @param {integer} frame - Frame to seek to
   * @param {float} time - Seek target time in seconds
   */
  saveSeekRequest(buf_idx, frame, time)
  {
    this._bufferedSeek = {"buf_idx": buf_idx, "frame": frame, "time": time};
  }

  /**
   * Shutdown the onDemand downloading.
   * Restart requested downloads (seek first, then segments)
   * Allow downloads to go through.
   */
  shutdownOnDemandDownload()
  {
    this._onDemandConfig = null;

    if (this._bufferedSeek != null)
    {
      this.downloadForFrame(
          this._bufferedSeek["buf_idx"],
          this._bufferedSeek["frame"],
          this._bufferedSeek["time"])
    }

    while (this._bufferedSegmentDownloads.length > 0)
    {
      var buf_idx = this._bufferedSegmentDownloads.shift();
      this.downloadNextSegment(buf_idx);
    }
  }

  /**
   * Returns the segment index for the given media/frame. This is used to get
   * the appropriate packet to download corresponding with the frame. Use this
   * when jumping around the video / going backwards to decode properly.
   *
   * @param {integer} frame - Target frame to search for
   * @param {integer} buf_idx - Index of media file list (ie mediaFileIndex elsewhere)
   * @returns {object} matchIdx, boundary, lastPacket
   *   - matchIdx: Returns with -1 if no segment match is found
   *   - boundary: True if the frame is within 5 frames of the edge of the segment
   */
  getSegmentIndex(frame, buf_idx)
  {
    var matchIdx = -1;
    var boundary = false;

    // Check version of media. If it doesn't match
    var version = 1;
    try
    {
      version = this._info[buf_idx]["file"]["version"];
    }
    catch(error)
    {

    }
    if (version < 2 || version == undefined)
    {
      console.warn("Old version of segment file doesn't support seek operation");
      return {matchIdx, boundary};
    }

    var lastPacket = 0;
    var lastFrame = 0;
    for (var idx = 0; idx < this._numPackets[buf_idx]; idx++)
    {
      if (this._info[buf_idx]["segments"][idx]["name"] == "moof")
      {
        var frame_start = parseInt(this._info[buf_idx]["segments"][idx]["frame_start"]);
        var frame_samples = parseInt(this._info[buf_idx]["segments"][idx]["frame_samples"]);
        lastPacket = idx;
        var frame_end = frame_start + frame_samples;

        if (lastFrame < frame_end)
        {
          lastFrame = frame_end;
        }

        if (frame >= frame_start && frame < frame_end)
        {
          matchIdx = idx;
          if (frame - frame_start > frame_samples - 5)
          {
            boundary = true;
          }
          break;
        }
        else if (idx == 2 && frame < frame_start)
        {
          // Handle beginning of videos
          matchIdx = idx;
        }
      }
    }

    return {matchIdx, boundary, lastPacket, lastFrame};
  }

  /**
   * Downloads the next block of video using the initialized blockSize
   * setupOnDemandDownload must have been called prior to running this function.
   */
  downloadNextOnDemandBlock()
  {
    var currentSize = 0;
    var packetIndex = this._onDemandConfig["currentPacket"];
    var mediaFileIndex = this._onDemandConfig["mediaFileIndex"];
    var offsets = [];  // Stores the segments (aka packets)
    var startByte;
    var iterBlockSize = this._blockSize;
    var initialDownload = false;
    var initalPacketIndex = 0;

    if (!this._onDemandConfig["init"])
    {
      // Set the current packet based on the play start frame plus some wiggle room
      this._onDemandConfig["init"] = true;
      var frameToStart;
      var startBuffer = Math.floor(this._onDemandConfig["fps"] * 3);
      if (this._onDemandConfig["direction"] == "forward")
      {
        frameToStart = this._onDemandConfig["frame"] - startBuffer;
        if (frameToStart < 0)
        {
          frameToStart = 0;
        }
      }
      else
      {
        frameToStart = this._onDemandConfig["frame"] + startBuffer;
        if (frameToStart > this._onDemandConfig["maxFrame"])
        {
          frameToStart = this._onDemandConfig["maxFrame"];
        }
      }
      var segmentResult = this.getSegmentIndex(frameToStart, mediaFileIndex);
      var segmentResult2 = this.getSegmentIndex(this._onDemandConfig["frame"], mediaFileIndex);

      var matchIdx = segmentResult.matchIdx;
      if (this._onDemandConfig["direction"] == "backward")
      {
        if (frameToStart > segmentResult.lastFrame)
        {
          matchIdx = segmentResult.lastPacket;
        }
        else
        {
          matchIdx += 1;
        }
      }
      if (matchIdx == -1)
      {
        console.warn(`Couldn't fetch onDemand video for (${this._onDemandConfig["frame"]})`)
        return;
      }
      packetIndex = matchIdx;
      var initalPacketIndex = segmentResult2.matchIdx;
      initialDownload = true;
    }

    // Establish the size of downloads
    // First set of segments will be downloaded more quickly (smaller chunks)
    //if (this._onDemandConfig["numPacketsDownloaded"] < Infinity)
    //{
    //  iterBlockSize = this._startUpBlockSize * 2;
    //}

    // Determine the startByte for this block of data to download
    // Download range based on the block size and the direction
    if (this._onDemandConfig["direction"] == "forward")
    {
      if (packetIndex >= this._numPackets[mediaFileIndex])
      {
        //console.log("onDemand playback (forward) reached end of video.");
        postMessage({"type": "onDemandFinished"});
        return;
      }

      startByte = parseInt(this._info[mediaFileIndex]["segments"][packetIndex]["offset"]);
      while (packetIndex < this._numPackets[mediaFileIndex])
      {
        // Ensure the target packet has been downloaded if this is the first download
        if (initialDownload) {
          if (currentSize > iterBlockSize && initalPacketIndex < packetIndex) {
            break;
          }
        }
        else {
          if (currentSize > iterBlockSize) {
            break;
          }
        }

        const packet = this._info[mediaFileIndex]["segments"][packetIndex];
        const pos = parseInt(packet["offset"]);
        const size = parseInt(packet["size"]);
        offsets.push([pos - startByte, size, packet["name"]]);
        currentSize = pos + size - startByte;
        packetIndex++;
      }
    }
    else
    {
      // Need to download segments backwards
      if (packetIndex < 2)
      {
        //console.log("onDemand playback (backward) reached the beginning of video.");
        postMessage({"type": "onDemandFinished"});
        return;
      }

      var packetData = [];
      while (packetIndex >= 2)
      {
        // Ensure the target packet has been downloaded if this is the first download
        if (initialDownload) {
          if (currentSize > iterBlockSize && initalPacketIndex > packetIndex) {
            break;
          }
        }
        else {
          if (currentSize > iterBlockSize) {
            break;
          }
        }

        const packet = this._info[mediaFileIndex]["segments"][packetIndex];
        const packetStart = parseInt(packet["offset"]);
        const packetSize = parseInt(packet["size"]);

        packetData.push({start: packetStart, size: packetSize, name: packet["name"]})
        currentSize += packetSize;
        packetIndex--;
      }

      // #TODO This can be combined with the while loop above
      if (this._info[mediaFileIndex]["segments"][packetIndex+1]["name"] != "moof")
      {
        // We didn't land on a moof packet, which will cause decoding errors.
        // Continue looking backwards until the next "moof" is reached
        while (packetIndex >= 2)
        {
          const packet = this._info[mediaFileIndex]["segments"][packetIndex];
          const packetStart = parseInt(packet["offset"]);
          const packetSize = parseInt(packet["size"]);

          packetData.push({start: packetStart, size: packetSize, name: packet["name"]})
          currentSize += packetSize;
          packetIndex--;

          if (packet["name"] == "moof")
          {
            break;
          }
        }
      }

      // Set the startByte and the offsets now that we have figured out how many segments
      // we need to download
      startByte = parseInt(this._info[mediaFileIndex]["segments"][packetIndex + 1]["offset"]);
      for (var idx = packetData.length - 1; idx >= 0; idx--)
      {
        const packet = packetData[idx];
        offsets.push([packet.start - startByte, packet.size, packet.name]);
      }

      if (this._onDemandConfig["lastStartByte"] > 0)
      {
        currentSize = this._onDemandConfig["lastStartByte"] - startByte;
      }
    }

    this._onDemandConfig["numPacketsDownloaded"] += offsets.length;

    this._onDemandConfig["currentPacket"] = packetIndex;
    this._onDemandConfig["lastStartByte"] = startByte;
    var downloadSize = currentSize - 1;
    var onDemandId = this._onDemandConfig["id"];

    //console.log(`onDemand downloading '${downloadSize}' at '${startByte}' (next segment idx - ${packetIndex}) ID: ${onDemandId}`);

    let headers = {'range':`bytes=${startByte}-${startByte+downloadSize}`,
                   ...self._headers};

    fetch(this._media_files[mediaFileIndex].path,
          {headers: headers}
         ).then(
          (response) =>
            {
              response.arrayBuffer().then(
                (buffer) =>
                {
                  var data={"type": "onDemand",
                           "buf_idx" : mediaFileIndex,
                           "offsets": offsets,
                           "buffer": buffer,
                           "id": onDemandId};
                  postMessage(data, [data.buffer]);
                });
            });
  }

  downloadForFrame(buf_idx, frame, time)
  {
    var version = 1;
    try
    {
      version = this._info[buf_idx]["file"]["version"];
    }
    catch(error)
    {

    }
    if (version < 2 || version == undefined)
    {
      console.warn("Old version of segment file doesn't support seek operation");
      return;
    }
    var matchIdx = -1;
    var boundary = false;
    for (var idx = 0; idx < this._numPackets[buf_idx]; idx++)
    {
      if (this._info[buf_idx]["segments"][idx]["name"] == "moof")
      {
        var frame_start = parseInt(this._info[buf_idx]["segments"][idx]["frame_start"]);
        var frame_samples = parseInt(this._info[buf_idx]["segments"][idx]["frame_samples"]);
        if (frame >= frame_start && frame < frame_start+frame_samples)
        {
          matchIdx = idx;
          if (frame - frame_start > frame_samples-5)
          {
            boundary = true;
          }
          break;
        }
        else if (idx == 2 && frame < frame_start)
        {
          // Handle beginning of videos
          matchIdx = idx;
        }
      }
    }

    // No match
    if (matchIdx == -1)
    {
      console.warn(`Couldn't fetch video for ${time}(${frame})`)
      return;
    }

    // Calculate which section of the file to get, default
    // is the segment (moof+mdat)
    let start = matchIdx;
    let end = matchIdx + 1;

    // If we are at a boundary get the next segment
    if (boundary == true)
    {
      end = Math.min(matchIdx + 3, this._numPackets[buf_idx]-1);
    }

    const start_packet = this._info[buf_idx]["segments"][matchIdx];
    var startByte = parseInt(start_packet["offset"]);
    var offset = 0;

    // Add up the size of any included packets
    for (let idx = matchIdx; idx <= end; idx++)
    {
      offset += this._info[buf_idx]["segments"][idx]["size"];
    }

    let headers = {'range':`bytes=${startByte}-${startByte+offset-1}`,
                   ...self._headers};
    fetchRetry(this._media_files[buf_idx].path,
          {headers: headers}
         ).then(
           function(response)
           {
             response.arrayBuffer().then(
               function(buffer)
               {
                 // Transfer the buffer to the
                 var data={"type": "seek_result",
                           "time": time,
                           "buffer": buffer,
                           "frame": frame};
                 postMessage(data, [data.buffer]);
               });
           });

  }

  // #TODO This needs to be changed. But packet_limit is currently
  //       only used for specifically grabbing the first two packets (the init info).
  //       This should be changed so that anyone can use the packet_limit.
  downloadNextSegment(buf_idx, packet_limit)
  {
    var currentSize=0;
    var idx = this._currentPacket[buf_idx];

    // Temp code one can use to force network seeking
    //if (idx > 0)
    // {
    //  console.log("Force seeking to test it out");
    //  postMessage({"type": "finished"});
    //  return;
    // }

    if (packet_limit == undefined)
    {
      packet_limit = Infinity;
    }

    if (idx >= this._numPackets[buf_idx])
    {
      //console.log("Done downloading... buf_idx: " + buf_idx);
      postMessage({"type": "finished"});
      return;
    }

    var startByte=parseInt(this._info[buf_idx]["segments"][idx]["offset"]);
    if (idx == 0)
    {
      startByte = 0;
    }

    // Use 1 Mb blocks if in the first 5 packets
    var iterBlockSize=this._blockSize;
    //if (idx < 5)
    //{
    //    iterBlockSize=1024*1024;
    //}
    var offsets=[];
    while (currentSize < iterBlockSize && idx < this._numPackets[buf_idx] && offsets.length < packet_limit)
    {
      const packet = this._info[buf_idx]["segments"][idx];
      const pos=parseInt(packet["offset"]);
      const size=parseInt(packet["size"]);
      offsets.push([pos-startByte,size, packet["name"]]);
      currentSize=pos+size-startByte;
      idx++;
    }

    var percent_complete=idx/this._numPackets[buf_idx];
    //console.log(`Downloading '${currentSize}' at '${startByte}' (packet ${this._currentPacket[buf_idx]}:${idx} of ${this._numPackets[buf_idx]} ${parseInt(percent_complete*100)}) (buffer: ${buf_idx})`);
    this._currentPacket[buf_idx] = idx;

    let headers = {'range':`bytes=${startByte}-${startByte+currentSize-1}`,
                   ...self._headers};
    var that = this;
    fetch(this._media_files[buf_idx].path,
          {headers: headers}
         ).then(
           (response) =>
           {
             response.arrayBuffer().then(
               (buffer) =>
               {
                 // Transfer the buffer to the
                 var data={"type": "buffer",
                           "buf_idx" : buf_idx,
                           "pts_start": 0,
                           "pts_end": 0,
                           "percent_complete": percent_complete,
                           "offsets": offsets,
                           "buffer": buffer,
                           "init": packet_limit == 2};
                  postMessage(data, [data.buffer]);

                 if (packet_limit == 2) {
                   that._fileInfoSent[buf_idx] = true;

                   // If the initialization of each of the files have been completed,
                   // send out the ready messages for each of the buffers.
                   that.sendReadyMessages();
                 }
               });
           });
  }
}

var ref = null;
onmessage = function(e)
{
  msg = e.data;
  var type = msg['type'];
  if (type == 'start')
  {
    if (ref == null)
    {
      ref = new VideoDownloader(msg.media_files,
                                2*1024*1024,
                                msg.offsite_config);
    }
  }
  else if (type == 'download')
  {
    if (ref.specificBufferInitialized(msg.buf_idx))
    {
        ref.downloadNextSegment(msg.buf_idx);
    }
  }
  else if (type == 'seek')
  {
      ref.downloadForFrame(msg.buf_idx, msg['frame'], msg['time']);
  }
  else if (type == 'onDemandInit')
  {
    ref.setupOnDemandDownload(msg['direction'], msg['frame'], msg['mediaFileIndex'], msg['fps'], msg['maxFrame'], msg['id']);
  }
  else if (type == 'onDemandDownload')
  {
    if (ref.inOnDemandMode())
    {
      ref.downloadNextOnDemandBlock();
    }
  }
  else if (type == 'onDemandShutdown')
  {
    ref.shutdownOnDemandDownload();
  }
}
