/**
 * Module for the settings portion of the analytics dashboard
 */
class AnalyticsSettings extends TatorElement {
  constructor () {
    super();

    const div = document.createElement("div");
    div.setAttribute("class", "annotation__settings d-flex f2");
    this._shadow.appendChild(div);

    this._lightSpacer = document.createElement("span");
    this._lightSpacer.style.width = "32px";
    div.appendChild(this._lightSpacer);

    this._success = document.createElement("success-light");
    this._lightSpacer.appendChild(this._success);

    this._warning = document.createElement("warning-light");
    this._lightSpacer.appendChild(this._warning);

    this._lock = document.createElement("lock-button");
    this._lock.lock();
    div.appendChild(this._lock);

    this._link = document.createElement("media-link-button");
    div.appendChild(this._link);

    this._link.addEventListener("click", () => {
      const searchParams = new URLSearchParams(window.location.search);
      let url = window.location.origin + window.location.pathname;
      url += "?" + this._queryParams(searchParams).toString();
      const text = document.createElement("textarea");
      text.textContent = url;
      text.style.opacity = 0;
      document.body.appendChild(text);
      text.select();
      document.execCommand("copy");
      document.body.removeChild(text);
    });
  }

  static get observedAttributes() {
    return ["filterConditions", "pageSize", "page", "selectedState", "lock"];
  }

  _queryParams(params) {
    if (params == undefined) {
      params = new URLSearchParams(window.location.search)
    }
    if (this.hasAttribute("selectedState")) {
      params.set("selectedState", this.getAttribute("selectedState"));
    }
    if (this.hasAttribute("filterConditions")) {
      params.set("filterConditions", this.getAttribute("filterConditions"));
    }
    if (this.hasAttribute("pageSize")) {
      params.set("pageSize", this.getAttribute("pageSize"));
    }
    if (this.hasAttribute("page")) {
      params.set("page", this.getAttribute("page"));
    }
    if (this.hasAttribute("lock")) {
      params.set("lock", this.getAttribute("lock"));
    }

    return params;
  }

  getFilterConditionsObject() {
    if (this.hasAttribute("filterConditions")) {
      return JSON.parse(decodeURIComponent(this.getAttribute("filterConditions")));
    }
    else {
      return [];
    }
  }

  getPageSize() {
    if (this.hasAttribute("pageSize")) {
      return Number(this.getAttribute("pageSize"));
    }
    else {
      return NaN;
    }
  }

  getPage() {
    if (this.hasAttribute("page")) {
      return Number(this.getAttribute("page"));
    }
    else {
      return NaN;
    }
  }

  getLock() {
    if (this.hasAttribute("lock")) {
      return Number(this.getAttribute("lock"));
    }
    else {
      return NaN;
    }
  }

  getURL() {
    const searchParams = new URLSearchParams(window.location.search);
    var url = window.location.origin + window.location.pathname;
    url += "?" + this._queryParams(this._queryParams(searchParams)).toString();
    return url;
  }

  processURL() {
    const searchParams = new URLSearchParams(window.location.search);
    if (searchParams.has("filterConditions")) {
      this.setAttribute("filterConditions", searchParams.get("filterConditions"));
    }
    if (searchParams.has("pageSize")) {
      this.setAttribute("pageSize", searchParams.get("pageSize"));
    }
    if (searchParams.has("page")) {
      this.setAttribute("page", searchParams.get("page"));
    }
    if (searchParams.has("lock")) {
      this.setAttribute("lock", searchParams.get("lock"));
    }
    if (searchParams.has("selectedState")) {
      this.setAttribute("selectedState", searchParams.get("selectedState"));
    }
  }
}
customElements.define("analytics-settings", AnalyticsSettings);