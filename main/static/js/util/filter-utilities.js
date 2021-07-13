/**
 * Class used to encapsulate a condition for the data filtering interface
 */
class FilterConditionData {

  /**
   * Note: There is no error checking (e.g. checking for nulls)
   * @param {string} category
   * @param {string} field
   * @param {string} modifier
   * @param {string} value
   * @param {string} categoryGroup
   */
  constructor (category, field, modifier, value, categoryGroup) {
    this.category = category;
    this.field = field;
    this.modifier = modifier;
    this.value = value;
    this.categoryGroup = categoryGroup;
  }

  /**
   * @returns {string} String version of this object
   */
  getString() {
    return this.categoryGroup + ":" + this.field + " " + this.modifier + " " + this.value;
  }
}

/**
 * Library of utility functions related to the filtering of data
 */
class FilterUtilities {
  /**
   * @returns {array of objects} Valid modifier choices given the dtype
   *                             Stored within the value property of the object because this
   *                             syncs up with the enum-input javascript.
   */
  static getModifierChoices(selectedAttributeType) {

    var choices = [];
    var dtype = selectedAttributeType.dtype;

    // #TODO Add more options for the different dtypes
    if (selectedAttributeType.name == "_version" ||
        selectedAttributeType.name == "_section" ||
        selectedAttributeType.name == "_dtype") {
      choices.push({"value": "=="});
    }
    else if (dtype == "int" || dtype == "float") {
      choices.push({"value": "=="});
      choices.push({"value": ">"});
      choices.push({"value": ">="});
      choices.push({"value": "<"});
      choices.push({"value": "<="});
    }
    else if (dtype == "bool") {
      choices.push({"value": "=="});
    }
    else {
      choices.push({"value": "Includes"});
      choices.push({"value": "=="});
    }

    return choices;
  }
}
