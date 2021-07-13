class AlgorithmButton extends TatorElement {
  constructor() {
    super();

    const details = document.createElement("details");
    details.setAttribute("class", "px-2 position-relative");
    this._shadow.appendChild(details);

    const summary = document.createElement("summary");
    summary.setAttribute("class", "btn btn-clear btn-outline f2");
    summary.textContent = "Run Algorithm";
    details.appendChild(summary);

    summary.style.height = "32px";
    summary.style.width = "120px";

    const div = document.createElement("div");
    div.setAttribute("class", "more d-flex flex-column f2");
    details.appendChild(div);

    this._algorithmMenu = document.createElement("algorithm-menu");
    div.appendChild(this._algorithmMenu);

    this._algorithmMenu.addEventListener("click", () => {
      details.removeAttribute("open");
    });
  }

  static get observedAttributes() {
    return ["project-id"];
  }

  attributeChangedCallback(name, oldValue, newValue) {
    switch (name) {
      case "project-id":
        this._algorithmMenu.addEventListener("algorithmMenu", evt => {
          this.dispatchEvent(
            new CustomEvent("runAlgorithm",
              {composed: true,
              detail: {
                algorithmName: evt.detail.algorithmName,
                projectId: newValue,
              }}));
        });
    }
  }

  set algorithms(val) {
    this._algorithmMenu.algorithms = val;
  }

  hideNewAlgorithm() {
    this._algorithmMenu.hideNewAlgorithm();
  }
}

customElements.define("algorithm-button", AlgorithmButton);
