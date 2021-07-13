/* Class with methods return input types with preset values for editing.*/
class AttributesData {
    constructor({projectId, typeName, typeId, selectedData}) {
      // Feature-related class(es) to customize form element. Applies to all elements.
      this.projectId = projectId;
      this.typeName = typeName;
      this.typeId = typeId;
      this.selectedData = selectedData;

      this.responseMessage = "";
    }

    _fetchPostPromise({formData = null } = {}){
        console.log("Attribute Clone Post Fetch");
    
        if(formData != null){
          return fetch("/rest/AttributeType/"+this.typeId, {
            method: "POST",
            mode: "cors",
            credentials: "include",
            headers: {
              "X-CSRFToken": getCookie("csrftoken"),
              "Accept": "application/json",
              "Content-Type": "application/json"
            },
            body: JSON.stringify(formData)
          });
        } else {
          console.log("Problem with new attribute form data.");
        }
      }
  
    createClones() {
      //create form data & post promise array for the attribute forms, and submit
      this.successMessages = "";
      this.failedMessages = "";
      let promise = Promise.resolve();
  
      for(let data of this.selectedData){
        let cloneValue = JSON.parse(data); //parse data attribute

        // console.log("cloneValue");
        // console.log(cloneValue);

        this.attributeForm = new AttributesForm();
        this.attributeForm._getFormWithValues({clone : true, ...cloneValue});
        let formJSON = {
          "entity_type": this.typeName,
          "addition": this.attributeForm._getAttributeFormData()
        };

        promise = promise.then(() => {return this._fetchPostPromise({
          "formData" : formJSON
        });})
        .then(response => response.json().then(data => ({response: response, data: data})))
        .then(obj => {
          let currentMessage = obj.data.message;
          let succussIcon = document.createElement("modal-success");
          let warningIcon = document.createElement("modal-warning");
          let iconWrap = document.createElement("span");
          if(obj.response.ok){
            iconWrap.appendChild(succussIcon);
            this.successMessages += `${iconWrap.innerHTML} ${currentMessage}<br/><br/>`;
          } else {
            iconWrap.appendChild(warningIcon);
            this.failedMessages += `${iconWrap.innerHTML} ${currentMessage}<br/><br/>`;
          }
        });
      }
      promise = promise.then(() => {return this.successMessages + this.failedMessages;});
      return promise;
    }
  
}
  
