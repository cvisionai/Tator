/**
 * Element used to encapsulate the filter modal dialog.
 */
class FilterDialog extends ModalDialog {

  constructor()
  {
    super();

    this._div.setAttribute("class", "modal-wrap modal-extra-wide d-flex");
    this._modal.setAttribute("class", "modal py-6 px-6 rounded-2");
    this._header.setAttribute("class", "px-3 py-3");
    this._titleDiv.setAttribute("class", "h2");
    this._title.nodeValue = "Apply filter conditions";
    this._titleDiv.style.marginBottom = "10px";
    this._main.remove();

    this._conditionsDiv = document.createElement("div");
    this._conditionsDiv.setAttribute("class", "analysis__filter_conditions_list");
    this._header.appendChild(this._conditionsDiv);

    const apply = document.createElement("button");
    apply.setAttribute("class", "btn btn-clear");
    apply.textContent = "Apply Filter";
    this._footer.appendChild(apply);

    const cancel = document.createElement("button");
    cancel.setAttribute("class", "btn btn-clear btn-charcoal");
    cancel.textContent = "Cancel";
    this._footer.appendChild(cancel);

    this._data = null;

    /**
     * Event handlers
     */

    // Handler when user hits the apply button.
    apply.addEventListener("click", () => {
      this.dispatchEvent(new Event("newFilterSet"));
    });

    // Handler when user hits the cancel button.
    cancel.addEventListener("click", () => {
      this.dispatchEvent(new Event("close"));
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
  set data(val)
  {
    if (this._data != null)
    {
      console.warn("filter-dialog already binded with a dataset");
    }

    this._data = val;

    // Set the GUI elements
    this._filterConditionGroup = document.createElement("filter-condition-group");
    this._filterConditionGroup.data = this._data;
    this._filterConditionGroup._div.style.marginTop = "10px";
    this._conditionsDiv.appendChild(this._filterConditionGroup);
  }

  /**
   * @returns {array} - Array of condition objects requested by the user.
   */
  getConditions() {
    return this._filterConditionGroup.getConditions();
  }

  /**
   * Sets the conditions based on the provided info
   * @param {array} val - List of FilterConditionData objects
   */
  setConditions(val) {
    this._filterConditionGroup.setConditions(val);
  }
}

customElements.define("filter-dialog", FilterDialog);