import throttle from "lodash-es/throttle";
import "events-polyfill/src/ListenerOptions.js";

function whichTransitionEvent() {
    const el = document.createElement("fakeelement");
    var transitions: { [transition: string]: string } = {
        transition: "transitionend",
        OTransition: "oTransitionEnd",
        MozTransition: "transitionend",
        WebkitTransition: "webkitTransitionEnd"
    };

    for (const t in transitions) {
        if (el.style[<any>t] !== undefined) {
            return transitions[t];
        }
    }

    return "transitionend";
}

function capitalize(s: string) {
    return s && s[0].toLowerCase() + s.slice(1);
}

function isVisible(element: HTMLElement): boolean {
    return !!(element.offsetWidth || element.offsetHeight || element.getClientRects().length);
}

const customTransitionEnd = whichTransitionEvent();

export interface FluidboxOptions {
    /**
     * Determines if Fluidbox should be opened immediately on click. If set to yes, Fluidbox will open the ghost image and wait for the target image to load. If set to no, Fluidbox will wait for the target image to load, then open the ghost image.
     * Defaults to false
     */
    immediateOpen?: boolean;

    /**
     * Determines if a loader will be added to the manipulated DOM. It will have the class of .fluidbox__loader.
     * Defaults to false
     */
    loader?: boolean;

    /**
     * Sets the maximum width, in screen pixels, that the ghost image will enlarge to. When set to zero this property is ignored. This property will not override the viewportFill.
     * This option should not be specified (≥0) in lieu with maxHeight. In the event that both maxWidth and maxHeight are specified (≥0), maxWidth takes precedence. Fluidbox will throw a warning in the console discouraging this use.
     * Defaults to 0
     */
    maxWidth?: number;

    /**
     * Sets the maximum height, in screen pixels, that the ghost image will enlarge to. When set to zero this property is ignored. This property will not override the viewportFill.
     * This option should not be specified (≥0) in lieu with maxWidth. In the event that both maxWidth and maxHeight are specified (≥0), maxWidth takes precedence. Fluidbox will throw a warning in the console discouraging this use.
     * Defaults to 0
     */
    maxHeight?: number;

    /**
     * Determines how much to throttle the viewport resize event that fires recomputing of Fluidbox dimensions and repositioning of the ghost image.
     * Defaults to 500 milliseconds
     */
    resizeThrottle?: number;

    /**
     * Determines how high up the z-index will all Fluildbox elements be. Leave this option as default, unless you have other relatively or absolutely positioned elements on the page that is messing with Fluidbox appearance.
     * Defaults to 1000
     */
    stackIndex?: number;

    /**
     * Determines how much the z-index will fluctuate from stackIndex in order to allow visually-correct stacking of Fluidbox instances. With the default settings, this means that the effective range of z-indexes Fluidbox operates in will be between 990–1010. For elements that should go under the overlay, they should have a z-index of less than 1000.
     * Defaults to 10
     */
    stackIndexDelta?: number;

    /**
     * Dictates how much the longest axis of the image should fill the viewport. The value will be coerced to fall between 0 and 1.
     * Defaults to 0.95
     */
    viewportFill?: number;
}

export interface FluidboxInstanceData {
    thumb: {
        natW: number;
        natH: number;
        w: number;
        h: number;
    };
    initialized: boolean;
    originalNode: HTMLElement;
    state: State;
    id: number;
}

interface FluidboxOptionsInternal {
    immediateOpen: boolean;
    loader: boolean;
    maxWidth: number;
    maxHeight: number;
    resizeThrottle: number;
    stackIndex: number;
    stackIndexDelta: number;
    viewportFill: number;
}

const defaultOptions: FluidboxOptionsInternal = {
    immediateOpen: false,
    loader: false,
    maxWidth: 0,
    maxHeight: 0,
    resizeThrottle: 500,
    stackIndex: 1000,
    stackIndexDelta: 10,
    viewportFill: 0.95
};

export const enum FluidboxEvents {
    OpenStart = "openstart",
    OpenEnd = "openend",
    CloseStart = "closestart",
    CloseEnd = "closeend",
    ComputeEnd = "computeend",
    RecomputeEnd = "recomputeend",
    ImageLoadDone = "imageloaddone",
    ImageLoadFail = "imageloadfail",
    ThumbLoadDone = "thumbloaddone",
    ThumbLoadFail = "thumbloadfail"
}

