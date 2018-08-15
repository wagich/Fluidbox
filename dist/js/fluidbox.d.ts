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
export declare const enum FluidboxEvents {
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
declare const enum State {
    Closed = 0,
    Open = 1
}
export default class Fluidbox {
    constructor(element: HTMLElement, options?: FluidboxOptions);
    validateElement(element: HTMLElement): boolean;
    init(): void;
    open(): false | undefined;
    compute(): void;
    recompute(): void;
    close(data?: {
        error: boolean;
    }): false | undefined;
    bindEvents(): void;
    bindListeners(): void;
    unbind(): void;
    reposition(): void;
    destroy(): void;
    getMetadata(): FluidboxInstanceData;
}
