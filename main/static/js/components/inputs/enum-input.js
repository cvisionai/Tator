class EnumInput extends TatorElement {
  constructor() {
    super();

    this.label = document.createElement("label");
    this.label.setAttribute("class", "d-flex flex-justify-between flex-items-center py-1");
    this.label.style.position = "relative";
    this._shadow.appendChild(this.label);

    this._name = document.createTextNode("");
    this.label.appendChild(this._name);

    const span = document.createElement("span");
    span.setAttribute("class", "sr-only");
    this.label.appendChild(span);

    this._select = document.createElement("select");
    this._select.setAttribute("class", "form-select has-border select-sm col-8");
    this.label.appendChild(this._select);

    // Add unselectable option for null values.
    this._null = document.createElement("option");
    this._null.setAttribute("value", "");
    this._null.setAttribute("disabled", "");
    this._null.setAttribute("hidden", "");
    this._null.textContent = "null";
    this._select.appendChild(this._null);

    // Add unselectable option for undefined values.
    this._undefined = document.createElement("option");
    this._undefined.setAttribute("value", "");
    this._undefined.setAttribute("disabled", "");
    this._undefined.setAttribute("hidden", "");
    this._undefined.textContent = "undefined";
    this._select.appendChild(this._undefined);

    const svg = document.createElementNS(svgNamespace, "svg");
    svg.setAttribute("class", "text-gray");
    svg.setAttribute("id", "icon-chevron-down");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("height", "1em");
    svg.setAttribute("width", "1em");
    this.label.appendChild(svg);

    const path = document.createElementNS(svgNamespace, "path");
    path.setAttribute("d", "M5.293 9.707l6 6c0.391 0.391 1.024 0.391 1.414 0l6-6c0.391-0.391 0.391-1.024 0-1.414s-1.024-0.391-1.414 0l-5.293 5.293-5.293-5.293c-0.391-0.391-1.024-0.391-1.414 0s-0.391 1.024 0 1.414z");
    svg.appendChild(path);

    this._select.addEventListener("change", () => {
      this.dispatchEvent(new Event("change"));
    });

  }

  static get observedAttributes() {
    return ["name"];
  }

  attributeChangedCallback(name, oldValue, newValue) {
    switch (name) {
      case "name":
        this._name.nodeValue = newValue;
        break;
    }
  }

  set permission(val) {
    if (hasPermission(val, "Can Edit")) {
      this._select.removeAttribute("disabled");
    } else {
      this._select.setAttribute("disabled", "");
    }
  }

  set choices(val) {
    // Add attribute type choices.
    for (const choice of val) {
      const option = document.createElement("option");
      option.setAttribute("value", choice.value);
      if ('label' in choice)
      {
        option.textContent = choice.label;
      }
      else
      {
        option.textContent = choice.value;
      }
      this._select.appendChild(option);
    }
  }

  set default(val) {
    this._default = val;
  }

  // checks if the current value equals the default
  changed(){
    return this.getValue() !== this._default;
  }

  reset() {
    // Go back to default value
    if (typeof this._default !== "undefined") {
      this.setValue(this._default);
    } else {
      this._undefined.setAttribute("selected", "");
    }
  }

  getValue() {
    const selected = this._select.selectedIndex;
    return this._select.options[selected].value;
  }

  setValue(val) {
    let idx = 0;
    if (typeof val === "undefined") {
      this._undefined.setAttribute("selected", "");
    } else if (val === null) {
      this._null.setAttribute("selected", "");
    } else {
      for (const option of this._select.options) {
        if (option.value == val) {
          this._select.selectedIndex = idx;
          break;
        }
        idx++;
      }
    }
  }
  
  /**
   * Clears the options. Useful for resetting the menu options.
   */
  clear() {
    while (this._select.options.length > 0) {
      this._select.options.remove(0);
    }
  }
}

customElements.define("enum-input", EnumInput);