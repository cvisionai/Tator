
/// @file Defines a OpenGL draw context for images/videos + annotations

/// Static definiton of generic vertex shader
///
/// This vertex shader is a 2d drawing program. It accepts two inputs
/// 'vertex' and 'uvcoord'. The former is in pixel coordinates of the nominal
/// view screen. The uniforms u_ViewShift + u_ViewScale convert to vertex
/// coordinates so rasterization happens in the fragement shader.
///
/// The other input is a uvcoordinate (texture coordinate) which is
/// nominally passed through to the rasterizer. And it samples against
/// 'imageTexture' (gl.TEXTURE0). If the uvcoordinate is negative, then
/// the vertex shader actually samples against a special color palette
/// texture (colorPalette/gl.TEXTURE1). And passes along rgba to the
/// rasterization stage. This facilitates using vertices to draw
/// boxes/lines etc. using the OpenGL graphics subsystem in an efficient
/// manner by minimizing calls to `drawElements()`.

/// NOTE: When manually invoking this routine via the shell, subsequent calls
/// to draw clear the glViewport because the draw buffer is empty.

/// The drawGL class handles multiple coordinate frames. The user facing
/// coordinate frame (e.g. drawLine(), pushImage()) use the convention found
/// in HTML5 canvas or QT painter, that (0,0) is the upper left. Vertices
/// going into the shader use this convention and are flipped prior to
/// conversion to clip space (-1, 1).

const vsSource = `#version 300 es
    in vec2 vertex;

    // RGBA value of vertex
    in vec4 color;

    // Represents either the uv coord or nothing (if negative)
    in vec2 uvcoord;

    // Represents a filter <mode,arg1,arg2,arg3> to apply to texture
    // modes:
    // -  0 is NO-OP
    // -  1 is pixelization, arg1 is percentage
    // -  2 is gray-scale
    // -  3 is solid color
    // -  4 is donut, arg1 is inner radius (0 makes a solid circle)
    in vec4 filterOp;

    // These two matrices convert our pixel coordinate vertex (0,0) to
    // (imgWidth,imgHeight) to view space coordinates.

    uniform vec2 u_ViewShift;
    uniform vec2 u_ViewScale;

    // Flip y coordinate to match drawing APIs (HTML5, QT)
    uniform float u_ViewFlip;

    // This is really a 1D texture, but webgl (or webgl2)
    // only supports 2D textures, so we will just make it Nx1.
    uniform sampler2D colorPalette;

    out vec2 texcoord;
    out vec4 rgba;
    out vec4 filterOp_s;

    void main() {
      vec2 flippedVertex = vec2(vertex.x, u_ViewFlip-vertex.y);
      vec2 normalized = u_ViewScale * (flippedVertex-u_ViewShift);

      gl_Position = vec4(normalized, 0.0, 1.0);
      texcoord=uvcoord;
      rgba = color/255.0;
      filterOp_s = filterOp;
    }
`;

// Fragment shader for rendering image as a texture
const imageFsSource = `#version 300 es
    precision mediump float;
    in vec2 texcoord;
    in vec4 rgba;
    in vec4 filterOp_s;

    // Make sure pixel output is at location 0
    layout(location = 0) out vec4 pixelOutput;

    // Can make a test pattern with outputing color palette.
    uniform sampler2D imageTexture;

    // Image resolution (useful for filters)
    uniform vec2 u_Resolution;

    void main() {
         // special mode is -1, so we have plenty of room to spare
         if (texcoord.x >= -0.25)
         {
             if (filterOp_s.x == 1.0)
             {
               float mSize = max((u_Resolution.y*filterOp_s.y),(u_Resolution.x*filterOp_s.y)); //Use arg1 for blur %
               vec2 sampledCoord = (floor((texcoord*u_Resolution)/mSize)*mSize)/u_Resolution;
               pixelOutput= texture(imageTexture, sampledCoord);
             }
             else if (filterOp_s.x == 2.0)
             {
               float min=filterOp_s.y;
               float max=filterOp_s.z;
               if (max == 0.0)
               {
                 max = 1.0;
               }
               vec4 rgba = texture(imageTexture, texcoord).rgba;
               float gray_p = 0.299*rgba.r+0.587*rgba.g+0.114*rgba.b;
               gray_p = (gray_p - min) / (max-min);
               vec3 gray = vec3(gray_p);
               pixelOutput = vec4(gray,rgba.a);
             }
             else if (filterOp_s.x == 3.0)
             {
                pixelOutput = vec4(0.5,0.25,0.25,1.0);
             }
             else if (filterOp_s.x == 4.0)
             {
                vec2 unit_coords = ((2.0*texcoord) - 1.0);
                float dist = sqrt((unit_coords.x*unit_coords.x)+(unit_coords.y*unit_coords.y));
                float delta = fwidth(dist);
                float mix_perc = smoothstep(1.0-delta, 1.0, dist);
                if (dist >= filterOp_s.y)
                {
                   pixelOutput = mix(rgba, vec4(rgba.r,rgba.g,rgba.b,0), mix_perc);
                }
                else
                {
                   pixelOutput = mix(rgba, vec4(rgba.r,rgba.g,rgba.b,0), 1.0-mix_perc);
                }
             }
             else
             {
                 pixelOutput = texture(imageTexture, texcoord);
             }
         }
         else
         {
             pixelOutput = rgba;
         }
    }
`;

