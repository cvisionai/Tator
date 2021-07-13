class PasswordResetRequestPage extends TatorElement {
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

    const h1Text = document.createTextNode("Enter email to reset password");
    h1.appendChild(h1Text);

    const form = document.createElement("form");
    form.setAttribute("class", "new-project__form rounded-2 py-3 px-6");
    form.setAttribute("style", "width:500px");
    main.appendChild(form);

    this._email = document.createElement("text-input");
    this._email.setAttribute("name", "Email address");
    this._email.setAttribute("type", "email");
    form.appendChild(this._email);

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

    this._email.addEventListener("input", evt => this._validateForm(evt));

    this._modalNotify = document.createElement("modal-notify");
    div.appendChild(this._modalNotify);
    this._modalNotify.addEventListener("close", evt => {
      this.removeAttribute("has-open-modal", "");
    });

    form.addEventListener("submit", evt => {
      evt.preventDefault();
      const body = {
        email: this._email.getValue(),
      };
      fetch("/rest/PasswordReset", {
        method: "POST",
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
          this._modalNotify.init("Password reset request succeeded!",
                                 "Check your email for instructions to change password.",
                                 "ok",
                                 "Close");
          this._modalNotify.addEventListener("close", evt => {
            window.location.replace("/accounts/login");
          });
        } else {
          this._modalNotify.init("Password reset request failed!",
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

  _validateEmail() {
    const email = this._email.getValue();
    const re = /^(([^<>()[\]\\.,;:\s@\"]+(\.[^<>()[\]\\.,;:\s@\"]+)*)|(\".+\"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/;
    if (re.test(email)) {
      this._valid = true;
    } else {
      this._valid = false;
    }
    return Promise.resolve(this._valid);
  }

  _validateForm(evt) {
    this._valid = true;

    // Clear errors
    while (this._errorList.firstChild) {
      this._errorList.removeChild(this._errorList.firstChild);
    }

    // Check each field
    this._validateEmail()
    .then(() => {
      // Enable/disable reset button
      if (this._valid) {
        this._submit.removeAttribute("disabled");
      } else {
        this._submit.setAttribute("disabled", "");
      }
    });
  }
}

customElements.define("password-reset-request-page", PasswordResetRequestPage);
