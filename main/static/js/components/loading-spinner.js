class LoadingSpinner {
    constructor(){
        this.img = document.createElement("img");
        this.img.setAttribute("class", "loading");
        this.img.setAttribute("src", "/static/images/tator_loading.gif");
        this.img.style.display = "none";
    }

    getImg(){
        return this.img;
    }

    showSpinner(){
        return this.img.style.display = "block";
    }

    hideSpinner(){
        return this.img.style.display = "none";
    }
} 