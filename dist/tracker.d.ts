/**
 * Sets up event listeners on the Browser.Page instance to maintain a set
 * of URLs that have started but never finished or failed.
 *
 * @param {Object} page
 * @return Object
 */
export declare const createTracker: (page: any) => {
    urls: () => string[];
    dispose: () => void;
};
/**
 * Adds information about timed out URLs if given message is about Timeout.
 *
 * @param {string} message error message
 * @param {Object} tracker ConnectionTracker
 * @returns {string}
 */
export declare const augmentTimeoutError: (message: any, tracker: any) => any;
