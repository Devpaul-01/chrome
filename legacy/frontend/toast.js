// Polyfill for Object.create if it doesn't exist
if (typeof Object.create !== "function") {
    Object.create = function (proto) {
      function F() {}
      F.prototype = proto;
      return new F();
    };
  }
  
  (function ($, window, document, undefined) {
    "use strict";
  
    const Toast = {
      // Valid position classes for the toast
      _positionClasses: [
        "bottom-left",
        "bottom-right",
        "top-right",
        "top-left",
        "bottom-center",
        "top-center",
        "mid-center",
      ],
  
      // Default icons for the toast
      _defaultIcons: ["success", "error", "info", "warning"],
  
      // Initialize the toast with options
      init: function (options, defaultOptions) {
        this.prepareOptions(options, defaultOptions);
        this.process();
      },
  
      // Prepare and merge options
      prepareOptions: function (options, defaultOptions) {
        if (typeof options === "string" || options instanceof Array) {
          this.options = { text: options };
        } else {
          this.options = $.extend({}, defaultOptions, options);
        }
      },
  
      // Process the toast: setup, add to DOM, position, bind events, and animate
      process: function () {
        this.setup();
        this.addToDom();
        this.position();
        this.bindToast();
        this.animate();
      },
  
      // Setup the toast HTML and styles
      setup: function () {
        let content = "";
  
        // Create the toast element if it doesn't exist
        this._toastEl = this._toastEl || $("<div></div>", {
          class: "jq-toast-single",
        });
  
        // Add loader
        content += '<span class="jq-toast-loader"></span>';
  
        // Add close button if allowed
        if (this.options.allowToastClose) {
          content += '<span class="close-jq-toast-single">&times;</span>';
        }
  
        // Add heading and text content
        if (this.options.text instanceof Array) {
          if (this.options.heading) {
            content += `<h2 class="jq-toast-heading">${this.options.heading}</h2>`;
          }
          content += '<ul class="jq-toast-ul">';
          this.options.text.forEach((text, i) => {
            content += `<li class="jq-toast-li" id="jq-toast-item-${i}">${text}</li>`;
          });
          content += "</ul>";
        } else {
          if (this.options.heading) {
            content += `<h2 class="jq-toast-heading">${this.options.heading}</h2>`;
          }
          content += this.options.text;
        }
  
        // Set the content and styles
        this._toastEl.html(content);
  
        if (this.options.bgColor !== false) {
          this._toastEl.css("background-color", this.options.bgColor);
        }
  
        if (this.options.textColor !== false) {
          this._toastEl.css("color", this.options.textColor);
        }
  
        if (this.options.textAlign) {
          this._toastEl.css("text-align", this.options.textAlign);
        }
  
        // Add icon if specified
        if (this.options.icon !== false) {
          this._toastEl.addClass("jq-has-icon");
          if (this._defaultIcons.includes(this.options.icon)) {
            this._toastEl.addClass(`jq-icon-${this.options.icon}`);
          }
        }
  
        // Add custom class if specified
        if (this.options.class !== false) {
          this._toastEl.addClass(this.options.class);
        }
      },
  
      // Position the toast on the screen
      position: function () {
        if (
          typeof this.options.position === "string" &&
          this._positionClasses.includes(this.options.position)
        ) {
          switch (this.options.position) {
            case "bottom-center":
              this._container.css({
                left: $(window).outerWidth() / 2 - this._container.outerWidth() / 2,
                bottom: 20,
              });
              break;
            case "top-center":
              this._container.css({
                left: $(window).outerWidth() / 2 - this._container.outerWidth() / 2,
                top: 20,
              });
              break;
            case "mid-center":
              this._container.css({
                left: $(window).outerWidth() / 2 - this._container.outerWidth() / 2,
                top: $(window).outerHeight() / 2 - this._container.outerHeight() / 2,
              });
              break;
            default:
              this._container.addClass(this.options.position);
          }
        } else if (typeof this.options.position === "object") {
          this._container.css({
            top: this.options.position.top || "auto",
            bottom: this.options.position.bottom || "auto",
            left: this.options.position.left || "auto",
            right: this.options.position.right || "auto",
          });
        } else {
          this._container.addClass("bottom-left");
        }
      },
  
      // Bind event listeners to the toast
      bindToast: function () {
        const self = this;
  
        // Trigger afterShown event
        this._toastEl.on("afterShown", function () {
          self.processLoader();
        });
  
        // Handle close button click
        this._toastEl.find(".close-jq-toast-single").on("click", function (e) {
          e.preventDefault();
          self.hideToast();
        });
  
        // Bind custom event handlers
        if (typeof this.options.beforeShow === "function") {
          this._toastEl.on("beforeShow", function () {
            self.options.beforeShow(self._toastEl);
          });
        }
  
        if (typeof this.options.afterShown === "function") {
          this._toastEl.on("afterShown", function () {
            self.options.afterShown(self._toastEl);
          });
        }
  
        if (typeof this.options.beforeHide === "function") {
          this._toastEl.on("beforeHide", function () {
            self.options.beforeHide(self._toastEl);
          });
        }
  
        if (typeof this.options.afterHidden === "function") {
          this._toastEl.on("afterHidden", function () {
            self.options.afterHidden(self._toastEl);
          });
        }
  
        if (typeof this.options.onClick === "function") {
          this._toastEl.on("click", function () {
            self.options.onClick(self._toastEl);
          });
        }
      },
  
      // Add the toast to the DOM
      addToDom: function () {
        let container = $(".jq-toast-wrap");
  
        if (container.length === 0) {
          container = $("<div></div>", {
            class: "jq-toast-wrap",
            role: "alert",
            "aria-live": "polite",
          });
          $("body").append(container);
        } else if (this.options.stack && !isNaN(parseInt(this.options.stack, 10))) {
          container.empty();
        }
  
        // Remove hidden toasts
        container.find(".jq-toast-single:hidden").remove();
  
        // Append the new toast
        container.append(this._toastEl);
  
        // Handle stacking
        if (this.options.stack && !isNaN(parseInt(this.options.stack, 10))) {
          const excessToasts =
            container.find(".jq-toast-single").length - this.options.stack;
          if (excessToasts > 0) {
            container.find(".jq-toast-single").slice(0, excessToasts).remove();
          }
        }
  
        this._container = container;
      },
  
      // Check if the toast can auto-hide
      canAutoHide: function () {
        return (
          this.options.hideAfter !== false &&
          !isNaN(parseInt(this.options.hideAfter, 10))
        );
      },
  
      // Process the loader animation
      processLoader: function () {
        if (!this.canAutoHide() || this.options.loader === false) return false;
  
        const loader = this._toastEl.find(".jq-toast-loader");
        const duration = (this.options.hideAfter - 400) / 1000 + "s";
        const loaderBg = this.options.loaderBg;
        let style = loader.attr("style") || "";
  
        style = style.substring(0, style.indexOf("-webkit-transition"));
        style += `
          -webkit-transition: width ${duration} ease-in;
          -o-transition: width ${duration} ease-in;
          transition: width ${duration} ease-in;
          background-color: ${loaderBg};
        `;
  
        loader.attr("style", style).addClass("jq-toast-loaded");
      },
  
      // Animate the toast
      animate: function () {
        const self = this;
  
        this._toastEl.hide();
        this._toastEl.trigger("beforeShow");
  
        switch (this.options.showHideTransition.toLowerCase()) {
          case "fade":
            this._toastEl.fadeIn(function () {
              self._toastEl.trigger("afterShown");
            });
            break;
          case "slide":
            this._toastEl.slideDown(function () {
              self._toastEl.trigger("afterShown");
            });
            break;
          default:
            this._toastEl.show(function () {
              self._toastEl.trigger("afterShown");
            });
        }
  
        // Auto-hide the toast if enabled
        if (this.canAutoHide()) {
          setTimeout(function () {
            self.hideToast();
          }, this.options.hideAfter);
        }
      },
  
      // Hide the toast
      hideToast: function () {
        const self = this;
  
        this._toastEl.trigger("beforeHide");
  
        switch (this.options.showHideTransition.toLowerCase()) {
          case "fade":
            this._toastEl.fadeOut(function () {
              self._toastEl.trigger("afterHidden");
            });
            break;
          case "slide":
            this._toastEl.slideUp(function () {
              self._toastEl.trigger("afterHidden");
            });
            break;
          default:
            this._toastEl.hide(function () {
              self._toastEl.trigger("afterHidden");
            });
        }
      },
  
      // Reset all toasts or a specific toast
      reset: function (scope) {
        if (scope === "all") {
          $(".jq-toast-wrap").remove();
        } else {
          this._toastEl.remove();
        }
      },
  
      // Update the toast with new options
      update: function (options) {
        this.prepareOptions(options, this.options);
        this.setup();
        this.bindToast();
      },
  
      // Programmatically close the toast
      close: function () {
        this._toastEl.find(".close-jq-toast-single").click();
      },
    };
  
    // Extend jQuery with the toast plugin
    $.toast = function (options) {
      const toast = Object.create(Toast);
      toast.init(options, this);
      return {
        reset: function (scope) {
          toast.reset(scope);
        },
        update: function (options) {
          toast.update(options);
        },
        close: function () {
          toast.close();
        },
      };
    };
  
    // Default options for the toast
    $.toast.options = {
      text: "",
      heading: "",
      showHideTransition: "fade",
      allowToastClose: true,
      hideAfter: 3000,
      loader: true,
      loaderBg: "#9EC600",
      stack: 5,
      position: "bottom-left",
      bgColor: false,
      textColor: false,
      textAlign: "left",
      icon: false,
      beforeShow: function () {},
      afterShown: function () {},
      beforeHide: function () {},
      afterHidden: function () {},
      onClick: function () {},
    };
  })(jQuery, window, document);