class EntityFrameLinkButton extends TatorElement {
  constructor() {
    super();

    this.button = document.createElement("a");
    this.button.setAttribute("class", "btn-clear px-2 py-2 rounded-2 f2 text-white entity__button clickable");
    this._shadow.appendChild(this.button);

    const svg = document.createElementNS(svgNamespace, "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("height", "1em");
    svg.setAttribute("width", "1em");
    svg.setAttribute("stroke", "currentColor");
    svg.setAttribute("stroke-width", "1");
    svg.setAttribute("stroke-linecap", "round");
    svg.setAttribute("stroke-linejoin", "round");
    svg.style.fill = "none";
    this.button.appendChild(svg);

    const title = document.createElementNS(svgNamespace, "title");
    title.textContent = "Go to entity's frame";
    svg.appendChild(title);

    const shape1 = document.createElementNS(svgNamespace, "rect");
    shape1.setAttribute("x", "2"); 
    shape1.setAttribute("y", "2");
    shape1.setAttribute("width", "20");
    shape1.setAttribute("height", "20");
    shape1.setAttribute("rx", "2.18");
    shape1.setAttribute("ry", "2.18");
    shape1.setAttribute("stroke-width", "2");
    svg.appendChild(shape1);

    const shape2 = document.createElementNS(svgNamespace, "line");
    shape2.setAttribute("x1", "7"); 
    shape2.setAttribute("y1", "2");
    shape2.setAttribute("x2", "7"); 
    shape2.setAttribute("y2", "22");
    svg.appendChild(shape2);

    const shape3 = document.createElementNS(svgNamespace, "line");
    shape3.setAttribute("x1", "17"); 
    shape3.setAttribute("y1", "2");
    shape3.setAttribute("x2", "17"); 
    shape3.setAttribute("y2", "22");
    svg.appendChild(shape3);

    const shape4 = document.createElementNS(svgNamespace, "line");
    shape4.setAttribute("x1", "2"); 
    shape4.setAttribute("y1", "12");
    shape4.setAttribute("x2", "22"); 
    shape4.setAttribute("y2", "12");
    svg.appendChild(shape4);

    const shape5 = document.createElementNS(svgNamespace, "line");
    shape5.setAttribute("x1", "2"); 
    shape5.setAttribute("y1", "7");
    shape5.setAttribute("x2", "7"); 
    shape5.setAttribute("y2", "7");
    svg.appendChild(shape5);

    const shape6 = document.createElementNS(svgNamespace, "line");
    shape6.setAttribute("x1", "2"); 
    shape6.setAttribute("y1", "17");
    shape6.setAttribute("x2", "7"); 
    shape6.setAttribute("y2", "17");
    svg.appendChild(shape6);

    const shape7 = document.createElementNS(svgNamespace, "line");
    shape7.setAttribute("x1", "17"); 
    shape7.setAttribute("y1", "17");
    shape7.setAttribute("x2", "22"); 
    shape7.setAttribute("y2", "17");
    svg.appendChild(shape7);

    const shape8 = document.createElementNS(svgNamespace, "line");
    shape8.setAttribute("x1", "17"); 
    shape8.setAttribute("y1", "7");
    shape8.setAttribute("x2", "22"); 
    shape8.setAttribute("y2", "7");
    svg.appendChild(shape8);
  }
}

customElements.define("entity-frame-link-button", EntityFrameLinkButton);
