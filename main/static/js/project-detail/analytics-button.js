class AnalyticsButton extends TatorElement {
  constructor() {
    super();

    this._link = document.createElement("a");
    this._link.setAttribute("href", "#");
    this._shadow.appendChild(this._link);

    const label = document.createElement("label");
    label.setAttribute("class", "btn");
    this._link.appendChild(label);

    const svg = document.createElementNS(svgNamespace, "svg");
    svg.setAttribute("width", "24");
    svg.setAttribute("height", "24");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("fill", "none");
    svg.style.fill = "none";
    svg.setAttribute("stroke", "currentColor");
    svg.setAttribute("stroke-width", "2");
    svg.setAttribute("stroke-linecap", "round");
    svg.setAttribute("stroke-linejoin", "round");
    label.appendChild(svg);

    var line = document.createElementNS(svgNamespace, "line");
    line.setAttribute("x1", "18");
    line.setAttribute("y1", "20");
    line.setAttribute("x2", "18");
    line.setAttribute("y2", "10");
    svg.appendChild(line);

    line = document.createElementNS(svgNamespace, "line");
    line.setAttribute("x1", "12");
    line.setAttribute("y1", "20");
    line.setAttribute("x2", "12");
    line.setAttribute("y2", "4");
    svg.appendChild(line);

    line = document.createElementNS(svgNamespace, "line");
    line.setAttribute("x1", "6");
    line.setAttribute("y1", "20");
    line.setAttribute("x2", "6");
    line.setAttribute("y2", "14");
    svg.appendChild(line);

    const span = document.createElement("span");
    span.setAttribute("class", "px-1");
    span.textContent = "Analytics";
    label.appendChild(span);
  }

  static get observedAttributes() {
    return ["project-id"];
  }

  attributeChangedCallback(name, oldValue, newValue) {
    switch (name) {
      case "project-id":
        this._link.setAttribute("href", `/${newValue}/analytics/`);
    }
  }
}

customElements.define("analytics-button", AnalyticsButton);
