class DateTimeInput extends TatorElement {
   constructor() {
      super();

      // DATETIME INPUT
      this.label = document.createElement("label");
      this.label.setAttribute("class", "d-flex flex-justify-between flex-items-center py-1");
      this._shadow.appendChild(this.label);

      const labelInner = document.createElement("span");
      labelInner.setAttribute("class", "col-3");
      this.label.appendChild(labelInner);

      this._name = document.createTextNode("");
      labelInner.appendChild(this._name);

      this._input = document.createElement("input");
      this._input.setAttribute("class", "form-control input-sm col-12");
      this._input.setAttribute("type", "datetime-local");
      this._input.setAttribute("step", ".1");
      this.label.appendChild(this._input);

      this._input.addEventListener("change", () => {
         if (this.getValue() === null) {
            this._input.classList.add("has-border");
            this._input.classList.add("is-invalid");
         } else {
            this._input.classList.remove("has-border");
            this._input.classList.remove("is-invalid");
         }
         this.dispatchEvent(new Event("change"));
      });

      this._input.addEventListener("focus", () => {
         document.body.classList.add("shortcuts-disabled");
      });

      this._input.addEventListener("blur", () => {
         document.body.classList.remove("shortcuts-disabled");
      });
   }

   static get observedAttributes() {
      return ["name"];
   }

   attributeChangedCallback(name, oldValue, newValue) {
      switch (name) {
         case "name":
            this._name.nodeValue = newValue;
            break;
      }
   }

   // Permission for datetime only
   set permission(val) {
      if (hasPermission(val, "Can Edit")) {
         this._input.removeAttribute("readonly");
         this._input.classList.remove("disabled");
      } else {
         this._input.setAttribute("readonly", "");
         this._input.classList.add("disabled");
      }
   }

   set default(val) {
      // Value should be the deafult ISO string
      this._default = val;
   }

   changed() {
      // #todo datetime cuts off miliseconds to 3 points, may need to account for this looking like a change here?
      return this.getValue() !== this._default;
   }

   reset() {
      // Go back to default value
      if (typeof this._default !== "undefined") {
         this.setValue(this._default);
      } else {
         this.setValue("");
      }
   }

   getValue() {
      let val = this._input.value;

      if (val === null || val === "" || isNaN(new Date(val).getTime())) {
         val = null;
      } else {
         let utcString = val + 'Z';
         let date = new Date(utcString);

         val = date.toISOString();
      }
      return val;
   }

   setValue(val) {
      // assume any incoming value (not null, or "") is in ISO format
      if (val === null || val === "" || isNaN(new Date(val).getTime())) {
         val = null;
      } else {
         let date = new Date(val);
         let minuteWithOffset = (date.getMinutes() + date.getTimezoneOffset());
         date.setMinutes(minuteWithOffset);
         //console.log(date.toString());

         let year = date.getFullYear();
         let month = (Number(date.getMonth()) + 1).toLocaleString('en-US', {
            minimumIntegerDigits: 2,
            useGrouping: false
         });
         let day = date.getDate().toLocaleString('en-US', {
            minimumIntegerDigits: 2,
            useGrouping: false
         });
         let hours = date.getHours().toLocaleString('en-US', {
            minimumIntegerDigits: 2,
            useGrouping: false
         });
         let minutes = date.getMinutes().toLocaleString('en-US', {
            minimumIntegerDigits: 2,
            useGrouping: false
         });
         let seconds = date.getSeconds().toLocaleString('en-US', {
            minimumIntegerDigits: 2,
            useGrouping: false
         });
         let milliseconds = date.getMilliseconds().toLocaleString('en-US', {
            minimumIntegerDigits: 3,
            useGrouping: false
         });

         let dateToString = `${year}-${month}-${day}T${hours}:${minutes}:${seconds}.${milliseconds}`;

         val = dateToString;
      }
      //console.log(val);
      this._input.value = val;
   }

   // set autocomplete(config) {
   //    TatorAutoComplete.enable(this._input, config);
   // }
}

customElements.define("datetime-input", DateTimeInput);
