class PlayButton extends TatorElement {
  constructor() {
    super();

    const button = document.createElement("button");
    button.setAttribute("class", "video__play-wrap d-flex flex-justify-center btn-clear circle text-white flex-items-center");
    this._shadow.appendChild(button);
    this._button = button;

    this._play = document.createElementNS(svgNamespace, "svg");
    this._play.setAttribute("id", "icon-play");
    this._play.setAttribute("class", "video__play icon-play");
    this._play.setAttribute("viewBox", "0 0 32 32");
    this._play.setAttribute("height", "1em");
    this._play.setAttribute("width", "1em");
    button.appendChild(this._play);

    const title = document.createElementNS(svgNamespace, "title");
    title.textContent = "Play (Space)";
    this._play.appendChild(title);

    const path = document.createElementNS(svgNamespace, "path");
    path.setAttribute("d", "M2 29.778v-27.556c0-1.736 1.986-2.799 3.529-1.889l23.369 13.778c1.469 0.866 1.469 2.913 0 3.779l-23.369 13.778c-1.543 0.91-3.529-0.154-3.529-1.889z");
    this._play.appendChild(path);

    this._pause = document.createElementNS(svgNamespace, "svg");
    this._pause.setAttribute("class", "video__pause");
    this._pause.setAttribute("id", "icon-pause");
    this._pause.setAttribute("viewBox", "0 0 32 32");
    this._pause.setAttribute("height", "1em");
    this._pause.setAttribute("width", "1em");
    button.appendChild(this._pause);

    const pauseTitle = document.createElementNS(svgNamespace, "title");
    pauseTitle.textContent = "Pause (Space)";
    this._pause.appendChild(pauseTitle);

    const pausePath = document.createElementNS(svgNamespace, "path");
    pausePath.setAttribute("d", "M4 4h10v24h-10zM18 4h10v24h-10z");
    this._pause.appendChild(pausePath);
  }

  static get observedAttributes() {
    return ["is-paused"];
  }

  attributeChangedCallback(name, oldValue, newValue) {
    switch (name) {
      case "is-paused":
        if (newValue === null) {
          this._play.style.display = "none";
          this._pause.style.display = "block";
        } else {
          this._play.style.display = "block";
          this._pause.style.display = "none";
        }
    }
  }
}

customElements.define("play-button", PlayButton);