// Given an image width/height, compute the vertex quad in image pixel
// coordinates
// Convention: 0,0 is lower left.
function computeQuad(width, height)
{
  // We are only in 2d space, so we can save a vertex coordinate
  // We are using draw coordinates here, not openGL conventions
  var quad = new Float32Array([
    0.0, height,  // bottom left
    0.0,  0.0, //top left
    width, 0.0,  // top right
    width, height, // bottom right
  ]);
  return quad;
}

// Given two points, calculate the angle to take to get from
// start to finish around the unit circle.
function calcTheta(start, finish)
{
  var theta = 0.0;
  // Here we have a line that is angled
  if (finish[0]-start[0] != 0.0 && finish[1]-start[1] != 0.0)
  {
    var deltaY = finish[1]-start[1];
    var deltaX = finish[0]-start[0];

    var theta = Math.atan(deltaY/deltaX);
    // Margin in the X direction is the absolute value of the
    // x component of the unit triangle at the angle orthogonal
    // to the angle of the line (abs of sine of the angle)
  }
  else if (finish[1]-start[1] == 0.0)
  {
    // Here we have a flat line, but either going right or left
    if (finish[0] > start[0])
    {
      theta = 0;
    }
    else
    {
      theta = -Math.PI;
    }
  }
  else
  {
    // This line is vertical, either up or down
    if (finish[1] > start[1])
    {
      theta = Math.PI/2;
    }
    else
    {
      theta = -Math.PI/2;
    }
  }
  return theta;
}

// Image gets flipped so that (0,1) is actually lower left
const uvOfQuad = new Float32Array([
  0.0, 1.0,
  0.0, 0.0,
  1.0, 0.0,
  1.0, 1.0]);

const quadColor = new Float32Array([
  0.0,0.0,0.0,0.0,
  0.0,0.0,0.0,0.0,
  0.0,0.0,0.0,0.0,
  0.0,0.0,0.0,0.0]);

// By default don't apply any filter to quad
let quadFilter = new Float32Array([
  0.0,0.0,0.0,0.0,
  0.0,0.0,0.0,0.0,
  0.0,0.0,0.0,0.0,
  0.0,0.0,0.0,0.0]);

// Test color drawing with the coordinates like this:

/*
//[color idx , alpha ]
const uvOfQuad = new Float32Array([
color.WHITE, 1.0,
color.GREEN, 1.0,
color.BLUE, 1.0,
color.YELLOW, 1.0]);
*/

/// Quad reprentingt the whole viewport
const quadIndices = new Uint8Array([0, 1, 2, 0, 2, 3]);


// WebGL class to support drawing image frames + draw actions.
class DrawGL
{
  constructor(canvas)
  {
    // initialize member variables for good practice
    this.viewport = canvas;
    this.gl = null;
    this.imageShaderProg=null;
    this.vertexBuffer=null;
    this.lastWidth=null;
    this.lastHeight=null;
    this.uvInfo=null;
    this.lastDx=null;
    this.lastDy=null;
    this.frameBuffer=null;
    this.setViewport(canvas);
    this._roi = [0,0,1.0,1.0];

    // Print out debug information for OpenGL
    this.debugGL();
  }

  // Print out a lot of useful debug info
  debugGL()
  {
    var gl = this.gl;
    var debug_info = gl.getExtension('WEBGL_debug_renderer_info');
    var msg = "OpenGL Info: ";
    msg += "\n\tGL Vendor: " + gl.getParameter(gl.VENDOR);
    msg += "\n\tGL Version: " + gl.getParameter(gl.VERSION);
    msg += "\n\tGL Renderer: " + gl.getParameter(debug_info.UNMASKED_RENDERER_WEBGL);
    msg += "\n\tMax Texture Units: " + gl.getParameter(gl.MAX_TEXTURE_IMAGE_UNITS);
    console.info(msg);
  }


