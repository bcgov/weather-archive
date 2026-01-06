/**
 * SensorList component factory
 * @module components/SensorList
 */

import { CONFIG, UI_ELEMENTS } from '../config/constants.js';

/**
 * Creates a SensorList component for managing sensor list UI and interactions.
 * @param {string} containerSelector - Selector for the list container
 * @param {string} searchSelector - Selector for the search input
 * @param {string} listOverlaySelector - Selector for the list overlay
 * @returns {Object} SensorList instance
 */
export function createSensorList(containerSelector, searchSelector, listOverlaySelector) {
    if (!containerSelector || !searchSelector || !listOverlaySelector) {
        throw new Error('Container, search, and list overlay selectors are required');
    }

    let stations = [];
    // jQuery elements
    const $container = $(containerSelector);
    const $searchInput = $(searchSelector);
    const $listOverlay = $(listOverlaySelector);
    const $listButton = $(UI_ELEMENTS.buttons.$list);
    let $currentActiveItem = null;
    // Event callbacks
    let onItemClicked = null;

    /**
     * Checks if a keyboard interaction key is valid for activation.
     * @param {string} key - The keyboard key
     * @returns {boolean} True if key is Enter or Space
     */
    function isValidInteractionKey(key) {
        return key === 'Enter' || key === ' ';
    }

    /**
     * Creates a sensor list item element.
     * @param {Object} station - WeatherStation instance
     * @returns {jQuery} List item element
     */
    function createListItem(station) {
        if (!station || typeof station.id === 'undefined') {
            throw new Error('Valid weather station required');
        }
        const $listItem = $('<li>')
            .addClass('list-group-item list-group-item-action text-decoration-none d-flex align-items-center')
            .attr({
                'data-id': station.id,
                'role': 'option',
                'tabindex': '0',
                'aria-label': `Weather station: ${station.name}`
            });

        // Add station name
        $('<span>')
            .text(station.name)
            .appendTo($listItem);

        // Add status indicator pill for stations
        if (station.status && station.status.toLowerCase() !== 'active') {
            const statusConfig = {
                'inactive': {
                    label: 'Inactive',
                    iconClass: 'bi bi-dash-circle-fill text-warning'
                },
                'decommissioned': {
                    label: 'Decommissioned',
                    iconClass: 'bi bi-stop-circle-fill text-danger'
                }
            };
            
            const status = station.status.toLowerCase();
            const config = statusConfig[status];
            
            if (config) {
                const $statusPill = $('<span>')
                    .addClass('badge rounded-pill bg-white mx-2')
                    .attr({
                        'role': 'status',
                        'aria-label': config.label
                    })
                    .append(
                        $('<i>')
                            .addClass(config.iconClass)
                            .attr('aria-hidden', 'true')
                    )
                    .append(
                        $('<span>')
                            .addClass('visually-hidden')
                            .text(config.label)
                    );
                
                $listItem.append($statusPill);
            }
        }
        return $listItem;
    }

    /**
     * Handles search input with filtering.
     */
    const handleSearch = () => {
        const rawQuery = $searchInput.val();
        const query = rawQuery
            .toLowerCase()
            .substring(0, CONFIG.MAX_SEARCH_LENGTH);
        
        $container.find('li').each(function () {
            const $item = $(this);
            // Get only the station name (first span), not the status badge
            const stationName = $item.find('span').first().text().toLowerCase();
            if (stationName.includes(query)) {
                $item.removeClass('d-none');
            } else {
                $item.addClass('d-none');
            }
        });
    };

    /**
     * Handles list item interactions (click and keyboard).
     * @param {Event} event - The interaction event
     */
    function handleItemInteraction(event) {
        if (event.type === 'keydown' && !isValidInteractionKey(event.key)) {
            return;
        }

        event.preventDefault();

        const stationId = parseInt($(event.currentTarget).data('id'), 10);
        const station = stations.find(s => s.id === stationId);

        if (station && onItemClicked) {
            onItemClicked(station);
        }
    }

    /**
     * Updates the visual selection state of a list item.
     * @param {number|null} stationId - The station ID to highlight, or null to clear
     */
    function updateListItemHighlight(stationId) {
        // Remove previous highlight
        if ($currentActiveItem) {
            $currentActiveItem
                .removeClass('active')
                .removeAttr('aria-selected');
            $currentActiveItem = null; // Clear the cache
        }

        if (stationId !== null) {
            // Add new highlight
            $currentActiveItem = $container.find(`li[data-id="${stationId}"]`);
            if ($currentActiveItem.length) {
                // Apply active state
                $currentActiveItem
                    .addClass('active')
                    .attr('aria-selected', 'true');

                // Scroll using cached element
                $currentActiveItem[0].scrollIntoView({ 
                    behavior: 'smooth', 
                    block: 'center' 
                });
            } else {
                // Item not found, clear cache
                $currentActiveItem = null;
            }
        }
    }

    /**
     * Sets up event handlers for search and list interactions.
     */
    function setupEventHandlers() {
        // Search input
        $searchInput.on('input', handleSearch);

        // List item interactions
        $container.on('click keydown', 'li', handleItemInteraction);

    }

    // Initialize event handlers
    setupEventHandlers();

    // Public API
    const sensorList = {
        /**
         * Renders the list of weather stations.
         * @param {Object[]} weatherStations - Array of WeatherStation instances
         */
        render(weatherStations) {
            if (!Array.isArray(weatherStations)) {
                throw new Error('Weather stations must be an array');
            }
            $currentActiveItem = null;
            stations = weatherStations;
            
            // Sort stations by name for better UX
            const sortedStations = [...stations].sort((a, b) => 
                a.name.localeCompare(b.name)
            );

            $container.empty();

            sortedStations.forEach((station) => {
                try {
                    const $listItem = createListItem(station);
                    $container.append($listItem);
                } catch (error) {
                    console.warn('Failed to create list item for station:', station, error);
                }
            });
        },

        /**
         * Highlights a station in the list
         * @param {Object|number|null} station - WeatherStation instance, station ID, or null to clear
         */
        highlightStation(station) {
            let stationId = null;
            
            if (station === null || station === undefined) {
                stationId = null;
            } else if (typeof station === 'number') {
                stationId = station;
            } else if (station && typeof station.id !== 'undefined') {
                stationId = station.id;
            }
            
            updateListItemHighlight(stationId);
        },

        /**
         * Sets callback for when a list item is clicked.
         * @param {Function} callback - Callback function (station) => void
         */
        onItemClicked(callback) {
            onItemClicked = callback;
        },

        /**
         * Clears the search filter and shows all stations.
         */
        clearFilter() {
            $searchInput.val('');
            $container.find('li').removeClass('d-none');
        },

        /**
         * Shows the sensor list overlay.
         */
        show() {
            $listOverlay.removeClass('d-none');
            $listOverlay.prop('inert', false);

            // Update button state if it exists
            if ($listButton.length) {
                $listButton.attr('aria-expanded', 'true');
            }

            // Scroll to active item if it exists
            if ($currentActiveItem && $currentActiveItem.length) {
                $currentActiveItem[0].scrollIntoView({ 
                    behavior: 'smooth', 
                    block: 'center' 
                });
            }
        },

        /**
         * Hides the sensor list overlay.
         */
        hide() {
            $listOverlay.addClass('d-none');
            $listOverlay.prop('inert', true);

            // Update button state if it exists
            if ($listButton.length) {
                $listButton.attr('aria-expanded', 'false');
            }
        },

        /**
         * Toggles the sensor list overlay visibility.
         */
        toggle() {
            const isHidden = $listOverlay.hasClass('d-none');
            if (isHidden) {
                this.show();
            } else {
                this.hide();
            }
        },

        /**
         * Checks if the sensor list is currently open.
         * @returns {boolean} True if sensor list is open
         */
        isOpen(){
            return !$listOverlay.hasClass('d-none');
        }
    };

    return sensorList;
}