class UserInput extends TatorElement {
  constructor() {
    super();

    const label = document.createElement("label");
    label.setAttribute("class", "d-flex flex-justify-between flex-items-center py-1");
    this._shadow.appendChild(label);

    this._name = document.createTextNode("");
    label.appendChild(this._name);

    const div = document.createElement("div");
    div.setAttribute("class", "d-flex flex-column col-8");
    label.appendChild(div);

    this._input = document.createElement("input");
    this._input.setAttribute("class", "form-control input-sm col-12");
    this._input.setAttribute("type", "text");
    this._input.setAttribute("placeholder", "Enter semicolon delimited usernames or email addresses...");
    div.appendChild(this._input);

    const div1 = document.createElement("div");
    div1.setAttribute("class", "d-flex flex-row");
    this._shadow.appendChild(div1);

    const div2 = document.createElement("div");
    div2.setAttribute("class", "col-4");
    div1.appendChild(div2);

    const div3 = document.createElement("div");
    div3.setAttribute("class", "d-flex flex-column")
    div1.appendChild(div3);

    this._pills = document.createElement("div");
    this._pills.setAttribute("class", "py-3 d-flex flex-column");
    div3.appendChild(this._pills);

    this._errors = document.createElement("ul");
    div3.appendChild(this._errors);

    this._input.addEventListener("input", () => {
      const value = this._input.value;
      if (value.indexOf(";") > -1) {
        const usernames = value.split(";");
        usernames.pop();
        this._data.findUsers(usernames);
        this._input.value = "";
      }
    });

    this._input.addEventListener("change", () => {
      const value = this._input.value;
      if (value.length > 0) {
        this._data.findUsers([value]);
        this._input.value = "";
      }
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

  set permission(val) {
    if (hasPermission(val, "Can Edit")) {
      this._input.removeAttribute("readonly");
      this._input.classList.remove("disabled");
    } else {
      this._input.setAttribute("readonly", "");
      this._input.classList.add("disabled");
    }
  }

  init(data) {
    // Initialize with a UserData object.
    this._data = data;
    this._data.addEventListener("users", evt => {
      const users = evt.detail.users;
      const pillIds = [];
      // Remove pills that are no longer in the list.
      for (const pill of this._pills.children) {
        if (!users.has(pill.getId())) {
          this._pills.removeChild(pill);
        }
      }
      // Get list of remaining IDs.
      for (const pill of this._pills.children) {
        if (users.has(pill.getId())) {
          pillIds.push(pill.getId());
        }
      }
      // Create pills for any IDs that don't exist.
      for (const [userId, user] of users.entries()) {
        if (!pillIds.includes(userId)) {
          const name = user.first_name ? `${user.first_name} ${user.last_name}` : user.username;
          this._addPill(name, user.id);
        }
      }
      // Clear error messages.
      while (this._errors.firstChild) {
        this._errors.removeChild(this._errors.firstChild);
      }
      // Add error messages.
      if (evt.detail.missing) {
        for (const missing of evt.detail.missing) {
          this._addError(`Could not find user for ${missing}!`);
        }
      }
    });
  }

  reset() {
    // Go back to default value
    this._input.setValue("");
  }

  _addPill(name, userId) {
    const pill = document.createElement("removable-pill");
    pill.setAttribute("class", "py-1 d-flex");
    pill.init(name, userId);
    this._pills.appendChild(pill);
    pill.addEventListener("removeId", evt => {
      this._data.removeUser(evt.detail.id);
    });
  }

  _addError(msg) {
    const li = document.createElement("li");
    this._errors.appendChild(li);

    const h3 = document.createElement("h3");
    h3.setAttribute("class", "h3 text-red");
    h3.textContent = msg;
    li.appendChild(h3);
  }

}

customElements.define("user-input", UserInput);
