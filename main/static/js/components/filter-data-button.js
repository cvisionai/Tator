class FilterDataButton extends TatorElement {
  constructor() {
    super();

    const label = document.createElement("label");
    label.setAttribute("class", "btn btn-clear btn-outline f2 px-1");
    this._shadow.appendChild(label);

    label.style.height = "32px";
    label.style.width = "75px";

    const svg = document.createElementNS(svgNamespace, "svg");
    svg.setAttribute("width", "16");
    svg.setAttribute("height", "16");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("fill", "none");
    svg.style.fill = "none";
    svg.setAttribute("stroke", "currentColor");
    svg.setAttribute("stroke-width", "2");
    svg.setAttribute("stroke-linecap", "round");
    svg.setAttribute("stroke-linejoin", "round");
    label.appendChild(svg);

    let line = document.createElementNS(svgNamespace, "line");
    line.setAttribute("x1", "4");
    line.setAttribute("y1", "21");
    line.setAttribute("x2", "4");
    line.setAttribute("y2", "14");
    svg.appendChild(line);

    line = document.createElementNS(svgNamespace, "line");
    line.setAttribute("x1", "4");
    line.setAttribute("y1", "10");
    line.setAttribute("x2", "4");
    line.setAttribute("y2", "3");
    svg.appendChild(line);

    line = document.createElementNS(svgNamespace, "line");
    line.setAttribute("x1", "12");
    line.setAttribute("y1", "21");
    line.setAttribute("x2", "12");
    line.setAttribute("y2", "12");
    svg.appendChild(line);

    line = document.createElementNS(svgNamespace, "line");
    line.setAttribute("x1", "12");
    line.setAttribute("y1", "8");
    line.setAttribute("x2", "12");
    line.setAttribute("y2", "3");
    svg.appendChild(line);

    line = document.createElementNS(svgNamespace, "line");
    line.setAttribute("x1", "20");
    line.setAttribute("y1", "21");
    line.setAttribute("x2", "20");
    line.setAttribute("y2", "16");
    svg.appendChild(line);

    line = document.createElementNS(svgNamespace, "line");
    line.setAttribute("x1", "20");
    line.setAttribute("y1", "12");
    line.setAttribute("x2", "20");
    line.setAttribute("y2", "3");
    svg.appendChild(line);

    line = document.createElementNS(svgNamespace, "line");
    line.setAttribute("x1", "1");
    line.setAttribute("y1", "14");
    line.setAttribute("x2", "7");
    line.setAttribute("y2", "14");
    svg.appendChild(line);

    line = document.createElementNS(svgNamespace, "line");
    line.setAttribute("x1", "9");
    line.setAttribute("y1", "8");
    line.setAttribute("x2", "15");
    line.setAttribute("y2", "8");
    svg.appendChild(line);

    line = document.createElementNS(svgNamespace, "line");
    line.setAttribute("x1", "17");
    line.setAttribute("y1", "16");
    line.setAttribute("x2", "23");
    line.setAttribute("y2", "16");
    svg.appendChild(line);

    const span = document.createElement("span");
    span.setAttribute("class", "px-2");
    span.textContent = "Filter";
    label.appendChild(span);
  }
}

customElements.define("filter-data-button", FilterDataButton);
