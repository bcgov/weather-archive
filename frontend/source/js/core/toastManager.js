/**
 * Centralized toast notification manager
 * @module core/toastManager
 */

/**
 * Creates a toast manager for displaying notifications at the center bottom of the page.
 * @returns {Object} Toast manager with show methods
 */
export function createToastManager() {
    let toastContainer = null;
    let toastCounter = 0;

    /**
     * Initializes the toast container if it doesn't exist.
     */
    function initializeContainer() {
        if (toastContainer) return;

        toastContainer = $('<div>')
            .attr('id', 'toast-container')
            .css({
                position: 'fixed',
                bottom: '20px',
                left: '50%',
                transform: 'translateX(-50%)',
                'z-index': 9999,
                'max-width': '400px',
                width: '90%'
            });

        $('body').append(toastContainer);
    }

    /**
     * Creates and shows a toast notification.
     * @param {string} message - The message to display
     * @param {string} type - Toast type: 'error', 'success', 'info', 'warning'
     * @param {number} duration - Auto-dismiss duration in ms (0 = no auto-dismiss)
     */
    function showToast(message, type = 'info', duration = 5000) {
        initializeContainer();

        const toastId = `toast-${++toastCounter}`;
        const typeClasses = {
            error: 'alert-danger',
            success: 'alert-success',
            info: 'alert-info',
            warning: 'alert-warning'
        };
        const $toast = $('<div>')
            .attr({
                id: toastId,
                class: `alert ${typeClasses[type]} alert-dismissible fade show mb-2`,
                role: 'alert'
            });
        const $messageSpan = $('<span>').text(message);
        const $closeButton = $('<button>')
            .attr({
                type: 'button',
                class: 'btn-close',
                'data-bs-dismiss': 'alert',
                'aria-label': 'Close'
            });
        $toast.append($messageSpan, $closeButton);

        // Add animation
        $toast.hide().appendTo(toastContainer).slideDown(300);

        // Auto-dismiss
        if (duration > 0) {
            setTimeout(() => {
                dismissToast(toastId);
            }, duration);
        }

        // Handle manual dismiss
        $toast.on('closed.bs.alert', function() {
            $(this).slideUp(200, function() {
                $(this).remove();
            });
        });

        return toastId;
    }

    /**
     * Dismisses a specific toast by ID.
     * @param {string} toastId - The ID of the toast to dismiss
     */
    function dismissToast(toastId) {
        const $toast = $(`#${toastId}`);
        if ($toast.length) {
            $toast.alert('close');
        }
    }

    /**
     * Handles errors with appropriate user feedback.
     * @param {Error} error - The error object
     * @param {string} context - Context where error occurred
     * @param {string} userMessage - Message to show user
     */
    function handleError(error, context, userMessage = 'An error occurred') {
        // Don't show toast for aborted requests
        if (error.name === 'AbortError') return;

        console.error(`Error in ${context}:`, error);
        showToast(userMessage, 'error');
    }

    return {
        /**
         * Shows an error toast
         * @param {string} message - Error message
         * @param {number} duration - Auto-dismiss duration
         */
        error: (message, duration = 5000) => showToast(message, 'error', duration),

        /**
         * Shows a success toast
         * @param {string} message - Success message
         * @param {number} duration - Auto-dismiss duration
         */
        success: (message, duration = 3000) => showToast(message, 'success', duration),

        /**
         * Handles errors with centralized error management
         */
        handleError
    };
}