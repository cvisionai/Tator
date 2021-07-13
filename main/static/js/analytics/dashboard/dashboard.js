class AnalyticsDashboard extends TatorPage {
  constructor() {
    super();

    this.projectId = window.location.pathname.split("/")[1];

          //
    // Header
    //
    const header = document.createElement("div");
    this._headerDiv = this._header._shadow.querySelector("header");
    header.setAttribute("class", "annotation__header d-flex flex-items-center flex-justify-between px-6 f3");
    const user = this._header._shadow.querySelector("header-user");
    user.parentNode.insertBefore(header, user);

    const div = document.createElement("div");
    div.setAttribute("class", "d-flex flex-items-center");
    header.appendChild(div);

    this._breadcrumbs = document.createElement("analytics-breadcrumbs");
    div.appendChild(this._breadcrumbs);
    this._breadcrumbs.setAttribute("analytics-name", "Dashboard");

    this.main = document.createElement("main");
    this.main.setAttribute("class", "layout-max d-flex flex-justify-center");
    this._shadow.appendChild(this.main);;

    // Annotations
    const localizationsBox = this._getDashboardBox({
        name : "Localizations",
        href : `/${this.projectId}/analytics/localizations`,
        iconName: "grid-icon"
      });
    this.main.appendChild(localizationsBox);

    // Collections
    const collectionsBox = this._getDashboardBox({
        name : "Collections",
        href : `/${this.projectId}/analytics/collections`,
        iconName: "layers-icon",
        disabled: true,
      });
    this.main.appendChild(collectionsBox);

    // Visualization
    /*
    const visualizationBox = this._getDashboardBox({
        name : "Data Visualization",
        href : `/${this.projectId}/analytics/visualization`,
        iconName: "bar-chart-icon"
      });
    this.main.appendChild(visualizationBox);
  */

    // Reports
    /*
    const reportsBox = this._getDashboardBox({
        name : "Reports",
        href : ``,
        iconName: "file-text-icon"
      });
    this.main.appendChild(reportsBox);
    reportsBox.setAttribute("disabled", "");
    */
  }

  attributeChangedCallback(name, oldValue, newValue) {
    TatorPage.prototype.attributeChangedCallback.call(this, name, oldValue, newValue);
    switch (name) {
      case "project-name":
        this._breadcrumbs.setAttribute("project-name", newValue);
        break;
      case "project-id":
        //this._init();
        break;
    }
  }

  static get observedAttributes() {
    return ["project-name", "project-id"].concat(TatorPage.observedAttributes);
  }

  _getDashboardBox({name, href, iconName, disabled}={}){
    const height = "2em";
    const width = "2em";

    const iconDiv = document.createElement("div");
    iconDiv.setAttribute("class", "pb-3 d-block color-white");

    const dashboardIcon = new SvgDefinition({iconName, height, width});
    iconDiv.appendChild(dashboardIcon);

    const dashboardText = document.createElement("p");
    dashboardText.setAttribute("class", "h3 analysis__dashboard-text text-normal text-gray");
    dashboardText.textContent = name;

    return this._newRoundedBox(iconDiv, dashboardText, href, disabled);
  }

  _newRoundedBox(iconDiv, dashboardText, href, disabled){
    var roundedBox = document.createElement("a");
    roundedBox.setAttribute("class", "analysis__dashboard-box d-flex flex-items-center rounded-2");
    roundedBox.setAttribute("href", href);

    const content = document.createElement("div");
    content.setAttribute("class", "flex-items-center text-center");
    content.style.width = "100%";
    roundedBox.appendChild(content);

    content.appendChild(iconDiv);
    content.appendChild(dashboardText);

    return roundedBox;
  }

}

customElements.define("analytics-dashboard", AnalyticsDashboard);