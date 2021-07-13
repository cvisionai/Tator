class ModalWarning extends TatorElement {
  constructor() {
    super();

    const svg = document.createElementNS(svgNamespace, "svg");
    svg.setAttribute("class", "h3 text-red");
    svg.setAttribute("id", "icon-alert-triangle");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("height", "1em");
    svg.setAttribute("width", "1em");
    this._shadow.appendChild(svg);

    const title = document.createElementNS(svgNamespace, "title");
    title.textContent = "Warning";
    svg.appendChild(title);

    const path = document.createElementNS(svgNamespace, "path");
    path.setAttribute("d", "M23.041 17.494l-8.473-14.147c-0.213-0.352-0.483-0.64-0.792-0.867-0.321-0.237-0.682-0.403-1.062-0.495-0.38-0.094-0.778-0.113-1.17-0.052-0.38 0.059-0.752 0.19-1.099 0.401-0.429 0.26-0.776 0.614-1.012 1.015v0l-8.473 14.138c-0.211 0.363-0.335 0.741-0.384 1.12-0.052 0.396-0.023 0.792 0.077 1.17s0.274 0.736 0.518 1.050c0.234 0.305 0.53 0.57 0.879 0.771 0.464 0.267 0.975 0.401 1.474 0.403h16.943c0.415-0.005 0.804-0.089 1.155-0.239 0.366-0.157 0.694-0.382 0.968-0.661s0.492-0.612 0.64-0.982c0.143-0.356 0.218-0.745 0.216-1.151-0.005-0.537-0.152-1.045-0.405-1.474zM12 18c-0.553 0-1.001-0.448-1.001-1.001s0.448-1.001 1.001-1.001 1.001 0.448 1.001 1.001-0.448 1.001-1.001 1.001zM13.001 13.001c0 0.553-0.448 1.001-1.001 1.001s-1.001-0.448-1.001-1.001v-4.001c0-0.553 0.448-1.001 1.001-1.001s1.001 0.448 1.001 1.001v4.001z");
    svg.appendChild(path);
  }
}

customElements.define("modal-warning", ModalWarning);
