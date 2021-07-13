/// TODO: Make a base class to collapse common functionality of this
/// and annotation-player (e.g. zoom)
class AnnotationImage extends TatorElement {
  constructor() {
    super();

    const imageDiv = document.createElement("div");
    imageDiv.setAttribute("class", "annotation__video-player d-flex flex-column rounded-bottom-2");
    this._shadow.appendChild(imageDiv);

    this._image = document.createElement("image-canvas");
    imageDiv.appendChild(this._image);
  }

  set permission(val) {
    this._image.permission = val;
  }

  addDomParent(val)
  {
    this._image.domParents.push(val);
  }

  set undoBuffer(val) {
    this._image.undoBuffer = val;
  }

  set mediaInfo(val) {
    this._image.mediaType = this.mediaType;
    this._image.mediaInfo = val;
  }

  set annotationData(val) {
    this._image.annotationData = val;
  }

  newMetadataItem(dtype, metaMode, objId) {
    this._image.style.cursor = "crosshair";
    this._image.newMetadataItem(dtype, metaMode, objId);
  }

  submitMetadata(data) {
    this._image.submitMetadata(data);
    this._image.refresh();
  }

  updateType(objDescription) {
    this._image.updateType(objDescription);
  }

  refresh() {
    this._image.refresh();
  }

  defaultMode() {
    this._image.defaultMode();
    this._image.style.cursor = "default";
  }

  zoomPlus() {
    let [x, y, width, height] = this._image._roi;
    width /= 2.0;
    height /= 2.0;
    x += width / 2.0;
    y += height / 2.0;
    this._image.setRoi(x, y, width, height);
    this._image._dirty = true;
    this._image.refresh();
  }

  zoomMinus() {
    let [x, y, width, height] = this._image._roi;
    width *= 2.0;
    height *= 2.0;
    x -= width / 4.0;
    y -= height / 4.0;
    width = Math.min(width, this._image._dims[0]);
    height = Math.min(height, this._image._dims[1]);
    x = Math.max(x, 0);
    y = Math.max(y, 0);
    this._image.setRoi(x, y, width, height);
    this._image._dirty = true;
    this._image.refresh();
  }

  zoomIn() {
    this._image.style.cursor="zoom-in";
    this._image.zoomIn();
  }

  zoomOut() {
    this._image.zoomOut();
  }

  pan() {
    this._image.style.cursor="move";
    this._image.pan();
  }

  selectNone() {
    this._image.selectNone();
  }

  selectLocalization(loc, skipAnimation, muteOthers, skipGoToFrame) {
    this._image.selectLocalization(loc, skipAnimation, muteOthers, skipGoToFrame);
  }

  selectTrack(track, frameHint, skipGoToFrame) {
    this._image.selectTrack(track, undefined, false)
  }

  addCreateTrackType(stateTypeObj) {
    this._image.addCreateTrackType(stateTypeObj);
  }

  toggleBoxFills(fill) {
    this._image.toggleBoxFills(fill);
  }

  toggleTextOverlays(on) {
    this._image.toggleTextOverlays(on);
  }
}

customElements.define("annotation-image", AnnotationImage);
