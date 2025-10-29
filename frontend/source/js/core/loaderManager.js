/**
 * Loader controller to manage UI states
 * @module core/loaderManager
 */

/**
 * Creates a loader controller for managing UI states.
 * @param {jQuery} loaderEl - Loading spinner element
 * @param {jQuery} messageEl - Message/error element
 * @param {jQuery} [contentEl] - Content element to show or hide
 * @returns {{loading:Function, success:Function, error:Function}}
 */
export function createLoader(loaderEl, messageEl, contentEl) {
    return {
        loading: () => {
            loaderEl.removeClass('d-none');
            messageEl.addClass('d-none');
            if (contentEl) contentEl.addClass('d-none');
        },
        success: () => {
            loaderEl.addClass('d-none');
            messageEl.addClass('d-none');
            if (contentEl) contentEl.removeClass('d-none');
        },
        error: (msg) => {
            loaderEl.addClass('d-none');
            messageEl.text(msg).removeClass('d-none');
            if (contentEl) contentEl.addClass('d-none');
        }
    };
}