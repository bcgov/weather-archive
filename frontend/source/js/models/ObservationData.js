/**
 * ObservationData model factory
 * @module models/ObservationData
 */

import { getMonthName } from '../utils/formatters.js';

/**
 * Creates an ObservationData model instance for file metadata and display.
 * @param {Object} fileData - Raw file data from API
 * @param {string} fileData.token - Download token
 * @param {string|number} fileData.year - Year of the data
 * @param {string|number} fileData.month - Month of the data (01-12)
 * @returns {Object} ObservationData instance
 */
export function createObservationData(fileData) {
    // Validate required data
    if (!fileData || typeof fileData !== 'object') {
        throw new Error('File data is required');
    }

    if (!fileData.year || !fileData.month) {
        throw new Error('Year and month are required');
    }


    const month = parseInt(fileData.month, 10);

    if (isNaN(month) || month < 1 || month > 12) {
        throw new Error(`Invalid month: ${fileData.month}`);
    }

    // Create the observation data object
    const observationData = {
        year: fileData.year,
        month: month,

        /**
         * Gets the formatted month name.
         * @returns {string} Full month name (e.g., "January")
         */
        getMonthName() {
            return getMonthName(this.month);
        },

        /**
         * Creates a download button element for this observation data.
         * @returns {jQuery} Download button element
         */
        createDownloadButton() {
            const monthName = this.getMonthName();
            
            const $button = $('<button>')
                .addClass('btn btn-link download-observation')
                .attr({
                    type: 'button',
                    'data-year': this.year,
                    'data-month': this.month,
                    'aria-label': `Download data for ${monthName}`,
                    'title': `Download data for ${monthName}`
                });

            $('<i>')
                .addClass('bi bi-download')
                .attr('aria-hidden', 'true')
                .appendTo($button);

            return $button;
        },

        /**
         * Creates a list item element for this observation data.
         * @returns {jQuery} List item element
         */
        createListItem() {
            const monthName = this.getMonthName();

            const $listItem = $('<li>')
                .addClass('list-group-item d-flex justify-content-start align-items-center gap-2')
                .attr('role', 'listitem');

            $('<span>')
                .text(monthName)
                .appendTo($listItem);

            const $button = this.createDownloadButton();
            $listItem.append($button);

            return $listItem;
        }
    };

    return observationData;
}