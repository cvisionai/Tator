class EntityTrackButton extends TatorElement {
  constructor() {
    super();

    const button = document.createElement("button");
    button.setAttribute("class", "btn-clear d-flex flex-justify-center px-2 py-2 rounded-2 f2 text-white entity__button");
    this._shadow.appendChild(button);

    const svg = document.createElementNS(svgNamespace, "svg");
    svg.setAttribute("id", "icon-track");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("height", "1em");
    svg.setAttribute("width", "1em");
    svg.setAttribute("stroke", "currentColor");
    svg.setAttribute("stroke-width", "2");
    svg.setAttribute("stroke-linecap", "round");
    svg.setAttribute("stroke-linejoin", "round");
    svg.setAttribute("fill", "none");
    svg.style.fill = "none";
    button.appendChild(svg);

    const rect = document.createElementNS(svgNamespace, "rect");
    rect.setAttribute("x", "9.2");
    rect.setAttribute("y", "0.786");
    rect.setAttribute("width", "14.16");
    rect.setAttribute("height", "14.16");
    svg.appendChild(rect);

    const poly1 = document.createElementNS(svgNamespace, "polyline");
    poly1.setAttribute("points", "6.70 4.25 4.99 4.25 4.99 18.77 19.50 18.77 19.50 17.43");
    svg.appendChild(poly1);

    const poly2 = document.createElementNS(svgNamespace, "polyline");
    poly2.setAttribute("points", "2.52 8.22 0.83 8.22 0.83 22.57 15.18 22.57 15.18 21.26");
    svg.appendChild(poly2);
  }
}

customElements.define("entity-track-button", EntityTrackButton);
