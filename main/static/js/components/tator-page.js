class TatorPage extends TatorElement {
  constructor() {
    super();

    this._header = document.createElement("header-main");
    this._shadow.appendChild(this._header);

    this._nav = document.createElement("nav-main");
    this._shadow.appendChild(this._nav);

    const shortcuts = document.createElement("keyboard-shortcuts");
    this._shadow.appendChild(shortcuts);

    this._header.addEventListener("openNav", evt => {
      this._nav.setAttribute("is-open", "");
      this.setAttribute("has-open-modal", "");
    });

    this._nav.addEventListener("closed", evt => {
      this._nav.removeAttribute("is-open");
      shortcuts.removeAttribute("is-open");
      this.removeAttribute("has-open-modal");
    });

    this._nav.addEventListener("show-shortcuts", evt => {
      shortcuts.setAttribute("is-open", "");
      this.setAttribute("has-open-modal", "");
    });

    this._dimmer = document.createElement("div");
    this._dimmer.setAttribute("class", "background-dimmer");
    this._shadow.appendChild(this._dimmer);

    this._announcements = document.createElement("announcement-dialog");
    this._shadow.appendChild(this._announcements);

    this._announcements.addEventListener("close", evt => {
      this.removeAttribute("has-open-modal");
    });
  }

  connectedCallback() {
    fetch("/rest/Announcements", {
      method: "GET",
      ...sameOriginCredentials(),
    })
    .then(response => response.json())
    .then(announcements => {
      if (announcements.length > 0) {
        this._announcements.init(announcements);
        this._announcements.setAttribute("is-open", "");
        this.setAttribute("has-open-modal", "");
      }
    });
  }

  static get observedAttributes() {
    return ["username", "email", "has-open-modal"];
  }

  attributeChangedCallback(name, oldValue, newValue) {
    switch (name) {
      case "username":
        this._header.setAttribute("username", newValue);
        if (newValue == 'Guest Account') {
          this._nav.disableAccountSettings();
        }
        break;
      case "email":
        this._header.setAttribute("email", newValue);
        break;
      case "has-open-modal":
        if (newValue === null) {
          this._dimmer.classList.remove("has-open-modal");
        } else {
          this._dimmer.classList.add("has-open-modal");
        }
        break;
    }
  }
}

customElements.define("tator-page", TatorPage);