const enum CustomEvents {
    Init = "init",
    Ready = "ready",
    Close = "close",
    Destroy = "destroy",
    Destroyed = "destroyed"
}

const enum State {
    Closed,
    Open
}

export default class Fluidbox {
    private thumbnail = {
        element: <HTMLImageElement>document.createElement("img"),
        naturalWidth: 0,
        naturalHeight: 0,
        width: 0,
        height: 0
    };
    
    private element: HTMLElement;
    private ghost: HTMLElement;
    private wrapper: HTMLElement;
    private overlay: HTMLElement | null;
    private loader: HTMLElement | null;
    
    private originalNode: HTMLElement;
    private state = State.Closed;
    private initialized = false;
    private settings: FluidboxOptionsInternal;

    private readonly closeDelegate = () => this.close();
    private readonly destroyDelegate = () => this.destroy();
    private readonly resizeDelegate = () => {
        this.measureElements();

        // Re-compute, but only for the active element
        if (this.element.classList.contains("fluidbox--opened")) {
            this.compute();
        }
    };
    private throttledResizeDelegate: () => void;
    private readonly clickDelegate = (e: MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();

        // Check state
        // If Fluidbox is closed, we open it
        if (this.state === State.Closed) {
            this.open();
        } else {
            this.close();
        }
    };
    private readonly keydownDelegate = (e: KeyboardEvent) => {
        // Trigger closing for ESC key
        if (e.keyCode === 27) {
            this.close();
        }
    };
    private readonly transitionendEventDelegate = () => this.element.dispatchEvent(new Event(FluidboxEvents.OpenEnd));
    private readonly transitionendCloseDelegate = () => {
        this.ghost.style.opacity = "0";
        this.thumbnail.element.style.opacity = "1";
        if (this.overlay != null) {
            this.overlay.remove();
        }
        this.wrapper.style.zIndex = (this.settings.stackIndex - this.settings.stackIndexDelta).toString();
    };

