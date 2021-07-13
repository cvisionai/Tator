class EntityDetectionButton extends TatorElement {
  constructor() {
    super();

    const button = document.createElement("button");
    button.setAttribute("class", "btn-clear d-flex flex-justify-center px-2 py-2 rounded-2 f2 text-white entity__button");
    this._shadow.appendChild(button);

    const svg = document.createElementNS(svgNamespace, "svg");
    svg.setAttribute("id", "icon-box");
    svg.setAttribute("viewBox", "0 0 32 32");
    svg.setAttribute("height", "1em");
    svg.setAttribute("width", "1em");
    svg.setAttribute("stroke", "currentColor");
    svg.setAttribute("stroke-width", "2");
    svg.setAttribute("stroke-linecap", "round");
    svg.setAttribute("stroke-linejoin", "round");
    svg.setAttribute("fill", "none");
    svg.style.fill = "none";
    button.appendChild(svg);

    const path = document.createElementNS(svgNamespace, "path");
    path.setAttribute("d", "M28 24.133v-16.267c1.55-0.287 2.709-1.629 2.709-3.241 0-1.819-1.474-3.293-3.293-3.293-0.029 0-0.058 0-0.086 0.001l0.004-0c-1.733 0-3.067 1.333-3.333 2.933h-16c-0.267-1.6-1.6-2.933-3.333-2.933-1.803 0.031-3.252 1.499-3.252 3.306 0 1.571 1.095 2.886 2.563 3.223l0.022 0.004v16.133c-1.467 0.267-2.667 1.6-2.667 3.2 0 2 1.467 3.467 3.333 3.467 1.467 0 2.8-1.067 3.2-2.4h16.267c0.4 1.333 1.733 2.4 3.2 2.4 1.803-0.031 3.252-1.499 3.252-3.306 0-1.571-1.095-2.886-2.563-3.223l-0.022-0.004zM24 26.933h-16c-0.133-1.467-1.2-2.533-2.667-2.8v-16.267c1.2-0.267 2.133-1.2 2.533-2.4h16.267c0.4 1.2 1.333 2.133 2.533 2.4v16.133c-1.333 0.4-2.4 1.467-2.667 2.933zM27.333 2.667c1.067 0 2 0.933 2 2s-0.933 2-2 2-2-0.933-2-2 0.933-2 2-2zM2.667 4.667c0-1.067 0.933-2 2-2s2 0.933 2 2-0.933 2-2 2-2-0.933-2-2zM4.667 29.333c-1.067 0-2-0.933-2-2s0.933-2 2-2 2 0.933 2 2-0.933 2-2 2zM27.333 29.333c-1.067 0-2-0.933-2-2s0.933-2 2-2 2 0.933 2 2-0.933 2-2 2z");
    svg.appendChild(path);
  }
}

customElements.define("entity-detection-button", EntityDetectionButton);
