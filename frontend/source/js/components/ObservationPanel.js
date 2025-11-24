/**
 * ObservationPanel component factory
 * @module components/ObservationPanel
 */

import { CONFIG, UI_ELEMENTS } from '../config/constants.js';
import { createObservationData } from '../models/ObservationData.js';
import { createLoader } from '../core/loaderManager.js';
/**
 * Creates an ObservationPanel component for managing observation data display and panel behavior.
 * @param {Object} api - WeatherStationAPI instance
 * @param {Object} toastManager - Toast manager for notifications
 * @returns {Object} ObservationPanel instance
 */
export function createObservationPanel(api, toastManager) {
    if (!api || !toastManager) {
        throw new Error('API and toast manager are required');
    }

    // Private state
    let currentStation = null;
    let requestController = null;
    let tokenStore = new Map();

    // jQuery elements
    const $yearSelect = UI_ELEMENTS.sensor.$yearSelect;
    const $detailsContents = UI_ELEMENTS.sensor.$detailsContents;
    const $dataList = UI_ELEMENTS.observation.$dataList;
    const $loader = UI_ELEMENTS.observation.$loader;
    const $loaderText = UI_ELEMENTS.observation.$loaderText;
    const $panel = UI_ELEMENTS.map.$panel;
    const $expandBtn = UI_ELEMENTS.buttons.$expand;
    const $closeBtn = UI_ELEMENTS.buttons.$close;
    const $detailName = UI_ELEMENTS.details.$name;
    const $detailDescription = UI_ELEMENTS.details.$description;
    const $detailElevation = UI_ELEMENTS.details.$elevation;
    const $detailStatus = UI_ELEMENTS.details.$status;
    const $detailLng = UI_ELEMENTS.details.$lng;
    const $detailLat = UI_ELEMENTS.details.$lat;

    // Loader for observation data
    const obsLoader = createLoader(
        $($loader),
        $($loaderText),
        $dataList
    );

    // Event callbacks
    let onPanelClosed = null;

    /**
     * Updates the sensor detail display with station data.
     * @param {Object} station - WeatherStation instance
     */
    function updateStationDetails(station) {
        if (!station) return;

        const formattedCoords = station.getFormattedCoordinates();
        
        $detailName.text(station.name);
        $detailDescription.text(station.description);
        $detailElevation.text(station.elevation + "m");
        $detailStatus.text(station.status);
        $detailLng.text(formattedCoords.lng);
        $detailLat.text(formattedCoords.lat);
        // Clear the select and add default option
        $yearSelect.empty().append('<option value="" selected>Select Year</option>');
        for (let year = station.dataEnd; year >= station.dataStart; year--) {
            $yearSelect.append(`<option value="${year}">${year}</option>`);
        }
    }

    /**
     * Stores a token for a specific year/month combination.
     * @param {number} year - The year
     * @param {number} month - The month (1-12)
     * @param {string} token - The download token
     */
    function storeToken(year, month, token) {
        const key = `${year}_${month.toString().padStart(2, '0')}`;
        tokenStore.set(key, token);
    }

    /**
     * Retrieves a token for a specific year/month combination.
     * @param {number} year - The year
     * @param {number} month - The month (1-12)
     * @returns {string|null} The token or null if not found
     */
    function getToken(year, month) {
        const key = `${year}_${month.toString().padStart(2, '0')}`;
        return tokenStore.get(key) || null;
    }

    /**
     * Renders observation files in the data list.
     * @param {Object[]} files - Array of file objects from API
     */
    function renderFiles(files) {
        tokenStore.clear();
        $dataList.empty();

        if (!files.length) {
            obsLoader.error('No data for this year');
            return;
        }

        files.forEach((fileData) => {
            try {
                storeToken(fileData.year, fileData.month, fileData.token);
                const observationData = createObservationData(fileData);
                const $listItem = observationData.createListItem();
                $dataList.append($listItem);
            } catch (error) {
                toastManager.error('Failed to load full observation data. Please reselect the year.');
            }
        });

        obsLoader.success();
    }

    /**
     * Fetches and displays observation files for the current station and selected year.
     */
    async function updateObservationData() {
        const year = $yearSelect.val();

        if (!year) {
            obsLoader.error('Select a year to download observation data');
            return;
        }

        if (!currentStation) {
            obsLoader.error('No station selected');
            return;
        }

        obsLoader.loading();

        // Cancel any pending request
        if (requestController) {
            requestController.abort();
        }
        requestController = api.createAbortController();

        try {
            const files = await api.fetchObservationFiles(
                currentStation.id, 
                year, 
                requestController.signal
            );

            // Ensure the selection hasn't changed while we were fetching
            if (currentStation && $yearSelect.val() === year) {
                renderFiles(files);
            }
        } catch (error) {
            obsLoader.error('Error loading observation data');
        }
    }

    /**
     * Handles download button clicks.
     * @param {Event} event - The click event
     */
    function handleDownloadClick(event) {
        const $button = $(event.currentTarget);
        const year = $button.data('year');
        const month = $button.data('month');
        const token = getToken(year, month);

        if (!token) {
            toastManager.error('Download token not found. Please reselect the year.');
            return;
        }

        if (currentStation) {
            api.downloadFile(currentStation.id, year, month, token);
        }
    }

    /**
     * Shows or hides the expand button based on screen size.
     */
    function toggleExpandButton() {
        if ($(window).width() < CONFIG.MOBILE_BREAKPOINT) {
            $expandBtn.show().off('click').on('click', toggleMobileExpand);
        } else {
            $expandBtn.hide();
        }
    }

    /**
     * Resets the expand button to collapsed state.
     */
    function resetExpandButton() {
        $expandBtn.hide()
            .find('i')
            .removeClass('bi-chevron-down')
            .addClass('bi-chevron-up');
    }

    /**
     * Toggles full-screen detail view on mobile.
     */
    function toggleMobileExpand() {
        $panel.toggleClass('expanded');
        $expandBtn.find('i')
            .toggleClass('bi-chevron-up bi-chevron-down');
    }

    /**
     * Updates the UI when a station is selected.
     * @param {Object} station - WeatherStation instance
     */
    function updateSelectionUI() {
        $panel.addClass('open').removeClass('expanded');
        resetExpandButton();

        $closeBtn.focus();
        $detailsContents.scrollTop(0);
        toggleExpandButton();
    }

    /**
     * Closes the observation panel and resets state.
     */
    function closePanel() {
        $panel.removeClass('open expanded');
        resetExpandButton();

        // Reset state
        currentStation = null;
        $yearSelect.prop('selectedIndex', 0);
        obsLoader.error('Select a station to view observation data');

        // Cancel any pending requests
        if (requestController) {
            requestController.abort();
            requestController = null;
        }

        // Trigger callback
        if (onPanelClosed) {
            onPanelClosed();
        }
    }

    /**
     * Sets up event handlers for the panel.
     */
    function setupEventHandlers() {
        // Year selection change
        $yearSelect.on('change', updateObservationData);

        // Close button
        $closeBtn.on('click', closePanel);

        // Download button clicks
        $dataList.on('click', '.download-observation', handleDownloadClick);

        // Window resize for mobile expand button
        $(window).on('resize', toggleExpandButton);
    }

    // Initialize event handlers
    setupEventHandlers();

    // Public API
    const observationPanel = {
        /**
         * Shows the panel for a selected weather station.
         * @param {Object} station - WeatherStation instance
         */
        showForStation(station) {
            if (!station || typeof station.getFormattedCoordinates !== 'function') {
                throw new Error('Valid WeatherStation instance required');
            }

            currentStation = station;

            // Update station details
            updateStationDetails(station);

            // Reset year selection
            $yearSelect.prop('selectedIndex', 0);

            // Update UI state
            updateSelectionUI();

            // Reset observation data
            obsLoader.error('Select a year to view observation data');
        },

        /**
         * Closes the observation panel.
         */
        close() {
            closePanel();
        },

        /**
         * Sets callback for when the panel is closed.
         * @param {Function} callback - Callback function () => void
         */
        onPanelClosed(callback) {
            onPanelClosed = callback;
        },

        /**
         * Checks if the panel is currently open.
         * @returns {boolean} True if panel is open
         */
        isOpen() {
            return $panel.hasClass('open');
        },

        /**
         * Checks if the panel is in expanded mode (mobile).
         * @returns {boolean} True if panel is expanded
         */
        isExpanded() {
            return $panel.hasClass('expanded');
        },

        /**
         * Forces the expand button to show/hide based on current screen size.
         */
        updateExpandButton() {
            toggleExpandButton();
        }
    };

    return observationPanel;
}