    constructor(element: HTMLElement, options?: FluidboxOptions) {
        if (!this.validateElement(element)) {
            throw new Error("Cannot create a fluidbox for this element.");
        }
        this.element = element;

        // Manipulate HTML5 dataset object
        // -  Format: data-fluidbox-(setting-name). When converted into camel case: fluidboxSettingName
        // - So, we will have to remove 'fluidbox' in the front, and change the first letter to lowercase
        let elementData: any = {};
        for (const key in this.element.dataset) {
            const capitalizedKey = capitalize(key.replace("fluidbox", ""));
            let value: string | boolean = this.element.dataset[key]!;

            // Only push non-empty keys (that are part of the Fluidbox HTML5 data- attributes) into new object
            if (key !== "" || key !== null) {
                // Coerce boolean values
                if (value == "false") {
                    value = false;
                } else if (value == "true") {
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

    validateElement(element: HTMLElement): boolean {
        // Only perform initialization when
        // + DOM checks are satisfied:
        // +-- An anchor element is selected
        // +-- Contains one and only one child
        // +-- The only child is an image element OR a picture element
        // +-- The element must not be hidden (itself or its parents)

        const isAnchor = element.tagName === "A";
        const hasOneChild = element.children.length === 1;
        const hasImageOrPictureChild = element.children[0].tagName === "IMG" || (element.children[0].tagName === "PICTURE" && element.querySelectorAll("img").length === 1);

        let parentsAndSelfVisible = true;
        let parentOrSelf: HTMLElement | null = element;
        while (parentOrSelf != null) {
            parentsAndSelfVisible = parentsAndSelfVisible && isVisible(parentOrSelf);
            parentOrSelf = parentOrSelf.parentElement;
        }

        return isAnchor && hasOneChild && hasImageOrPictureChild && parentsAndSelfVisible && isVisible(<HTMLElement>element.children[0]);
    }

    init() {
        if (!this.initialized) {
            // Initialize and store original node
            this.element.classList.remove("fluidbox--destroyed");

            this.initialized = true;
            this.originalNode = <HTMLElement>this.element.cloneNode(true);

            // Status: Fluidbox has been initialized
            this.element.classList.add("fluidbox--initialized");

            // DOM replacement
            this.setupDom();

            // Emit custom event
            this.element.dispatchEvent(new Event(CustomEvents.Init));

            // Wait for image to load, but only if image is not found in cache
            var preloader = new Image();
            if (this.thumbnail.element.offsetWidth > 0 && this.thumbnail.element.offsetHeight > 0) {
                // Thumbnail loaded from cache, let's prepare fluidbox
                this.prepare();
            } else {
                // Thumbnail loaded, let's prepare fluidbox
                preloader.onload = () => this.prepare();
                preloader.onerror = () => this.element.dispatchEvent(new Event(FluidboxEvents.ThumbLoadFail));
                preloader.src = this.thumbnail.element.getAttribute("src")!;
            }
        }
    }

    open() {
        // Update state
        this.state = State.Open;

        // Forcibly turn off transition end detection,
        // otherwise users will get choppy transition if toggling between states rapidly
        this.ghost.removeEventListener(customTransitionEnd, this.transitionendEventDelegate);
        this.ghost.removeEventListener(customTransitionEnd, this.transitionendCloseDelegate);

        // Close all other Fluidbox instances
        for (const element of Array.from(document.querySelectorAll(".fluidbox--opened")).filter(e => e !== this.element)) {
            element.dispatchEvent(new Event(CustomEvents.Close));
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
        const thumbnailSource = this.thumbnail.element.getAttribute("src")!;
        if (this.checkURL(thumbnailSource)) {
            this.close();
            return false;
        }

        // Set thumbnail image source as background image first, worry later
        this.ghost.style.backgroundImage = `url("${this.formatURL(thumbnailSource)}")`;
        this.ghost.style.opacity = "1";

        // Set dimensions for ghost
        this.measureElements();

        const onPreloadError = () => {
            // Trigger closing
            this.close({ error: true });

            // Emit custom event
            this.element.dispatchEvent(new Event(FluidboxEvents.ImageLoadFail));
        };
        const preloader = new Image();
        preloader.onerror = onPreloadError;

        // Wait for ghost image to preload
        if (this.settings.immediateOpen) {
            // Update classes
            this.element.classList.add("fluidbox--opened", "fluidbox--loaded");
            this.wrapper.style.zIndex = (this.settings.stackIndex + this.settings.stackIndexDelta).toString();

            // Emit custom event
            this.element.dispatchEvent(new Event(FluidboxEvents.OpenStart));

            // Compute
            this.compute();

            // Hide thumbnail
            this.thumbnail.element.style.opacity = "0";

            // Show overlay
            this.overlay.style.opacity = "1";

            // Emit custom event when ghost image finishes transition
            this.ghost.addEventListener(customTransitionEnd, this.transitionendEventDelegate, { once: true });

            preloader.onload = () => {
                // Emit custom event
                this.element.dispatchEvent(new Event(FluidboxEvents.ImageLoadDone));

                // Perform only if the Fluidbox instance is still open
                if (this.state === State.Open) {
                    // Set new natural dimensions
                    this.thumbnail.naturalWidth = preloader.naturalWidth;
                    this.thumbnail.naturalHeight = preloader.naturalHeight;

                    // Remove loading status
                    this.element.classList.remove("fluidbox--loading");

                    // Check of URL is properly formatted
                    if (this.checkURL(preloader.src)) {
                        this.close({ error: true });
                        return false;
                    }

                    // Set new image background
                    this.ghost.style.backgroundImage = `url("${this.formatURL(preloader.src)}")`;

                    // Compute
                    this.compute();
                }
            };
        } else {
            preloader.onload = () => {
                // Emit custom event
                this.element.dispatchEvent(new Event(FluidboxEvents.ImageLoadDone));

                // Update classes
                this.element.classList.remove("fluidbox--loading");
                this.element.classList.add("fluidbox--opened", "fluidbox--loaded");
                this.wrapper.style.zIndex = (this.settings.stackIndex + this.settings.stackIndexDelta).toString();

                // Emit custom event
                this.element.dispatchEvent(new Event(FluidboxEvents.OpenStart));

                // Check of URL is properly formatted
                if (this.checkURL(preloader.src)) {
                    this.close({ error: true });
                    return false;
                }

                // Set new image background
                this.ghost.style.backgroundImage = `url("${this.formatURL(preloader.src)}")`;

                // Set new natural dimensions
                this.thumbnail.naturalWidth = preloader.naturalWidth;
                this.thumbnail.naturalHeight = preloader.naturalHeight;

                // Compute
                this.compute();

                // Hide thumbnail
                this.thumbnail.element.style.opacity = "0";

                // Show overlay
                if (this.overlay != null) {
                    this.overlay.style.opacity = "1";
                }

                // Emit custom event when ghost image finishes transition
                this.ghost.addEventListener(customTransitionEnd, this.transitionendEventDelegate, { once: true });
            };
        }
        preloader.src = this.element.getAttribute("href")!;
    }

    compute() {
        // Calculate aspect ratios
        let thumbRatio =  this.thumbnail.naturalWidth /  this.thumbnail.naturalHeight;
        let viewportRatio = window.innerWidth / window.innerHeight;

        // Replace dimensions if maxWidth or maxHeight is declared
        if (this.settings.maxWidth > 0) {
             this.thumbnail.naturalWidth = this.settings.maxWidth;
             this.thumbnail.naturalHeight =  this.thumbnail.naturalWidth / thumbRatio;
        } else if (this.settings.maxHeight > 0) {
             this.thumbnail.naturalHeight = this.settings.maxHeight;
             this.thumbnail.naturalWidth =  this.thumbnail.naturalHeight * thumbRatio;
        }

        // Compare image ratio with viewport ratio
        var computedHeight, computedWidth, imgScaleY, imgScaleX, imgMinScale;
        if (viewportRatio > thumbRatio) {
            computedHeight =  this.thumbnail.naturalHeight < window.innerHeight ?  this.thumbnail.naturalHeight : window.innerHeight * this.settings.viewportFill;
            imgScaleY = computedHeight / this.thumbnail.height;
            imgScaleX = ( this.thumbnail.naturalWidth * ((this.thumbnail.height * imgScaleY) /  this.thumbnail.naturalHeight)) / this.thumbnail.width;
            imgMinScale = imgScaleY;
        } else {
            computedWidth =  this.thumbnail.naturalWidth < window.innerWidth ?  this.thumbnail.naturalWidth : window.innerWidth * this.settings.viewportFill;
            imgScaleX = computedWidth / this.thumbnail.width;
            imgScaleY = ( this.thumbnail.naturalHeight * ((this.thumbnail.width * imgScaleX) /  this.thumbnail.naturalWidth)) / this.thumbnail.height;
            imgMinScale = imgScaleX;
        }

        // Display console error if both maxHeight and maxWidth are specific
        if (this.settings.maxWidth && this.settings.maxHeight) {
            console.warn("Fluidbox: Both maxHeight and maxWidth are specified. You can only specify one. If both are specified, only the maxWidth property will be respected. This will not generate any error, but may cause unexpected sizing behavior.");
        }
        
        // Scale
        let wrapperRect = this.wrapper.getBoundingClientRect();
        let thumbnailRect = this.thumbnail.element.getBoundingClientRect();
        
        let offsetX = 0.5 * (this.thumbnail.width * (imgMinScale - 1)) + 0.5 * (window.innerWidth - this.thumbnail.width * imgMinScale) - thumbnailRect.left;

        let halfImageHeight = thumbnailRect.height * imgMinScale / 2;
        let thumbnailOffsetTop = thumbnailRect.top + thumbnailRect.height / 2;
        let imageMarginTop = 0.5 * (window.innerHeight - thumbnailRect.height * imgMinScale);
        let offsetY = halfImageHeight - thumbnailOffsetTop + imageMarginTop;

        // Apply styles to ghost and loader (if present)
        this.ghost.style.transform = `translate(${offsetX}px, ${offsetY}px) scale(${imgScaleX},${imgScaleY})`;
        this.ghost.style.top = `${thumbnailRect.top - wrapperRect.top}px`;
        this.ghost.style.left = `${thumbnailRect.left - wrapperRect.left}px`;

        if (this.loader != null) {
            this.loader.style.transform = `translate(${offsetX}px, ${offsetY}px) scale(${imgScaleX},${imgScaleY})`;
        }

        // Emit custom event
        this.element.dispatchEvent(new Event(FluidboxEvents.ComputeEnd));
    }

    recompute() {
        // Recompute is simply an alias for the compute method
        this.compute();
    }

    close(data?: { error: boolean }) {
        let closeData = Object.assign({}, { error: false }, data);

        // Do not do anything if Fluidbox is not opened/closed, for performance reasons
        if (this.state === State.Closed) {
            return false;
        }

        // Update state
        this.state = State.Closed;

        // Emit custom event
        this.element.dispatchEvent(new Event(FluidboxEvents.CloseStart));

        // Change classes
        for (let className of [...this.element.classList]) { // need to iterate on a copy of classList because we modify it
            if (className.match(/(^|\s)fluidbox--(opened|loaded|loading)+/g)) {
                this.element.classList.remove(className);
            }
        }
        this.element.classList.add("fluidbox--closed");

        let thumbnailStyle = window.getComputedStyle(this.thumbnail.element);
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
    }

    bindEvents() {
        this.element.addEventListener("click", this.clickDelegate);
        document.addEventListener("keydown", this.keydownDelegate);
    }

    bindListeners() {
        window.addEventListener("resize", this.throttledResizeDelegate);
        this.element.addEventListener(CustomEvents.Destroy, this.destroyDelegate);
        this.element.addEventListener(CustomEvents.Close, this.closeDelegate);
    }

    unbind() {
        window.removeEventListener("resize", this.throttledResizeDelegate);
        document.removeEventListener("keydown", this.keydownDelegate);
        this.element.removeEventListener("click", this.clickDelegate);
        this.element.removeEventListener(CustomEvents.Destroy, this.destroyDelegate);
        this.element.removeEventListener(CustomEvents.Close, this.closeDelegate);
    }

    reposition() {
        this.measureElements();
    }

    destroy() {
        // Unbind event hanlders
        this.unbind();

        // DOM reversal
        for (let className of [...this.element.classList]) { // need to iterate on a copy of classList because we modify it
            if (className.match(/(^|\s)fluidbox[--|__]\S+/g)) {
                this.element.classList.remove(className);
            }
        }

        if (this.originalNode != null) {
            this.element = this.element.parentElement!.replaceChild(this.originalNode, this.element);
        }

        this.element.classList.add("fluidbox--destroyed");
        this.element.dispatchEvent(new Event(CustomEvents.Destroyed));
    }

    getMetadata(): FluidboxInstanceData {
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
    }

    private setupDom() {
        // Wrap and add ghost element
        this.element.classList.add("fluidbox--closed");

        let thumbnailElement = this.element.querySelector("img")!;
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
    }

    private prepare() {
        // Thumbnail is successfully loaded, fire event
        this.element.dispatchEvent(new Event(FluidboxEvents.ThumbLoadDone));

        // Get basic measurements and to resize the ghost element
        this.measureElements();

        // Bind events
        this.bindEvents();

        // Status: Fluidbox is ready to use
        this.element.classList.add("fluidbox--ready");

        // Bind listeners
        this.bindListeners();

        // Emit custom event
        this.element.dispatchEvent(new Event(CustomEvents.Ready));
    }

    private measureElements() {
        let thumbnailElement = this.thumbnail.element;

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
    }

    private setGhostPosition() {
        let thumbnailRect = this.thumbnail.element.getBoundingClientRect();
        let wrapperRect = this.wrapper.getBoundingClientRect();
        let thumbnailStyle = window.getComputedStyle(this.thumbnail.element);

        this.ghost.style.top = `${thumbnailRect.top - wrapperRect.top + parseInt(thumbnailStyle.borderTopWidth || "0", 10) + parseInt(thumbnailStyle.paddingTop || "0")}px`;
        this.ghost.style.left = `${thumbnailRect.left - wrapperRect.left + parseInt(thumbnailStyle.borderLeftWidth || "0", 10) + parseInt(thumbnailStyle.paddingLeft || "0")}px`;
    }

    private checkURL(url: string): number {
        var exitCode = 0;

        if (/[\s+]/g.test(url)) {
            console.warn("Fluidbox: Fluidbox opening is halted because it has detected characters in your URL string that need to be properly encoded/escaped. Whitespace(s) have to be escaped manually. See RFC3986 documentation.");
            exitCode = 1;
        } else if (/[\"\'\(\)]/g.test(url)) {
            console.warn("Fluidbox: Fluidbox opening will proceed, but it has detected characters in your URL string that need to be properly encoded/escaped. These will be escaped for you. See RFC3986 documentation.");
            exitCode = 0;
        }
        return exitCode;
    }

    private formatURL(url: string): string {
        return url
            .replace(/"/g, "%22")
            .replace(/'/g, "%27")
            .replace(/\(/g, "%28")
            .replace(/\)/g, "%29");
    }
}