  initShader(type, source) {
    const shader = this.gl.createShader(type);
    this.gl.shaderSource(shader, source);
    this.gl.compileShader(shader);

    // See if it compiled successfully
    if (!this.gl.getShaderParameter(shader, this.gl.COMPILE_STATUS)) {
      alert('An error occurred compiling the shaders: ' + this.gl.getShaderInfoLog(shader));
      this.gl.deleteShader(shader);
      return null;
    }

    return shader;
  };

  setViewport(canvas)
  {
    // Turn off default antialias as we control it ourselves
    var gl = this.viewport.getContext("webgl2", {antialias: false,
                                                 depth: false
                                                });
    this.gl=gl;
    if (gl == null)
    {
      window.alert("Unable to initialize rendering resources.");
      // @todo put in link to supported browser page
      return;
    }

    const vsShader = this.initShader(gl.VERTEX_SHADER, vsSource);
    const fsShader = this.initShader(gl.FRAGMENT_SHADER, imageFsSource);
    this.imageShaderProg=gl.createProgram();

    // Attach and link
    gl.attachShader(this.imageShaderProg, vsShader);
    gl.attachShader(this.imageShaderProg, fsShader);
    gl.linkProgram(this.imageShaderProg);


    if (!gl.getProgramParameter(this.imageShaderProg, gl.LINK_STATUS))
    {
      alert('Unable to initialize the shader program: ' +
            gl.getProgramInfoLog(this.imageShaderProg));
      return;
    }

    gl.useProgram(this.imageShaderProg);
    // Setup the vertex buffers
    this.setupVertexBuffer();

    gl.activeTexture(gl.TEXTURE0);
    // Setup reusable texture for drawing video frames
    var initTexture=function()
    {
      var texture=gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, texture);
      // Turn off mips and set  wrapping to clamp to edge so it
      // will work regardless of the dimensions of the video.
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S,
                       gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T,
                       gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);

