/**
 * Element used to encapsulate a filtering condition
 */
class FilterCondition extends TatorElement {

  constructor() {
    super();

    this._div = document.createElement("div");
    this._div.setAttribute("class", "analysis__filter_field_border d-flex flex-items-center flex-grow text-gray f2");
    this._shadow.appendChild(this._div);

    this._category = document.createElement("enum-input");
    this._category.setAttribute("class", "col-4");
    this._category.setAttribute("name", "Category");
    this._category.style.marginLeft = "15px";
    this._div.appendChild(this._category);

    this._fieldName = document.createElement("enum-input");
    this._fieldName.setAttribute("class", "col-4");
    this._fieldName.setAttribute("name", "Field");
    this._fieldName.style.marginLeft = "15px";
    this._fieldName.permission = "View Only";
    this._div.appendChild(this._fieldName);

    this._modifier = document.createElement("enum-input");
    this._modifier.setAttribute("class", "col-4");
    this._modifier.style.marginLeft = "15px";
    this._modifier.setAttribute("name", "Modifier");
    this._modifier.permission = "View Only";
    this._div.appendChild(this._modifier);

    this._value = document.createElement("text-input");
    this._value.setAttribute("class", "col-4");
    this._value.style.marginLeft = "15px";
    this._value.setAttribute("name", "Value");
    this._value.permission = "View Only";
    this._div.appendChild(this._value);

    this._valueBool = document.createElement("enum-input");
    this._valueBool.setAttribute("class", "col-4");
    this._valueBool.style.marginLeft = "15px";
    this._valueBool.setAttribute("name", "Value");
    this._valueBool.permission = "View Only";
    this._valueBool.choices = [{"value": "true"}, {"value": "false"}];
    this._valueBool.style.display = "none";
    this._div.appendChild(this._valueBool);

    this._valueEnum = document.createElement("enum-input");
    this._valueEnum.setAttribute("class", "col-4");
    this._valueEnum.style.marginLeft = "15px";
    this._valueEnum.setAttribute("name", "Value");
    this._valueEnum.permission = "View Only";
    this._valueEnum.style.display = "none";
    this._div.appendChild(this._valueEnum);

    var removeButton = document.createElement("entity-delete-button");
    removeButton.style.marginLeft = "15px";
    removeButton.style.marginRight = "8px";
    this._div.appendChild(removeButton);

    this._data = [];
    this._currentTypes = [];

    /*
    * Event handlers
    */

    // Dispatch remove event if the remove button was pressed
    removeButton.addEventListener("click", () => {
      this.dispatchEvent(new Event("remove"));
    });

    // Adjust the field name based on the selected field
    this._category.addEventListener("change", this._userSelectedCategory.bind(this));

    // Adjust the modifier based on the selected field
    this._fieldName.addEventListener("change", this._userSelectedField.bind(this));

    // Set the value field based on the modifier
    this._modifier.addEventListener("change", this._userSelectedModifier.bind(this));
  }

  _userSelectedCategory() {
    // Remove existing choices
    this._fieldName.clear();
    this._modifier.clear();
    this._value.setValue("");

    // Create the menu options for the field name
    var fieldChoices = [];
    var uniqueFieldChoices = [];
    this._currentTypes = [];

    for (const attributeType of this._data)
    {
      if (attributeType.typeGroupName == this._category.getValue())
      {
        for (const attribute of attributeType.attribute_types)
        {
          if (uniqueFieldChoices.indexOf(attribute.name) < 0) {
            fieldChoices.push({"value": attribute.name});
            uniqueFieldChoices.push(attribute.name);
          }
        }
        this._currentTypes.push(attributeType);
      }
    }

    this._fieldName.choices = fieldChoices;
    this._fieldName.permission = "Can Edit";
    this._fieldName.selectedIndex = -1;
    this._modifier.permission = "View Only";
    this._value.permission = "View Only";
    this._valueBool.permission = "View Only";
    this._valueEnum.permission = "View Only";
    this._userSelectedField();
  }

