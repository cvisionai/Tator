class AlgorithmMenu extends TatorElement {
  constructor() {
    super();

    this._algorithmButtons = document.createElement("div");
    this._algorithmButtons.setAttribute("class", "d-flex flex-column px-4 py-3 lh-condensed");
    this._shadow.appendChild(this._algorithmButtons);

    this._newAlgorithm = document.createElement("new-algorithm-button");
    this._algorithmButtons.appendChild(this._newAlgorithm);

    this._newAlgorithm.addEventListener("click", evt => {
      this.dispatchEvent(new Event("newAlgorithm", {composed: true}));
    });
  }

  set algorithms(val) {
    for (let algorithm of val) {
      const button = document.createElement("button");
      button.setAttribute("class", "btn-clear py-2 px-0 text-gray hover-text-white d-flex flex-items-center");
      this._algorithmButtons.insertBefore(button, this._newAlgorithm);

      const span = document.createElement("span");
      span.setAttribute("class", "px-2");
      span.textContent = algorithm.name;
      button.appendChild(span);

      button.addEventListener("click", evt => {
        this.dispatchEvent(new CustomEvent("algorithmMenu", {
          detail: {algorithmName: algorithm.name},
          composed: true
        }));
      });
    }
  }

  hideNewAlgorithm() {
    this._newAlgorithm.hidden = true;
  }
}

customElements.define("algorithm-menu", AlgorithmMenu);
