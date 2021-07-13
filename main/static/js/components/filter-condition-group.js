/**
 * Element that encaspulates a group of filter conditions
 */
class FilterConditionGroup extends TatorElement {

  constructor() {
    super();

    this._div = document.createElement("div");
    this._shadow.appendChild(this._div);

    var headerDiv = document.createElement("div");
    headerDiv.textContent = "Add Condition";
    headerDiv.setAttribute("class", "d-flex flex-items-center text-semibold text-gray f2");
    this._div.appendChild(headerDiv);

    const addConditionButton = document.createElement("button");
    addConditionButton.setAttribute("class", "btn btn-outline btn-small f2 px-1");
    addConditionButton.style.marginLeft = "6px"
    addConditionButton.style.width = "24px"
    addConditionButton.style.height = "24px"
    headerDiv.appendChild(addConditionButton);

    const addSvg = document.createElementNS(svgNamespace, "svg");
    addSvg.setAttribute("viewBox", "0 0 24 24");
    addSvg.setAttribute("width", "24");
    addSvg.setAttribute("height", "24");
    addSvg.setAttribute("fill", "none");
    addSvg.setAttribute("stroke", "currentColor");
    addSvg.setAttribute("stroke-width", "2");
    addSvg.setAttribute("stroke-linecap", "round");
    addSvg.setAttribute("stroke-linejoin", "round");
    addConditionButton.appendChild(addSvg);

    const line1 = document.createElementNS(svgNamespace, "line");
    line1.setAttribute("x1", "12");
    line1.setAttribute("y1", "5");
    line1.setAttribute("x2", "12");
    line1.setAttribute("y2", "19");
    addSvg.appendChild(line1);

    const line2 = document.createElementNS(svgNamespace, "line");
    line2.setAttribute("x1", "5");
    line2.setAttribute("y1", "12");
    line2.setAttribute("x2", "19");
    line2.setAttribute("y2", "12");
    addSvg.appendChild(line2);

    var spacerDiv = document.createElement("div");
    spacerDiv.setAttribute("class", "d-flex flex-justify-between flex-items-center py-2");
    this._div.appendChild(spacerDiv);

    var innerDiv = document.createElement("div");
    innerDiv.setAttribute("class", "analysis__filter_conditions d-flex py-2");
    this._div.appendChild(innerDiv)

    this._conditionDiv = document.createElement("div");
    this._conditionDiv.setAttribute("class", "px-2 py-2")
    this._conditionDiv.style.width = "100%";
    innerDiv.appendChild(this._conditionDiv);

    /**
     * Event handlers
     */

    // Create a new element for the user to apply a new condition/rule to the filter
    addConditionButton.addEventListener("click", () => {
      this.addCondition();
    });
  }

  /**
   * Sets the available dataset that can be selected by the user
   *
   * @param {array} val - List of objects with the following fields
   *   .name - str - Name of attribute type
   *   .attribute_types - array - Array of objects with the following fields
   *     .name - str - Name of attribute
   *     .dtype - str - string|bool|float|int|datetime|geopos|enum
   *     .choices - array - Valid only if enum was provided
   */
  set data(val) {
    this._data = val;
  }

  /**
   * @returns {array} - Array of FilterConditionData objects requested by the user.
   */
  getConditions() {
    var conditions = [];
    for (const conditionElem of this._conditionDiv.children)
    {
      var validCondition = conditionElem.getCondition();
      if (validCondition != null)
      {
        conditions.push(validCondition);
      }
    }
    return conditions;
  }

  /**
   * @precondition data property of this object must have been set
   * @param {array} val - Array of FilterConditionData objects to set the
   */
  setConditions(val) {

    // Remove all the children in the conditions div.
    while (this._conditionDiv.firstChild) {
      this._conditionDiv.removeChild(this._conditionDiv.firstChild);
    }

    // Loop through each of the condition data and create the element
    for (let conditionData of val) {
      this.addCondition(conditionData);
    }
  }

  /**
   * @precondition data property of this object must have been set
   * @param {FilterConditionData} val
   */
  addCondition(val) {
    var newCondition = document.createElement("filter-condition");
    newCondition.data = this._data;

    if (val != undefined) {
      newCondition.setCondition(val);
    }
    this._conditionDiv.appendChild(newCondition);

    newCondition.addEventListener("remove", () => {
      this._conditionDiv.removeChild(newCondition);
    });
  }
}

customElements.define("filter-condition-group", FilterConditionGroup);