  _userSelectedField() {
    // Remove existing choices for the modifier and clear the value
    this._modifier.clear();
    this._valueEnum.clear();
    this._value.setValue("");

    let selectedFieldName = this._fieldName.getValue();
    var dtype = "string";
    var selectedAttributeType;

    var uniqueFieldChoices = [];

    for (const currentType of this._currentTypes) {
      for (const attribute of currentType.attribute_types) {
        if (attribute.name == selectedFieldName) {
          selectedAttributeType = attribute;
          dtype = attribute.dtype;
          if (dtype == "enum") {
            let enumChoices = [];
            for (let choice of attribute.choices) {
              if (uniqueFieldChoices.indexOf(choice) < 0) {
                enumChoices.push({"value": choice});
                uniqueFieldChoices.push(choice);
              }
            }
            this._valueEnum.choices = enumChoices;
          }
          break;
        }
      }
    }

    this._currentDtype = dtype;
    this._modifier.choices = FilterUtilities.getModifierChoices(selectedAttributeType);
    this._modifier.permission = "Can Edit";
    this._modifier.selectedIndex = -1;
    this._userSelectedModifier();
  }

  _userSelectedModifier() {
    const modifier = this._modifier.getValue();

    this._value.style.display = "block";
    this._valueBool.style.display = "none";
    this._valueEnum.style.display = "none";

    if (this._currentDtype == "enum" && modifier == "==") {
      this._value.style.display = "none";
      this._valueBool.style.display = "none";
      this._valueEnum.style.display = "block";
    }
    else if (this._currentDtype == "bool") {
      this._value.style.display = "none";
      this._valueBool.style.display = "block";
      this._valueEnum.style.display = "none";
    }

    this._value.permission = "Can Edit";
    this._valueBool.permission = "Can Edit";
    this._valueEnum.permission = "Can Edit";
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

    // Reset the type choices to the given data
    this._category.clear();

    var choices = [];
    var uniqueCategories = [];
    this._categoryMap = {};
    for (const attributeType of this._data)
    {
      if (uniqueCategories.indexOf(attributeType.typeGroupName) < 0) {
        choices.push({"value": attributeType.typeGroupName});
        uniqueCategories.push(attributeType.typeGroupName);
      }
      this._categoryMap[attributeType.name] = attributeType.typeGroupName;
    }
    this._category.choices = choices;
    this._category.selectedIndex = -1;
    this._currentTypes = [];
    this._userSelectedCategory();
  }

  /**
   * @returns {FilterConditionData} Object containing the selected filter condition rule info.
   *                                null if there's an error (e.g. missing information)
   */
  getCondition() {

    // #TODO remove try/catch and change getValue to return null if enum selection didn't occur
    try {
      const category = this._category.getValue();
      const field = this._fieldName.getValue();
      const modifier = this._modifier.getValue();
      var value = this._value.getValue();
      var condition = null;

      if (this._valueBool.style.display == "block")
      {
        value = this._valueBool.getValue();
      }
      else if (this._valueEnum.style.display == "block")
      {
        value = this._valueEnum.getValue();
      }

      if (category && field && modifier && value)
      {
        // #TODO We will need to revisit this. For now, just pick a type that matches
        //       the group. It should still work because of how tator-data.js works.
        var entityTypeName;
        for (const attributeTypeName in this._categoryMap) {
          if (this._categoryMap[attributeTypeName] == category) {
            entityTypeName = attributeTypeName;
            break;
          }
        }

        condition = new FilterConditionData(entityTypeName, field, modifier, value, category);
      }

      return condition;
    }
    catch (error) {
      return null;
    }
  }

  /**
   * @precondition data property of this object must have been set
   * @param {FilterConditionData} val - Data to set the fields to. These must conform
   *                                    to the dataTypes.
   */
  setCondition(val) {

    // #TODO Add error handling
    this._category.setValue(val.categoryGroup);
    this._userSelectedCategory();

    this._fieldName.setValue(val.field);
    this._userSelectedField();

    this._modifier.setValue(val.modifier);
    this._userSelectedModifier();

    if (this._value.style.display == "block") {
      this._value.setValue(val.value);
    }
    if (this._valueBool.style.display == "block") {
      this._valueBool.setValue(val.value);
    }
    if (this._valueEnum.style.display == "block") {
      this._valueEnum.setValue(val.value);
    }
  }
}

customElements.define("filter-condition", FilterCondition);