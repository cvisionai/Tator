class RateControl extends TatorElement {
  constructor() {
    super();

    const summary = document.createElement("summary");
    summary.style.cursor = "pointer";
    summary.setAttribute("class", "d-flex flex-items-center rounded-1");
    this._shadow.appendChild(summary);

    const div = document.createElement("div");
    div.setAttribute("class", "px-1");
    summary.appendChild(div);

    const select = document.createElement("select");
    select.setAttribute("class", "form-select has-border select-sm1");
    div.appendChild(select);
    this._select = select;

    this._rates = [0.125, 0.25, 0.5, 1, 2, 4, 8, 16, 32];
    for (const rate of this._rates)
    {
      let option = document.createElement("option");
      option.setAttribute("value", rate);
      option.textContent = `${rate}x`;
      select.append(option);
    }
    select.selectedIndex = 3; //represents 1x

    select.addEventListener("change", evt => {
      const rate = Number(evt.target.value);
      this.dispatchEvent(new CustomEvent("rateChange", {
        detail: {rate: rate},
        composed: true
      }));
    });
  }

  static get observedAttributes() {
    return ["class", "disabled"];
  }

  attributeChangedCallback(name, oldValue, newValue) {
    switch (name) {
      case "disabled":
        if (newValue === null) {
          this._select.removeAttribute("disabled");
        } else {
          this._select.setAttribute("disabled", "");
        }
        break;
    }
  }

  /**
   * Programmatically sets the selected rate and emits rateChange event
   * @param {Number} rate
   */
  setValue(rate) {
    for (let idx = 0; idx < this._rates.length; idx++) {
      if (this._rates[idx] == rate) {

        // Change the UI element
        this._select.selectedIndex = idx;

        // Send out the rate change event
        this.dispatchEvent(new CustomEvent("rateChange", {
          detail: {rate: rate},
          composed: true
        }));

        // Done here
        return;
      }
    }
  }
}

customElements.define("rate-control", RateControl);
