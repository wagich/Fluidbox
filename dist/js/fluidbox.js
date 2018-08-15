var __values = (this && this.__values) || function (o) {
    var m = typeof Symbol === "function" && o[Symbol.iterator], i = 0;
    if (m) return m.call(o);
    return {
        next: function () {
            if (o && i >= o.length) o = void 0;
            return { value: o && o[i++], done: !o };
        }
    };
};
var __read = (this && this.__read) || function (o, n) {
    var m = typeof Symbol === "function" && o[Symbol.iterator];
    if (!m) return o;
    var i = m.call(o), r, ar = [], e;
    try {
        while ((n === void 0 || n-- > 0) && !(r = i.next()).done) ar.push(r.value);
    }
    catch (error) { e = { error: error }; }
    finally {
        try {
            if (r && !r.done && (m = i["return"])) m.call(i);
        }
        finally { if (e) throw e.error; }
    }
    return ar;
};
var __spread = (this && this.__spread) || function () {
    for (var ar = [], i = 0; i < arguments.length; i++) ar = ar.concat(__read(arguments[i]));
    return ar;
};
import throttle from "lodash-es/throttle";
import "events-polyfill/src/ListenerOptions.js";
function whichTransitionEvent() {
    var el = document.createElement("fakeelement");
    var transitions = {
        transition: "transitionend",
        OTransition: "oTransitionEnd",
        MozTransition: "transitionend",
        WebkitTransition: "webkitTransitionEnd"
    };
    for (var t in transitions) {
        if (el.style[t] !== undefined) {
            return transitions[t];
        }
    }
    return "transitionend";
}
function capitalize(s) {
    return s && s[0].toLowerCase() + s.slice(1);
}
function isVisible(element) {
    return !!(element.offsetWidth || element.offsetHeight || element.getClientRects().length);
}
var customTransitionEnd = whichTransitionEvent();
var defaultOptions = {
    immediateOpen: false,
    loader: false,
    maxWidth: 0,
    maxHeight: 0,
    resizeThrottle: 500,
    stackIndex: 1000,
    stackIndexDelta: 10,
    viewportFill: 0.95
};
var Fluidbox = /** @class */ (function () {
    function Fluidbox(element, options) {
        var _this = this;
        this.thumbnail = {
            element: document.createElement("img"),
            naturalWidth: 0,
            naturalHeight: 0,
            width: 0,
            height: 0
        };
        this.state = 0 /* Closed */;
        this.initialized = false;
        this.closeDelegate = function () { return _this.close(); };
        this.destroyDelegate = function () { return _this.destroy(); };
        this.resizeDelegate = function () {
            _this.measureElements();
            // Re-compute, but only for the active element
            if (_this.element.classList.contains("fluidbox--opened")) {
                _this.compute();
            }
        };
        this.clickDelegate = function (e) {
            e.preventDefault();
            e.stopPropagation();
            // Check state
            // If Fluidbox is closed, we open it
            if (_this.state === 0 /* Closed */) {
                _this.open();
            }
            else {
                _this.close();
            }
        };
        this.keydownDelegate = function (e) {
            // Trigger closing for ESC key
            if (e.keyCode === 27) {
                _this.close();
            }
        };
        this.transitionendEventDelegate = function () { return _this.element.dispatchEvent(new Event("openend" /* OpenEnd */)); };
        this.transitionendCloseDelegate = function () {
            _this.ghost.style.opacity = "0";
            _this.thumbnail.element.style.opacity = "1";
            if (_this.overlay != null) {
                _this.overlay.remove();
            }
            _this.wrapper.style.zIndex = (_this.settings.stackIndex - _this.settings.stackIndexDelta).toString();
        };
        if (!this.validateElement(element)) {
            throw new Error("Cannot create a fluidbox for this element.");
        }
        this.element = element;
        // Manipulate HTML5 dataset object
        // -  Format: data-fluidbox-(setting-name). When converted into camel case: fluidboxSettingName
        // - So, we will have to remove 'fluidbox' in the front, and change the first letter to lowercase
        var elementData = {};
        for (var key in this.element.dataset) {
            var capitalizedKey = capitalize(key.replace("fluidbox", ""));
            var value = this.element.dataset[key];
            // Only push non-empty keys (that are part of the Fluidbox HTML5 data- attributes) into new object
            if (key !== "" || key !== null) {
                // Coerce boolean values
                if (value == "false") {
                    value = false;
                }
                else if (value == "true") {
                    value = true;
                }
                elementData[key] = value;
            }
        }
        // Merge defaults into options, into dataset
        this.settings = Object.assign({}, defaultOptions, options, elementData);
        // Coerce settings
        this.settings.viewportFill = Math.max(Math.min(this.settings.viewportFill, 1), 0);
        if (this.settings.stackIndex < this.settings.stackIndexDelta) {
            this.settings.stackIndexDelta = this.settings.stackIndex;
        }
        // create resize delegate (need to do it here because the wait time depends on a config value)
        this.throttledResizeDelegate = throttle(this.resizeDelegate, this.settings.resizeThrottle);
        // Initialize
        this.init();
    }
    Fluidbox.prototype.validateElement = function (element) {
        // Only perform initialization when
        // + DOM checks are satisfied:
        // +-- An anchor element is selected
        // +-- Contains one and only one child
        // +-- The only child is an image element OR a picture element
        // +-- The element must not be hidden (itself or its parents)
        var isAnchor = element.tagName === "A";
        var hasOneChild = element.children.length === 1;
        var hasImageOrPictureChild = element.children[0].tagName === "IMG" || (element.children[0].tagName === "PICTURE" && element.querySelectorAll("img").length === 1);
        var parentsAndSelfVisible = true;
        var parentOrSelf = element;
        while (parentOrSelf != null) {
            parentsAndSelfVisible = parentsAndSelfVisible && isVisible(parentOrSelf);
            parentOrSelf = parentOrSelf.parentElement;
        }
        return isAnchor && hasOneChild && hasImageOrPictureChild && parentsAndSelfVisible && isVisible(element.children[0]);
    };
    Fluidbox.prototype.init = function () {
        var _this = this;
        if (!this.initialized) {
            // Initialize and store original node
            this.element.classList.remove("fluidbox--destroyed");
            this.initialized = true;
            this.originalNode = this.element.cloneNode(true);
            // Status: Fluidbox has been initialized
            this.element.classList.add("fluidbox--initialized");
            // DOM replacement
            this.setupDom();
            // Emit custom event
            this.element.dispatchEvent(new Event("init" /* Init */));
            // Wait for image to load, but only if image is not found in cache
            var preloader = new Image();
            if (this.thumbnail.element.offsetWidth > 0 && this.thumbnail.element.offsetHeight > 0) {
                // Thumbnail loaded from cache, let's prepare fluidbox
                this.prepare();
            }
            else {
                // Thumbnail loaded, let's prepare fluidbox
                preloader.onload = function () { return _this.prepare(); };
                preloader.onerror = function () { return _this.element.dispatchEvent(new Event("thumbloadfail" /* ThumbLoadFail */)); };
                preloader.src = this.thumbnail.element.getAttribute("src");
            }
        }
    };
    Fluidbox.prototype.open = function () {
        var _this = this;
        var e_1, _a;
        // Update state
        this.state = 1 /* Open */;
        // Forcibly turn off transition end detection,
        // otherwise users will get choppy transition if toggling between states rapidly
        this.ghost.removeEventListener(customTransitionEnd, this.transitionendEventDelegate);
        this.ghost.removeEventListener(customTransitionEnd, this.transitionendCloseDelegate);
        try {
            // Close all other Fluidbox instances
            for (var _b = __values(Array.from(document.querySelectorAll(".fluidbox--opened")).filter(function (e) { return e !== _this.element; })), _c = _b.next(); !_c.done; _c = _b.next()) {
                var element = _c.value;
                element.dispatchEvent(new Event("close" /* Close */));
            }
        }
        catch (e_1_1) { e_1 = { error: e_1_1 }; }
        finally {
            try {
                if (_c && !_c.done && (_a = _b.return)) _a.call(_b);
            }
            finally { if (e_1) throw e_1.error; }
        }
        // Append overlay
        this.overlay = document.createElement("div");
        this.overlay.classList.add("fluidbox__overlay");
        this.overlay.style.zIndex = "-1";
        this.wrapper.appendChild(this.overlay);
        // Add class to indicate larger image being loaded
        this.element.classList.remove("fluidbox--closed");
        this.element.classList.add("fluidbox--loading");
        // Check of URL is properly formatted
        var thumbnailSource = this.thumbnail.element.getAttribute("src");
        if (this.checkURL(thumbnailSource)) {
            this.close();
            return false;
        }
        // Set thumbnail image source as background image first, worry later
        this.ghost.style.backgroundImage = "url(\"" + this.formatURL(thumbnailSource) + "\")";
        this.ghost.style.opacity = "1";
        // Set dimensions for ghost
        this.measureElements();
        var onPreloadError = function () {
            // Trigger closing
            _this.close({ error: true });
            // Emit custom event
            _this.element.dispatchEvent(new Event("imageloadfail" /* ImageLoadFail */));
        };
        var preloader = new Image();
        preloader.onerror = onPreloadError;
        // Wait for ghost image to preload
        if (this.settings.immediateOpen) {
            // Update classes
            this.element.classList.add("fluidbox--opened", "fluidbox--loaded");
            this.wrapper.style.zIndex = (this.settings.stackIndex + this.settings.stackIndexDelta).toString();
            // Emit custom event
            this.element.dispatchEvent(new Event("openstart" /* OpenStart */));
            // Compute
            this.compute();
            // Hide thumbnail
            this.thumbnail.element.style.opacity = "0";
            // Show overlay
            this.overlay.style.opacity = "1";
            // Emit custom event when ghost image finishes transition
            this.ghost.addEventListener(customTransitionEnd, this.transitionendEventDelegate, { once: true });
            preloader.onload = function () {
                // Emit custom event
                _this.element.dispatchEvent(new Event("imageloaddone" /* ImageLoadDone */));
                // Perform only if the Fluidbox instance is still open
                if (_this.state === 1 /* Open */) {
                    // Set new natural dimensions
                    _this.thumbnail.naturalWidth = preloader.naturalWidth;
                    _this.thumbnail.naturalHeight = preloader.naturalHeight;
                    // Remove loading status
                    _this.element.classList.remove("fluidbox--loading");
                    // Check of URL is properly formatted
                    if (_this.checkURL(preloader.src)) {
                        _this.close({ error: true });
                        return false;
                    }
                    // Set new image background
                    _this.ghost.style.backgroundImage = "url(\"" + _this.formatURL(preloader.src) + "\")";
                    // Compute
                    _this.compute();
                }
            };
        }
        else {
            preloader.onload = function () {
                // Emit custom event
                _this.element.dispatchEvent(new Event("imageloaddone" /* ImageLoadDone */));
                // Update classes
                _this.element.classList.remove("fluidbox--loading");
                _this.element.classList.add("fluidbox--opened", "fluidbox--loaded");
                _this.wrapper.style.zIndex = (_this.settings.stackIndex + _this.settings.stackIndexDelta).toString();
                // Emit custom event
                _this.element.dispatchEvent(new Event("openstart" /* OpenStart */));
                // Check of URL is properly formatted
                if (_this.checkURL(preloader.src)) {
                    _this.close({ error: true });
                    return false;
                }
                // Set new image background
                _this.ghost.style.backgroundImage = "url(\"" + _this.formatURL(preloader.src) + "\")";
                // Set new natural dimensions
                _this.thumbnail.naturalWidth = preloader.naturalWidth;
                _this.thumbnail.naturalHeight = preloader.naturalHeight;
                // Compute
                _this.compute();
                // Hide thumbnail
                _this.thumbnail.element.style.opacity = "0";
                // Show overlay
                if (_this.overlay != null) {
                    _this.overlay.style.opacity = "1";
                }
                // Emit custom event when ghost image finishes transition
                _this.ghost.addEventListener(customTransitionEnd, _this.transitionendEventDelegate, { once: true });
            };
        }
        preloader.src = this.element.getAttribute("href");
    };
    Fluidbox.prototype.compute = function () {
        // Calculate aspect ratios
        var thumbRatio = this.thumbnail.naturalWidth / this.thumbnail.naturalHeight;
        var viewportRatio = window.innerWidth / window.innerHeight;
        // Replace dimensions if maxWidth or maxHeight is declared
        if (this.settings.maxWidth > 0) {
            this.thumbnail.naturalWidth = this.settings.maxWidth;
            this.thumbnail.naturalHeight = this.thumbnail.naturalWidth / thumbRatio;
        }
        else if (this.settings.maxHeight > 0) {
            this.thumbnail.naturalHeight = this.settings.maxHeight;
            this.thumbnail.naturalWidth = this.thumbnail.naturalHeight * thumbRatio;
        }
        // Compare image ratio with viewport ratio
        var computedHeight, computedWidth, imgScaleY, imgScaleX, imgMinScale;
        if (viewportRatio > thumbRatio) {
            computedHeight = this.thumbnail.naturalHeight < window.innerHeight ? this.thumbnail.naturalHeight : window.innerHeight * this.settings.viewportFill;
            imgScaleY = computedHeight / this.thumbnail.height;
            imgScaleX = (this.thumbnail.naturalWidth * ((this.thumbnail.height * imgScaleY) / this.thumbnail.naturalHeight)) / this.thumbnail.width;
            imgMinScale = imgScaleY;
        }
        else {
            computedWidth = this.thumbnail.naturalWidth < window.innerWidth ? this.thumbnail.naturalWidth : window.innerWidth * this.settings.viewportFill;
            imgScaleX = computedWidth / this.thumbnail.width;
            imgScaleY = (this.thumbnail.naturalHeight * ((this.thumbnail.width * imgScaleX) / this.thumbnail.naturalWidth)) / this.thumbnail.height;
            imgMinScale = imgScaleX;
        }
        // Display console error if both maxHeight and maxWidth are specific
        if (this.settings.maxWidth && this.settings.maxHeight) {
            console.warn("Fluidbox: Both maxHeight and maxWidth are specified. You can only specify one. If both are specified, only the maxWidth property will be respected. This will not generate any error, but may cause unexpected sizing behavior.");
        }
        // Scale
        var wrapperRect = this.wrapper.getBoundingClientRect();
        var thumbnailRect = this.thumbnail.element.getBoundingClientRect();
        var offsetX = 0.5 * (this.thumbnail.width * (imgMinScale - 1)) + 0.5 * (window.innerWidth - this.thumbnail.width * imgMinScale) - thumbnailRect.left;
        var halfImageHeight = thumbnailRect.height * imgMinScale / 2;
        var thumbnailOffsetTop = thumbnailRect.top + thumbnailRect.height / 2;
        var imageMarginTop = 0.5 * (window.innerHeight - thumbnailRect.height * imgMinScale);
        var offsetY = halfImageHeight - thumbnailOffsetTop + imageMarginTop;
        // Apply styles to ghost and loader (if present)
        this.ghost.style.transform = "translate(" + offsetX + "px, " + offsetY + "px) scale(" + imgScaleX + "," + imgScaleY + ")";
        this.ghost.style.top = thumbnailRect.top - wrapperRect.top + "px";
        this.ghost.style.left = thumbnailRect.left - wrapperRect.left + "px";
        if (this.loader != null) {
            this.loader.style.transform = "translate(" + offsetX + "px, " + offsetY + "px) scale(" + imgScaleX + "," + imgScaleY + ")";
        }
        // Emit custom event
        this.element.dispatchEvent(new Event("computeend" /* ComputeEnd */));
    };
    Fluidbox.prototype.recompute = function () {
        // Recompute is simply an alias for the compute method
        this.compute();
    };
    Fluidbox.prototype.close = function (data) {
        var e_2, _a;
        var closeData = Object.assign({}, { error: false }, data);
        // Do not do anything if Fluidbox is not opened/closed, for performance reasons
        if (this.state === 0 /* Closed */) {
            return false;
        }
        // Update state
        this.state = 0 /* Closed */;
        // Emit custom event
        this.element.dispatchEvent(new Event("closestart" /* CloseStart */));
        try {
            // Change classes
            for (var _b = __values(__spread(this.element.classList)), _c = _b.next(); !_c.done; _c = _b.next()) { // need to iterate on a copy of classList because we modify it
                var className = _c.value;
                if (className.match(/(^|\s)fluidbox--(opened|loaded|loading)+/g)) {
                    this.element.classList.remove(className);
                }
            }
        }
        catch (e_2_1) { e_2 = { error: e_2_1 }; }
        finally {
            try {
                if (_c && !_c.done && (_a = _b.return)) _a.call(_b);
            }
            finally { if (e_2) throw e_2.error; }
        }
        this.element.classList.add("fluidbox--closed");
        var thumbnailStyle = window.getComputedStyle(this.thumbnail.element);
        this.ghost.style.transform = "translate(0,0) scale(1,1)";
        this.setGhostPosition();
        if (this.loader != null) {
            this.loader.style.transform = "none";
        }
        this.ghost.addEventListener(customTransitionEnd, this.transitionendCloseDelegate, { once: true });
        // Manually trigger transitionend if an error is detected
        // Errors will not trigger any transition changes to the ghost element
        if (closeData.error) {
            this.ghost.dispatchEvent(new Event(customTransitionEnd));
        }
        // Fadeout overlay
        if (this.overlay != null) {
            this.overlay.style.opacity = "0";
        }
    };
    Fluidbox.prototype.bindEvents = function () {
        this.element.addEventListener("click", this.clickDelegate);
        document.addEventListener("keydown", this.keydownDelegate);
    };
    Fluidbox.prototype.bindListeners = function () {
        window.addEventListener("resize", this.throttledResizeDelegate);
        this.element.addEventListener("destroy" /* Destroy */, this.destroyDelegate);
        this.element.addEventListener("close" /* Close */, this.closeDelegate);
    };
    Fluidbox.prototype.unbind = function () {
        window.removeEventListener("resize", this.throttledResizeDelegate);
        document.removeEventListener("keydown", this.keydownDelegate);
        this.element.removeEventListener("click", this.clickDelegate);
        this.element.removeEventListener("destroy" /* Destroy */, this.destroyDelegate);
        this.element.removeEventListener("close" /* Close */, this.closeDelegate);
    };
    Fluidbox.prototype.reposition = function () {
        this.measureElements();
    };
    Fluidbox.prototype.destroy = function () {
        var e_3, _a;
        // Unbind event hanlders
        this.unbind();
        try {
            // DOM reversal
            for (var _b = __values(__spread(this.element.classList)), _c = _b.next(); !_c.done; _c = _b.next()) { // need to iterate on a copy of classList because we modify it
                var className = _c.value;
                if (className.match(/(^|\s)fluidbox[--|__]\S+/g)) {
                    this.element.classList.remove(className);
                }
            }
        }
        catch (e_3_1) { e_3 = { error: e_3_1 }; }
        finally {
            try {
                if (_c && !_c.done && (_a = _b.return)) _a.call(_b);
            }
            finally { if (e_3) throw e_3.error; }
        }
        if (this.originalNode != null) {
            this.element = this.element.parentElement.replaceChild(this.originalNode, this.element);
        }
        this.element.classList.add("fluidbox--destroyed");
        this.element.dispatchEvent(new Event("destroyed" /* Destroyed */));
    };
    Fluidbox.prototype.getMetadata = function () {
        // Return instance data
        return {
            thumb: {
                natW: this.thumbnail.naturalWidth,
                natH: this.thumbnail.naturalHeight,
                w: this.thumbnail.element.offsetWidth,
                h: this.thumbnail.element.offsetHeight
            },
            initialized: this.initialized,
            originalNode: this.originalNode,
            state: this.state,
            id: 0
        };
    };
    Fluidbox.prototype.setupDom = function () {
        // Wrap and add ghost element
        this.element.classList.add("fluidbox--closed");
        var thumbnailElement = this.element.querySelector("img");
        this.thumbnail.element = thumbnailElement;
        thumbnailElement.style.opacity = "1";
        thumbnailElement.classList.add("fluidbox__thumb");
        this.wrapper = document.createElement("div");
        this.wrapper.classList.add("fluidbox__wrap");
        this.wrapper.style.zIndex = (this.settings.stackIndex - this.settings.stackIndexDelta).toString();
        this.element.insertBefore(this.wrapper, thumbnailElement);
        this.wrapper.appendChild(thumbnailElement);
        this.ghost = document.createElement("div");
        this.ghost.classList.add("fluidbox__ghost");
        this.wrapper.appendChild(this.ghost);
        // Append loader
        if (this.settings.loader) {
            this.loader = document.createElement("div");
            this.loader.classList.add("fluidbox__loader");
            this.loader.style.zIndex = "2";
            this.wrapper.appendChild(this.loader);
        }
    };
    Fluidbox.prototype.prepare = function () {
        // Thumbnail is successfully loaded, fire event
        this.element.dispatchEvent(new Event("thumbloaddone" /* ThumbLoadDone */));
        // Get basic measurements and to resize the ghost element
        this.measureElements();
        // Bind events
        this.bindEvents();
        // Status: Fluidbox is ready to use
        this.element.classList.add("fluidbox--ready");
        // Bind listeners
        this.bindListeners();
        // Emit custom event
        this.element.dispatchEvent(new Event("ready" /* Ready */));
    };
    Fluidbox.prototype.measureElements = function () {
        var thumbnailElement = this.thumbnail.element;
        // Store image dimensions in instance data
        this.thumbnail = {
            element: thumbnailElement,
            naturalWidth: thumbnailElement.naturalWidth,
            naturalHeight: thumbnailElement.naturalHeight,
            width: thumbnailElement.offsetWidth,
            height: thumbnailElement.offsetHeight
        };
        // Set ghost dimensions
        this.ghost.style.width = thumbnailElement.offsetWidth + "px";
        this.ghost.style.height = thumbnailElement.offsetHeight + "px";
        this.setGhostPosition();
    };
    Fluidbox.prototype.setGhostPosition = function () {
        var thumbnailRect = this.thumbnail.element.getBoundingClientRect();
        var wrapperRect = this.wrapper.getBoundingClientRect();
        var thumbnailStyle = window.getComputedStyle(this.thumbnail.element);
        this.ghost.style.top = thumbnailRect.top - wrapperRect.top + parseInt(thumbnailStyle.borderTopWidth || "0", 10) + parseInt(thumbnailStyle.paddingTop || "0") + "px";
        this.ghost.style.left = thumbnailRect.left - wrapperRect.left + parseInt(thumbnailStyle.borderLeftWidth || "0", 10) + parseInt(thumbnailStyle.paddingLeft || "0") + "px";
    };
    Fluidbox.prototype.checkURL = function (url) {
        var exitCode = 0;
        if (/[\s+]/g.test(url)) {
            console.warn("Fluidbox: Fluidbox opening is halted because it has detected characters in your URL string that need to be properly encoded/escaped. Whitespace(s) have to be escaped manually. See RFC3986 documentation.");
            exitCode = 1;
        }
        else if (/[\"\'\(\)]/g.test(url)) {
            console.warn("Fluidbox: Fluidbox opening will proceed, but it has detected characters in your URL string that need to be properly encoded/escaped. These will be escaped for you. See RFC3986 documentation.");
            exitCode = 0;
        }
        return exitCode;
    };
    Fluidbox.prototype.formatURL = function (url) {
        return url
            .replace(/"/g, "%22")
            .replace(/'/g, "%27")
            .replace(/\(/g, "%28")
            .replace(/\)/g, "%29");
    };
    return Fluidbox;
}());
export default Fluidbox;
//# sourceMappingURL=fluidbox.js.map