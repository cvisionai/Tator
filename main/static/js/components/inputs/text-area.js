class TextArea extends TatorElement {
  constructor() {
    super();

    const label = document.createElement("label");
    label.setAttribute("class", "d-flex flex-justify-between flex-items-center py-1");
    this._shadow.appendChild(label);

    this._name = document.createTextNode("");
    label.appendChild(this._name);

    this._input = document.createElement("textarea");
    this._input.setAttribute("class", "form-control input-sm col-8");
    this._input.setAttribute("type", "text");
    label.appendChild(this._input);

    this._input.addEventListener("change", () => {
      if (this.getValue() === null) {
        this._input.classList.add("has-border");
        this._input.classList.add("is-invalid");
      } else {
        this._input.classList.remove("has-border");
        this._input.classList.remove("is-invalid");
      }
      this.dispatchEvent(new Event("change"));
    });

    this.getValue = this._validateString;

    this._input.addEventListener("focus", () => {
      document.body.classList.add("shortcuts-disabled");
    });

    this._input.addEventListener("blur", () => {
      document.body.classList.remove("shortcuts-disabled");
    });

  }

  static get observedAttributes() {
    return ["name", "type"];
  }

  attributeChangedCallback(name, oldValue, newValue) {
    switch (name) {
      case "name":
        this._name.nodeValue = newValue;
        break;
      case "type":
        switch (newValue) {
          case "string":
            this.getValue = this._validateString;
            break;
        }
        break;
    }
  }

  set permission(val) {
    if (hasPermission(val, "Can Edit")) {
      this._input.removeAttribute("readonly");
      this._input.classList.remove("disabled");
    } else {
      this._input.setAttribute("readonly", "");
      this._input.classList.add("disabled");
    }
  }

  set default(val) {
    this._default = val;
  }

  reset() {
    // Go back to default value
    if (typeof this._default !== "undefined") {
      this.setValue(this._default);
    } else {
      this.setValue("");
    }
  }

  _validateString() {
    return this._input.value;
  }

  setValue(val) {
    this._input.value = val;
  }
}

customElements.define("text-area", TextArea);
