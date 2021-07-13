class HeaderUser extends TatorElement {
  constructor() {
    super();

    const div = document.createElement("div");
    div.setAttribute("class", "d-flex flex-justify-right flex-items-center f3");
    this._shadow.appendChild(div);

    const innerDiv = document.createElement("div");
    div.appendChild(innerDiv);

    this._username = document.createElement("span");
    this._username.setAttribute("class", "text-gray px-2");
    this._username.style.display = "block";
    innerDiv.appendChild(this._username);

    this._email = document.createElement("span");
    this._email.setAttribute("class", "text-gray px-2");
    this._email.style.display = "block";
    innerDiv.appendChild(this._email);

    this._avatar = document.createElement("span");
    this._avatar.setAttribute("class", "avatar circle d-flex flex-items-center flex-justify-center");
    div.appendChild(this._avatar);
  }

  static get observedAttributes() {
    return ["username", "email"];
  }

  attributeChangedCallback(name, oldValue, newValue) {
    switch (name) {
      case "username":
        this._username.textContent = newValue;
        let initials = newValue.match(/\b\w/g) || [];
        initials = ((initials.shift() || '') + (initials.pop() || '')).toUpperCase();
        this._avatar.textContent = initials;
        break;
      case "email":
        this._email.textContent = newValue;
        break;
    }
  }
}

customElements.define("header-user", HeaderUser);
