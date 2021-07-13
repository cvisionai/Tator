class NavMain extends TatorElement {
  constructor() {
    super();

    this._div = document.createElement("div");
    this._div.setAttribute("class", "nav d-flex flex-justify-between flex-column px-6 text-semibold");
    this._shadow.appendChild(this._div);

    this._primary = document.createElement("div");
    this._primary.setAttribute("class", "nav__primary d-flex flex-column");
    this._div.appendChild(this._primary);

    const close = document.createElement("nav-close");
    this._primary.appendChild(close);

    const projects = document.createElement("a");
    projects.setAttribute("class", "nav__link");
    projects.setAttribute("href", "/projects/");
    projects.textContent = "Projects";
    this._primary.appendChild(projects);

    this._changePassword = document.createElement("a");
    this._changePassword.setAttribute("class", "nav__link");
    this._changePassword.setAttribute("href", "/accounts/password_change");
    this._changePassword.textContent = "Change Password";
    this._primary.appendChild(this._changePassword);

    this._accountProfile = document.createElement("a");
    this._accountProfile.setAttribute("class", "nav__link");
    this._accountProfile.setAttribute("href", "/accounts/account-profile");
    this._accountProfile.textContent = "Account Profile";
    this._primary.appendChild(this._accountProfile);

    this._token = document.createElement("a");
    this._token.setAttribute("class", "nav__link");
    this._token.setAttribute("href", "/token");
    this._token.textContent = "API Token";
    this._primary.appendChild(this._token);

    this._rest = document.createElement("a");
    this._rest.setAttribute("class", "nav__link");
    this._rest.setAttribute("href", "/rest");
    this._rest.textContent = "REST Interface";
    this._primary.appendChild(this._rest);

    const logout = document.createElement("a");
    logout.setAttribute("class", "nav__link");
    logout.setAttribute("href", "/accounts/logout/");
    logout.textContent = "Logout";
    this._primary.appendChild(logout);

    const secondary = document.createElement("div");
    secondary.setAttribute("class", "nav__secondary d-flex flex-column py-6 text-gray");
    this._div.appendChild(secondary);

    const heading = document.createElement("span");
    heading.setAttribute("class", "nav__heading py-2 f3 text-uppercase");
    heading.textContent = "Help";
    secondary.appendChild(heading);

    const headingDiv = document.createElement("div");
    headingDiv.setAttribute("class", "d-flex flex-column py-2 f2");
    secondary.appendChild(headingDiv);

    const knowledge = document.createElement("a");
    knowledge.setAttribute("class", "nav__link");
    knowledge.setAttribute("href", "https://www.tator.io/tutorials");
    knowledge.setAttribute("target", "_blank");
    knowledge.setAttribute("rel", "noopener noreferrer");
    knowledge.textContent = "Knowledge Base";
    headingDiv.appendChild(knowledge);

    const service = document.createElement("a");
    service.setAttribute("class", "nav__link");
    service.style.paddingBottom = "0px";
    service.setAttribute("href", "mailto:info@cvisionai.com");
    service.textContent = "Customer Service";
    headingDiv.appendChild(service);

    const shortcuts = document.createElement("button");
    shortcuts.setAttribute("class", "nav__link btn-clear px-0");
    shortcuts.textContent = "Keyboard Shortcuts";
    headingDiv.appendChild(shortcuts);

    shortcuts.addEventListener("click", evt => {
      this.dispatchEvent(new Event("show-shortcuts"));
    });

    close.addEventListener("navClose", evt => {
      this.removeAttribute("is-open");
    });
  }

  static get observedAttributes() {
    return ["is-open"];
  }

  attributeChangedCallback(name, oldValue, newValue) {
    switch (name) {
      case "is-open":
        if (newValue === null) {
          this._div.classList.remove("is-open");
          const closed = new Event("closed");
          this.dispatchEvent(closed);
        } else {
          this._div.classList.add("is-open");
        }
        break;
    }
  }

  disableAccountSettings() {
    this._primary.removeChild(this._changePassword);
    this._primary.removeChild(this._accountProfile);
    this._primary.removeChild(this._token);
  }
}

customElements.define("nav-main", NavMain);