      return {frame: -1, dims: [], pos: [], tex: texture};
    }

    // Initialize the frame buffer in GPU memory
    // @todo parametrize this buffer size.
    // 30 fps x 4 (wait time) x 2 = 240
    this.frameBuffer = new FrameBuffer(240, initTexture);

    // Initialze the backbuffer to use for MSAA
    this.msaaBuffer = gl.createRenderbuffer();
    this.msaaFramebuffer = gl.createFramebuffer();
  };

  // Nominally 1,1 but resizes can distort
  displayToViewportScale()
  {
    return [this.clientWidth/this.viewport.clientWidth,
            this.clientHeight/this.viewport.clientHeight];
  }

  // This takes image width and image height.
  resizeViewport(width, height)
  {
    var gl=this.gl;
    try
    {
      var dpi = window.devicePixelRatio;
      console.info("Resize to " + width + ", " + height + " at DPI: " + dpi);
      this.viewport.setAttribute('height', height);
      this.viewport.setAttribute('width', width);

      // The player may have blown up the video depending on
      // UI choices. The view port should be set to physical
      // picture height/width. which includes factoring in DPI
      this.clientHeight = height;
      this.clientWidth = width;

      // Turns out you need to reset this after the browser snaps
      // and account for the Device Pixel Ratio to render properly
      this.viewport.setAttribute('height', this.clientHeight);
      this.viewport.setAttribute('width', this.clientWidth);

      gl.viewport(0,0, this.clientWidth,this.clientHeight);
    }
    catch(error)
    {
      //Support off-screen buffers too
      this.clientHeight=height;
      this.clientWidth=width;
      gl.viewport(0,0,width, height);
    }


    console.info("GL Viewport: " + this.clientWidth + "x" + this.clientHeight );

    //Allocate MSAA renderbuffer (4x multisample)
    gl.bindRenderbuffer(gl.RENDERBUFFER, this.msaaBuffer);
    gl.renderbufferStorageMultisample(gl.RENDERBUFFER, 4,
                                      gl.RGBA8, this.clientWidth, this.clientHeight);

    //Associate MSAA framebuffer COLOR0 to render buffer
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.msaaFramebuffer);
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0,
                               gl.RENDERBUFFER, this.msaaBuffer);

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    // Load the uniform for the view screen size + shift
    var viewShiftLoc = gl.getUniformLocation(this.imageShaderProg, "u_ViewShift");
    gl.uniform2fv(viewShiftLoc,[this.clientWidth/2,
                                this.clientHeight/2]);

    // The scale is in terms of actual image pixels so that inputs are in image
    // pixels not device pixels.
    var viewScale = [2/((this.clientWidth)),2/((this.clientHeight))];
    // This vector scales an image unit to a viewscale unit
    var viewScaleLoc = gl.getUniformLocation(this.imageShaderProg, "u_ViewScale");
    gl.uniform2fv(viewScaleLoc,viewScale);

    var resolution = [this.clientWidth,this.clientHeight];
    // This vector scales an image unit to a viewscale unit
    var viewScaleLoc = gl.getUniformLocation(this.imageShaderProg, "u_Resolution");
    gl.uniform2fv(viewScaleLoc,resolution);

    this.viewFlip=this.clientHeight;
    var viewFlipLoc = gl.getUniformLocation(this.imageShaderProg, "u_ViewFlip");
    gl.uniform1f(viewFlipLoc,this.viewFlip);

    // Image texture is in slot 0
    var imageTexLoc = gl.getUniformLocation(this.imageShaderProg,
                                            "imageTexture");
    gl.uniform1i(imageTexLoc, 0);
  }

  // Constructs the vertices into the viewport
  setupVertexBuffer()
  {
    const vertexAttrLoc=this.gl.getAttribLocation(this.imageShaderProg,
                                                  'vertex');
    const colorLoc=this.gl.getAttribLocation(this.imageShaderProg,
                                             'color');
    const uvAttrLoc=this.gl.getAttribLocation(this.imageShaderProg,
                                              'uvcoord');
    const filterLoc=this.gl.getAttribLocation(this.imageShaderProg,
                                              'filterOp');

    // Setup Vertex Buffer
    this.gl.enableVertexAttribArray(vertexAttrLoc);
    this.vertexBuffer = this.gl.createBuffer();
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.vertexBuffer);
    this.gl.vertexAttribPointer(vertexAttrLoc,
                                2,
                                this.gl.FLOAT,
                                false,
                                0,
                                0);

    // Setup Color buffer
    this.gl.enableVertexAttribArray(colorLoc);
    this.colorBuffer = this.gl.createBuffer();
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.colorBuffer);
    this.gl.vertexAttribPointer(colorLoc,
                                4,
                                this.gl.FLOAT,
                                false,
                                0,
                                0);


    // Setup the uv buffer
    this.gl.enableVertexAttribArray(uvAttrLoc);
    this.uvBuffer = this.gl.createBuffer();
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.uvBuffer);
    this.gl.vertexAttribPointer(uvAttrLoc,
                                2,
                                this.gl.FLOAT,
                                false,
                                0,
                                0);

    // Setup the filterOp buffer
    this.gl.enableVertexAttribArray(filterLoc);
    this.filterBuffer = this.gl.createBuffer();
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.filterBuffer);
    this.gl.vertexAttribPointer(filterLoc,
                                4,
                                this.gl.FLOAT,
                                false,
                                0,
                                0);



    this.indexBuffer = this.gl.createBuffer();
  };

  clearRect(x,y,width,height, rgb)
  {
    if (rgb == undefined)
    {
      rgb=[0,0,0];
    }
    this.gl.enable(this.gl.SCISSOR_TEST);
    this.gl.scissor(x,y,width,height);
    this.gl.clearColor(rgb[0],rgb[1],rgb[2],1.0);
    this.gl.clear(this.gl.COLOR_BUFFER_BIT);
    this.gl.disable(this.gl.SCISSOR_TEST);
  };

  // This function is called each time a frame is pushed. It is expected
  // to return either a drawBuffer (see beginDraw) or null.
  setPushCallback(cb)
  {
    this._pushCallback=cb;
  }

  clearPushCallback()
  {
    this._pushCallback=null;
  }

  // Pushes a new image to the framebuffer for future rendering. Any pending draw
  // actions are pushed as well. When a render operation occurs the image is drawn
  // first, and any drawing operations after (AKA on top of the image.)
  // Note: dWidth + dHeight are in viewscreen pixels.
  // sx, sy, sWidth, sHeight are in relative coordinates (0.0-1.0)
  pushImage(frameIdx, frameData, sx, sy, sWidth, sHeight, dx, dy, dWidth, dHeight, dirty)
  {
    // local namespacing
    var gl = this.gl;

    if (dirty == undefined)
    {
      dirty = false;
    }

    // This vector scales an image unit to a viewscale unit
    this._roi = [sx,sy,sWidth,sHeight];

    //Push the frame idx, dims, and content to the buffer.
    var frameInfo=this.frameBuffer.load();
    frameInfo.dims=[dWidth,dHeight];
    frameInfo.pos=[dx,dy];
    ////                             SW      |   NW    |   NE    |    SE
    //frameInfo.uv=new Float32Array([0.0, 1.0, 0.0, 0.0, 1.0, 0.0, 1.0, 1.0]);
    frameInfo.uv=new Float32Array([sx, (sy+sHeight),
                                   sx, (sy),
                                   (sx+sWidth), (sy),
                                   (sx+sWidth), (sy+sHeight)]);
    frameInfo.dirty=dirty;
    frameInfo.frame=frameIdx;

    if (this._pushCallback)
      frameInfo.drawBuffer=this._pushCallback(frameInfo);
    else
      frameInfo.drawBuffer=null;

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, frameInfo.tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, frameData);
  };

  reloadQuadVertices(dWidth, dHeight, uv)
  {
    var gl = this.gl;

    // Have to reload vertex buffer for quad
    const vertexAttrLoc=gl.getAttribLocation(this.imageShaderProg,
                                             'vertex');
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vertexBuffer);


    // Calculate + load Vertex
    var quad = computeQuad(dWidth, dHeight);
    gl.bufferData(gl.ARRAY_BUFFER,
                  quad,
                  gl.STATIC_DRAW);

    // Load quad colors
    gl.bindBuffer(this.gl.ARRAY_BUFFER, this.colorBuffer);
    gl.bufferData(this.gl.ARRAY_BUFFER, quadColor, gl.STATIC_DRAW);

    gl.bindBuffer(this.gl.ARRAY_BUFFER, this.filterBuffer);
    gl.bufferData(this.gl.ARRAY_BUFFER, quadFilter, gl.STATIC_DRAW);

    // Load quad texture coordinates
    gl.bindBuffer(this.gl.ARRAY_BUFFER, this.uvBuffer);
    gl.bufferData(this.gl.ARRAY_BUFFER, uv,gl.STATIC_DRAW);

    gl.bindBuffer(this.gl.ELEMENT_ARRAY_BUFFER, this.indexBuffer);
    gl.bufferData(this.gl.ELEMENT_ARRAY_BUFFER, quadIndices, gl.STATIC_DRAW);
  }

  // Updates the current image in the buffer
  // Note: dWidth + dHeight are in viewscreen pixels.
  // sx, sy, sWidth, sHeight are in relative coordinates (0.0-1.0)
  updateImage(sx, sy, sWidth, sHeight, dx, dy, dWidth, dHeight)
  {
    // local namespacing
    var gl = this.gl;

    if (this.canPlay() == false)
    {
      return;
    }

    var dirty = true;

    //Push the frame idx, dims, and content to the buffer.
    var frameInfo=this.frameBuffer.display();
    frameInfo.dims=[dWidth,dHeight];
    frameInfo.pos=[dx,dy];
    ////                             SW      |   NW    |   NE    |    SE
    //frameInfo.uv=new Float32Array([0.0, 1.0, 0.0, 0.0, 1.0, 0.0, 1.0, 1.0]);
    frameInfo.uv=new Float32Array([sx, (sy+sHeight),
                                   sx, (sy),
                                   (sx+sWidth), (sy),
                                   (sx+sWidth), (sy+sHeight)]);
    frameInfo.dirty=dirty;

    if (this._pushCallback)
      frameInfo.drawBuffer=this._pushCallback(frameInfo);
    else
      frameInfo.drawBuffer=null;
  };

  // Display the latest image in the framebuffer.
  // @param hold If true, will not call done() after display.
  //        defaults to false.
  //
  dispImage(hold, muteAnnotations)
  {
    if (hold == undefined)
    {
      hold=false;
    }
    if (muteAnnotations == undefined)
    {
      muteAnnotations=false;
    }

    // If there are no images to play, bomb out
    if (this.canPlay() == false)
    {
      return null;
    }

    var gl = this.gl;

    // Display the latest image
    var frameInfo=this.frameBuffer.display()
    gl.bindTexture(gl.TEXTURE_2D, frameInfo.tex);

    var dWidth=frameInfo.dims[0];
    var dHeight=frameInfo.dims[1];
    var dx=frameInfo.pos[0];
    var dy=frameInfo.pos[1];

    // In a video player conops the vertices nominally stay the same the
    // entire time during playback. This differs once other paint events
    // occur on the canvas or the location of the movie changes.
    //
    // In order words:
    // This logic is intended to minimize the reloading of the same
    // vertex / uv coordinates over and over again during non-anotated
    // video play.
    var needToReloadVertices=false;
    if (this.lastWidth != dWidth || this.lastHeight != dHeight || frameInfo.dirty)
    {
      needToReloadVertices=true;
      this.lastWidth=dWidth;
      this.lastHeight=dHeight;
    }

    if (needToReloadVertices)
    {
      this.reloadQuadVertices(dWidth, dHeight, frameInfo.uv);
    }

    if (this.lastDx != dx || this.lastDy != dy)
    {
      var viewShiftLoc = gl.getUniformLocation(this.imageShaderProg, "u_ViewShift");

      var cHeight = this.clientHeight;
      var cWidth = this.clientWidth;
      gl.uniform2fv(viewShiftLoc,[(cWidth/2)-dx,
                                  (cHeight/2)-dy]);
      this.lastDx = dx;
      this.lastDy = dy;

    }


    // If there are extra drawing, draw them too. unless we are muting
    // in which case skip to non-MSAA buffer of frame
    if (this.drawBuffer || (frameInfo.drawBuffer && !muteAnnotations))
    {
      gl.bindFramebuffer(gl.FRAMEBUFFER,this.msaaFramebuffer);
      gl.drawElements(this.gl.TRIANGLES, quadIndices.length, this.gl.UNSIGNED_BYTE, 0)

      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      if (frameInfo.drawBuffer && muteAnnotations == false)
      {
        this.dispDraw(frameInfo.drawBuffer);
      }
      if (this.drawBuffer)
      {
        this.dispDraw(this.drawBuffer);
      }
      gl.disable(gl.BLEND);
    }
    else
    {
      // Draw the picture w/o MSAA
      gl.bindFramebuffer(gl.FRAMEBUFFER,null);
      // Draw the full quad
      gl.drawElements(this.gl.TRIANGLES, quadIndices.length, this.gl.UNSIGNED_BYTE, 0)
    }

    if (hold == false)
    {
      this.frameBuffer.doneDisplay();
    }

    return frameInfo.frame;
  }

  // Needs to be called after 'done' with the current displayed image
  // can be ignored if 'false' is not passed into dispImage
  done()
  {
    this.frameBuffer.doneDisplay()
  }

  // Clears the framebuffer
  clear()
  {
    this.frameBuffer.reset();
  }

  // Returns true if there is room for loading frames
  canLoad()
  {
    return this.frameBuffer.availableLoad() > 0;
  }

  // Returns true if there is room for playing frames
  canPlay()
  {
    return this.frameBuffer.availableDisplay() > 0;
  }

  // Begin drawing sequence. As draw actions are performed new vertex
  // information accumulated. The accumulations are present until either
  // a 'dumpDraw' or 'dispDraw'.
  beginDraw()
  {
    this.drawBuffer = {vertices: [], colors: [], uv: [], indices:[], filter:[]};
  }

  // Returns the internal draw buffer to facilitate deferred rendering
  // of precalculated renderings.
  dumpDraw()
  {
    var oldBuffer = this.drawBuffer;
    this.drawBuffer = null;
    return oldBuffer;
  }

  drawCircle(center, radius, penColor, alpha, innerRadius)
  {
    if (this.drawBuffer == null)
    {
      this.beginDraw();
    }
    if (innerRadius == null)
    {
      innerRadius = 0.0;
    }

    let start = [center[0]-radius, center[1]];
    let finsh = [center[0]+radius, center[1]];
    let width = radius*2;
    let effect = [4.0, innerRadius];
    this.drawLine(start,finsh, penColor, width, alpha, effect);
  }

  // Draw a line at start to finish. Optionally supply pen info.
  drawLine(start, finish, penColor, width, alpha, effect)
  {
    if (this.drawBuffer == null)
    {
      this.beginDraw();
    }
    if (penColor == undefined)
    {
      penColor = color.BLUE;
    }
    if (width == undefined)
    {
      width = 3;
    }
    if (alpha == undefined)
    {
      // This is actually a scale of 0 to 255 when it works
      alpha = 255.0;
    }
    if (effect == undefined)
    {
      effect = [0];
    }

    if (effect.length != 4)
    {
      let effect_new = [];
      let idx = 0;
      for (idx = 0; idx < effect.length; idx++)
      {
        effect_new[idx] = effect[idx];
      }
      for (idx; idx < 4; idx++)
      {
        effect_new[idx] = 0;
      }
      effect = effect_new;
    }

    var idx = 0;

    // Initial # of vertices (half the count, we have 2d vertices)
    var startIdx=this.drawBuffer.vertices.length/2;

    // this is 8 floats (2 floats per vertex)
    var vertices=new Array(8);

    // Margin X is the amount to pull left or right to add thickness
    // Margin Y is the amount to pull up/down to add thickness

    // thickness is orthoganal to the direction of the line.
    var marginX=0;
    var marginY=0;
    var theta = calcTheta(start, finish);

    // If it isn't, do some trig to figure out angles


    // Orthoganal angle
    var phi = theta + Math.PI/2;

    // Length of x/y in unit triangle
    var unitX = Math.cos(phi);
    var unitY = Math.sin(phi);

    // Multiply by hypotenuse (brush width)
    var marginX = unitX * (width/2);
    var marginY = unitY * (width/2);

    // This is what we are going for:
    // We substract from 0 and 1, and add to 2 and 3.
    // 1--2   (finish)
    // | /|
    // |/ |
    // 0--3   (start)


    // The assumed texture coordinates from the vertex location are
    // relatve to the current roi; we have to convert to the global roi
    // to accurately create a fill
    let globalizeTexCoord = (coord) => {
      return [(coord[0]*this._roi[2])+this._roi[0],
              (coord[1]*this._roi[3])+this._roi[1]];
    };

    // Make sure the vertices don't go off the page.
    // Left or top
    var bgCoords =[];
    vertices[0] = Math.min(Math.max(start[0]-marginX,0),this.clientWidth);
    vertices[1] = Math.min(Math.max(start[1]-marginY,0), this.clientHeight);
    bgCoords[0] = globalizeTexCoord([vertices[0]/this.clientWidth,vertices[1]/this.clientHeight]);


    vertices[2] = Math.min(Math.max(finish[0]-marginX,0), this.clientWidth);
    vertices[3] = Math.min(Math.max(finish[1]-marginY,0), this.clientHeight);
    bgCoords[1] = globalizeTexCoord([vertices[2]/this.clientWidth,vertices[3]/this.clientHeight]);

    // Right or bottoms
    vertices[4] = Math.min(Math.max(finish[0]+marginX,0),this.clientWidth);
    vertices[5] = Math.min(Math.max(finish[1]+marginY,0), this.clientHeight);
    bgCoords[2] = globalizeTexCoord([vertices[4]/this.clientWidth,vertices[5]/this.clientHeight]);

    vertices[6] = Math.min(Math.max(start[0]+marginX,0),this.clientWidth);
    vertices[7] = Math.min(Math.max(start[1]+marginY,0), this.clientHeight);
    bgCoords[3] = globalizeTexCoord([vertices[6]/this.clientWidth,vertices[7]/this.clientHeight]);

    // Pen color is the same for each vertex pair (!)
    for (idx = 0; idx < (vertices.length/2); idx++)
    {
      // Push supplied color to the color buffer
      this.drawBuffer.colors.push(...penColor);
      this.drawBuffer.colors.push(alpha);
      if (effect[0] == 0.0)
      {
        // No texture for pen drawing
        this.drawBuffer.uv.push(...[-1.0,-1.0]);
      }
      else if (effect[0] == 4.0)
      {
        const CIRCLE_UX = [[0.0,0.0],[1.0,0.0],[1.0,1.0],[0.0,1.0]];
        this.drawBuffer.uv.push(...CIRCLE_UX[idx]);
      }
      else
      {
        // Fill effects use a texture coordinate based on line location
        this.drawBuffer.uv.push(...bgCoords[idx]);
      }

      this.drawBuffer.filter.push(...effect);
    }

    this.drawBuffer.vertices = this.drawBuffer.vertices.concat(vertices);

    for (idx = 0; idx < quadIndices.length; idx++)
    {
      this.drawBuffer.indices.push(quadIndices[idx]+startIdx);
    }
  }
  // Draw a polygon given a series of points, polygon has to have 3
  // points, else you are a line. We are 2d space projecting imagery
  // but one should still consult research on perspectives, such as
  // Flatland by Edwin Abbott.
  drawPolygon(points, penColor, width, alpha)
  {
    if (points.length < 3)
    {
      console.error("Can't draw polygon with less than 3 points");
      return;
    }
    if (width == undefined)
    {
      width = 3;
    }
    // Connect each point to the next
    var idx=0;
    var length=points.length;

    for (var idx = 0; idx < length; idx++)
    {
      // Account for margin
      var start=points[idx % length];
      var dest=points[(idx+1)%length];

      // We actually want to overshoot lines by half the margin
      var theta=calcTheta(start, dest);
      var unitX = Math.cos(theta);
      var unitY = Math.sin(theta);

      // Multiply by hypotenuse (brush width)
      var marginX = unitX * (width/2);
      var marginY = unitY * (width/2);
      dest=[dest[0]+marginX, dest[1]+marginY];

      this.drawLine(start,dest,penColor, width, alpha);
    }
  }

  fillPolygon(points, width, penColor, alpha, effect)
  {
    if (points.length < 3)
    {
      console.error("Can't draw polygon with less than 3 points");
      return;
    }

    var maxX = 0;
    var maxY = 0;
    var minY = 0xFFFFFFF;
    var minX = 0xFFFFFFF;

    for (var idx = 0; idx < points.length; idx++)
    {
      if (points[idx][0] > maxX)
      {
        maxX = points[idx][0];
      }
      if (points[idx][0] < minX)
      {
        minX = points[idx][0];
      }
      if (points[idx][1] > maxY)
      {
        maxY = points[idx][1];
      }
      if (points[idx][1] < minY)
      {
        minY = points[idx][1];
      }

      var start=[minX+(width/2), (minY+maxY)/2];
      var end =[maxX-(width/2), (minY+maxY)/2];
      var fillWidth = (maxY-minY-width);
    }
    this.drawLine(start,end,penColor, fillWidth, alpha, effect);
  }

  computeBounds(vertices)
  {
    var total=vertices.length;
    var minX = Number.POSITIVE_INFINITY;
    var minY = Number.POSITIVE_INFINITY;
    var maxX = Number.NEGATIVE_INFINITY;
    var maxY = Number.NEGATIVE_INFINITY;

    var idx = 0;
    for (idx = 0; idx < total; idx+=2)
    {
      if (vertices[idx] < minX)
      {
        minX = vertices[idx];
      }
      if (vertices[idx+1] < minY)
      {
        minY = vertices[idx+1];
      }
      if (vertices[idx] > maxX)
      {
        maxX = vertices[idx];
      }
      if (vertices[idx+1] > maxY)
      {
        maxY = vertices[idx+1];
      }
    }
    return [minX, minY, maxX-minX, maxY-minY];
  }

  /// Current elements in the draw buffer are rendered.
  /// After which they are discarded. Alternative draw buffers can be
  /// specified as an argument (optionally) else the internal static
  /// buffer is used.
  dispDraw(buffer)
  {
    var bufferToUse=this.drawBuffer;
    var gl = this.gl;
    if (buffer != undefined)
    {
      bufferToUse=buffer;
    }

    if (bufferToUse && bufferToUse.indices.length > 0)
    {
      // Going off script here (i.e. not in video mode, so clear these)
      this.lastWidth = null;
      this.lastHeight = null;

      // Bind the MSAA buffer
      gl.bindFramebuffer(gl.FRAMEBUFFER,this.msaaFramebuffer);

      /// Load up the buffers for any drawing data
      gl.bindBuffer(this.gl.ARRAY_BUFFER, this.vertexBuffer);
      gl.bufferData(this.gl.ARRAY_BUFFER,
                    new Float32Array(bufferToUse.vertices),
                    gl.STATIC_DRAW);

      gl.bindBuffer(this.gl.ARRAY_BUFFER, this.colorBuffer);
      gl.bufferData(this.gl.ARRAY_BUFFER,
                    new Float32Array(bufferToUse.colors),
                    gl.STATIC_DRAW);

      gl.bindBuffer(this.gl.ARRAY_BUFFER, this.uvBuffer);
      gl.bufferData(this.gl.ARRAY_BUFFER,
                    new Float32Array(bufferToUse.uv),
                    gl.STATIC_DRAW);

      gl.bindBuffer(this.gl.ARRAY_BUFFER, this.filterBuffer);
      gl.bufferData(this.gl.ARRAY_BUFFER,
                    new Float32Array(bufferToUse.filter),
                    gl.STATIC_DRAW);

      gl.bindBuffer(this.gl.ELEMENT_ARRAY_BUFFER, this.indexBuffer);
      gl.bufferData(this.gl.ELEMENT_ARRAY_BUFFER,
                    new Uint16Array(bufferToUse.indices),
                    gl.STATIC_DRAW);
      // Draw into the multisampled buffer
      gl.drawElements(this.gl.TRIANGLES, bufferToUse.indices.length, this.gl.UNSIGNED_SHORT, 0)

      // Blit back to the draw buffer
      gl.bindFramebuffer(gl.READ_FRAMEBUFFER,this.msaaFramebuffer);
      gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER,null);
      gl.blitFramebuffer(0,0,this.viewport.width, this.viewport.height,
                         0,0,this.viewport.width, this.viewport.height,
                         gl.COLOR_BUFFER_BIT, gl.LINEAR);
      gl.bindFramebuffer(gl.READ_FRAMEBUFFER,null);
    }
    else
    {
      console.warn("Avoiding drawing an empty draw buffer");
    }

    // If we used the static buffer clear it.
    if (this.drawBuffer == bufferToUse)
    {
      this.drawBuffer = null;
    }
  }
};
