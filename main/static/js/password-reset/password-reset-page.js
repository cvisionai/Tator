class PasswordResetPage extends TatorElement {
  constructor() {
    super();

    const main = document.createElement("main");
    main.setAttribute("class", "layout-max py-4");
    this._shadow.appendChild(main);

    const div = document.createElement("div");
    div.setAttribute("class", "main__header d-flex flex-column flex-items-center flex-justify-center py-6");
    main.appendChild(div);

    const img = document.createElement("img");
    img.setAttribute("class", "py-4");
    img.setAttribute("src", "/static/images/tator-logo.png");
    img.setAttribute("width", "400");
    div.appendChild(img);

    const h1 = document.createElement("h1");
    h1.setAttribute("class", "h1");
    div.appendChild(h1);

    const h1Text = document.createTextNode("Enter a new password");
    h1.appendChild(h1Text);

    const form = document.createElement("form");
    form.setAttribute("class", "new-project__form rounded-2 py-3 px-6");
    form.setAttribute("style", "width:500px");
    main.appendChild(form);

    this._password = document.createElement("text-input");
    this._password.setAttribute("name", "Password");
    this._password.setAttribute("type", "password");
    form.appendChild(this._password);

    this._passwordConfirm = document.createElement("text-input");
    this._passwordConfirm.setAttribute("name", "Password (confirm)");
    this._passwordConfirm.setAttribute("type", "password");
    form.appendChild(this._passwordConfirm);

    const footer = document.createElement("div");
    footer.setAttribute("class", "modal__footer d-flex py-3");
    form.appendChild(footer);

    this._submit = document.createElement("input");
    this._submit.setAttribute("class", "btn btn-clear");
    this._submit.setAttribute("type", "submit");
    this._submit.setAttribute("disabled", "");
    this._submit.setAttribute("value", "Reset password");
    footer.appendChild(this._submit);

    const errors = document.createElement("div");
    errors.setAttribute("class", "main__header d-flex flex-column flex-items-center flex-justify-center py-6");
    main.appendChild(errors);

    this._errorList = document.createElement("ul");
    this._errorList.setAttribute("class", "form-errors");
    errors.appendChild(this._errorList);

    this._dimmer = document.createElement("div");
    this._dimmer.setAttribute("class", "background-dimmer");
    this._shadow.appendChild(this._dimmer);

    // Whether the form is valid or not
    this._valid = false;

    this._password.addEventListener("change", evt => this._validateForm(evt));
    this._passwordConfirm.addEventListener("input", evt => this._validateForm(evt));

    this._modalNotify = document.createElement("modal-notify");
    div.appendChild(this._modalNotify);
    this._modalNotify.addEventListener("close", evt => {
      this.removeAttribute("has-open-modal", "");
    });

    form.addEventListener("submit", evt => {
      evt.preventDefault();
      let user_id = 0;
      const body = {
        password: this._password.getValue(),
      };
      const params = new URLSearchParams(window.location.search);
      if (params.has("reset_token")) {
        body.reset_token = params.get("reset_token");
      }
      if (params.has("user")) {
        user_id = params.get("user");
      }
      fetch(`/rest/User/${user_id}`, {
        method: "PATCH",
        credentials: "same-origin",
        headers: {
          "X-CSRFToken": getCookie("csrftoken"),
          "Accept": "application/json",
          "Content-Type": "application/json"
        },
        body: JSON.stringify(body),
      })
      .then(response => {
        if (response.status == 400) {
          return response.json();
        } else {
          return Promise.resolve("success");
        }
      })
      .then(data => {
        if (data == "success") {
          this._modalNotify.init("Password reset succeeded!",
                                 "Press Continue to go to login screen.",
                                 "ok",
                                 "Continue");
          this._modalNotify.addEventListener("close", evt => {
            window.location.replace("/accounts/login");
          });
        } else {
          this._modalNotify.init("Password reset failed!",
                                 data.message,
                                 "error",
                                 "Close");
        }
        this._modalNotify.setAttribute("is-open", "");
        this.setAttribute("has-open-modal", "");
      })
    });
  }

  static get observedAttributes() {
    return ["has-open-modal"];
  }

  attributeChangedCallback(name, oldValue, newValue) {
    switch (name) {
      case "has-open-modal":
        if (newValue === null) {
          this._dimmer.classList.remove("has-open-modal");
        } else {
          this._dimmer.classList.add("has-open-modal");
        }
        break;
    }
  }

  _addError(msg) {
    const li = document.createElement("li");
    this._errorList.appendChild(li);

    const h3 = document.createElement("h3");
    h3.setAttribute("class", "h3 text-red");
    h3.setAttribute("style", "text-align:center;width:400px");
    h3.textContent = msg;
    li.appendChild(h3);
  }

  _validatePassword() {
    const password = this._password.getValue();
    if (password.length == 0) {
      this._valid = false;
    } else if (password.length < 8) {
      this._addError("Password must be at least 8 characters long.");
      this._valid = false;
    }
  }

  _validatePasswordConfirm() {
    const password = this._password.getValue();
    const passwordConfirm = this._passwordConfirm.getValue();
    if (passwordConfirm.length == 0) {
      this._valid = false;
    } else if (password != passwordConfirm) {
      this._addError("Passwords do not match.");
      this._valid = false;
    }
  }

  _validateForm(evt) {
    this._valid = true;

    // Clear errors
    while (this._errorList.firstChild) {
      this._errorList.removeChild(this._errorList.firstChild);
    }

    // Check each field
    this._validatePassword();
    this._validatePasswordConfirm();

    // Enable/disable password reset button
    if (this._valid) {
      this._submit.removeAttribute("disabled");
    } else {
      this._submit.setAttribute("disabled", "");
    }
  }
}

customElements.define("password-reset-page", PasswordResetPage);
