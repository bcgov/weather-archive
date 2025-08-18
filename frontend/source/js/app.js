/**
 * PWAApp module encapsulates map initialization, sensor fetching,
 * and UI interactions for displaying and downloading observation data.
 * @module PWAApp
 */
const PWAApp = (() => {
    'use strict';

    // Configuration constants
    const CONFIG = {
        API_BASE: 'api',
        MOBILE_BREAKPOINT: 768,
        MAX_DISPLAY_LENGTH: 500,
        MAX_SEARCH_LENGTH: 50,
        SENSOR_ID_RANGE: { MIN: 1, MAX: 100000 },
        YEAR_RANGE: { MIN: 1975 },
        THROTTLE_DELAY: 50,
        DEBOUNCE_DELAY: 150,
        ANIMATION_DURATION: 300,
        COORDINATE_PRECISION: 5
    };

    // Map configuration
    const MAP_CONFIG = {
        BC_EXTENT: [-160, 40, -100, 70],
        CENTER: [-127.545, 54.15],
        ZOOM: 6,
        MIN_ZOOM: 5,
        BASEMAP_URL: 'https://www.arcgis.com/sharing/rest/content/items/b1624fea73bd46c681fab55be53d96ae/resources/styles/root.json',
        WEBFONTS_PATH: './vendor/fonts/{font-family}/{fontweight}{-fontstyle}.css'
    };

    // Cached jQuery selectors organized by purpose
    const UI_ELEMENTS = {
        sensor: {
            $yearSelect: $('#sensor-year-select'),
            $detailsContents: $('#sensorDetailsContents'),
            $list: $('#sensorList'),
            $listGroup: $('#sensorListGroup'),
            $searchInput: $('#searchInput')
        },
        observation: {
            $dataList: $('#observation-data-list'),
            $loader: $('#observation-loader'),
            $loaderText: $('#observation-loader-text')
        },
        map: {
            $loading: $('#mapLoading'),
            $error: $('#mapError'),
            $panel: $('.map-panel'),
            $tooltip: $('#mapTooltip')
        },
        buttons: {
            $expand: $('#expandBtn'),
            $list: $('#listBtn'),
            $listClose: $('#listCloseBtn'),
            $close: $('#closeBtn')
        },
        details: {
            $name: $('#detailName'),
            $description: $('#detailDescription'),
            $lng: $('#detailLng'),
            $lat: $('#detailLat')
        }
    };

    // Application state
    let map = null;
    let vectorLayer = null;
    let selectedFeature = null;
    let allSensors = [];
    const featureMap = new Map();
    let fileFetchController = null;

    // =============================================================================
    // UTILITY FUNCTIONS
    // =============================================================================

    /**
     * Throttles a function to run at most once per interval.
     * @param {Function} fn - Function to throttle
     * @param {number} wait - Minimum ms between invocations
     * @returns {Function}
     */
    const throttle = (fn, wait) => {
        let last = 0;
        return (...args) => {
            const now = Date.now();
            if (now - last >= wait) {
                last = now;
                fn(...args);
            }
        };
    };

    /**
     * Debounces a function to run only after a period of inactivity.
     * @param {Function} fn - Function to debounce
     * @param {number} delay - Delay in ms
     * @returns {Function}
     */
    const debounce = (fn, delay) => {
        let timerId = null;
        return (...args) => {
            clearTimeout(timerId);
            timerId = setTimeout(() => fn(...args), delay);
        };
    };

    /**
     * Converts a two-digit month code to a full month name.
     * @param {string} monthCode - Month code "01".."12"
     * @returns {string} Month name
     */
    const getMonthName = (monthCode) => {
        const monthNum = parseInt(monthCode, 10);
        if (monthNum < 1 || monthNum > 12 || isNaN(monthNum)) {
            return monthCode;
        }
        
        return new Date(2000, monthNum - 1, 1)
            .toLocaleDateString('en', { month: 'long' });
    };

    /**
     * Checks if a keyboard interaction key is valid for activation.
     * @param {string} key - The keyboard key
     * @returns {boolean} True if key is Enter or Space
     */
    const isValidInteractionKey = (key) => {
        return key === 'Enter' || key === ' ';
    };

    // =============================================================================
    // VALIDATION FUNCTIONS
    // =============================================================================

    /**
     * Validates sensor ID before request.
     * @param {number|string} id - Sensor ID to validate
     * @returns {boolean} True if valid
     */
    const validateSensorId = (id) => {
        const numId = parseInt(id, 10);
        return Number.isInteger(numId) &&
            numId >= CONFIG.SENSOR_ID_RANGE.MIN &&
            numId <= CONFIG.SENSOR_ID_RANGE.MAX;
    };

    /**
     * Validates year before request.
     * @param {number|string} year - Year to validate
     * @returns {boolean} True if valid
     */
    const validateYear = (year) => {
        const numYear = parseInt(year, 10);
        const currentYear = new Date().getFullYear();
        return Number.isInteger(numYear) &&
            numYear >= CONFIG.YEAR_RANGE.MIN &&
            numYear <= currentYear;
    };

    // =============================================================================
    // ERROR HANDLING
    // =============================================================================

    /**
     * Centralized error handling.
     */
    const ErrorHandler = {
        /**
         * Handles errors with appropriate user feedback.
         * @param {Error} error - The error object
         * @param {string} context - Context where error occurred
         * @param {string} userMessage - Message to show user
         */
        handle: (error, context, userMessage = 'An error occurred') => {
            if (error.name === 'AbortError') return;

            console.error(`Error in ${context}:`, error);

            switch (context) {
                case 'download':
                    alert(userMessage);
                    break;
                case 'sensors':
                    sensorLoader.error(userMessage);
                    break;
                case 'observations':
                    obsLoader.error(userMessage);
                    break;
                case 'map':
                    console.error('Map error:', error);
                    break;
                default:
                    console.error('Unhandled error:', error);
            }
        }
    };

    // =============================================================================
    // LOADER MANAGEMENT
    // =============================================================================

    /**
     * Creates a loader controller for managing UI states.
     * @param {jQuery} loaderEl - Loading spinner element
     * @param {jQuery} messageEl - Message/error element
     * @param {jQuery} [contentEl] - Content element to show on success
     * @returns {{loading:Function, success:Function, error:Function}}
     */
    const createLoader = (loaderEl, messageEl, contentEl) => ({
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
    });

    const obsLoader = createLoader(
        UI_ELEMENTS.observation.$loader,
        UI_ELEMENTS.observation.$loaderText,
        UI_ELEMENTS.observation.$dataList
    );

    const sensorLoader = createLoader(
        UI_ELEMENTS.map.$loading,
        UI_ELEMENTS.map.$error
    );

    // =============================================================================
    // MAP STYLING
    // =============================================================================

    /**
     * Generates an OpenLayers icon style from an inline SVG.
     * @param {string} bgColor - Background fill color
     * @param {string} strokeColor - Border stroke color
     * @param {string} iconColor - Inner icon fill color
     * @param {number} zIndex - Rendering order
     * @param {number} [scale=0.8] - Icon scale factor
     * @returns {ol.style.Style}
     */
    const createMarkerStyle = (bgColor, strokeColor, iconColor, zIndex, scale = 0.8) => {
        const svg = `
      <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 16 16">
        <rect x="0.5" y="0.5" width="15" height="15" rx="4" ry="4" 
              fill="${bgColor}" stroke="${strokeColor}" stroke-width="1"/>
        <g fill="${iconColor}" transform="translate(4 4) scale(0.5)">
          <path d="M9.5 12.5a1.5 1.5 0 1 1-2-1.415V6.5a.5.5 0 0 1 1 0v4.585a1.5 1.5 0 0 1 1 1.415"/>
          <path d="M5.5 2.5a2.5 2.5 0 0 1 5 0v7.55a3.5 3.5 0 1 1-5 0zM8 1a1.5 1.5 0 0 0-1.5 1.5v7.987l-.167.15a2.5 2.5 0 1 0 3.333 0l-.166-.15V2.5A1.5 1.5 0 0 0 8 1"/>
        </g>
      </svg>
    `.trim();

        const uri = `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
        return new ol.style.Style({
            image: new ol.style.Icon({ anchor: [0.5, 1], src: uri, scale }),
            zIndex
        });
    };

    // Pre-defined map styles
    const MAP_STYLES = {
        default: createMarkerStyle('white', 'black', 'black', 0),
        hover: createMarkerStyle('#f0f0f0', 'black', 'black', 0),
        active: createMarkerStyle('#38598a', '#38598a', 'white', 1, 0.9)
    };

    // =============================================================================
    // FILE DOWNLOAD
    // =============================================================================

    /**
     * Downloads a CSV file from a protected API endpoint using a Bearer token.
     * @async
     * @param {number} year - The year of the data file to download
     * @param {number} month - The month of the data file to download
     * @param {string} token - The Bearer token used for authorization
     * @returns {Promise<void>}
     */
    const downloadCsvFile = async (year, month, token) => {
        const sensorData = selectedFeature?.get('sensorData');
        const sensorId = sensorData?.id;

        if (!sensorId) {
            alert('No sensor selected');
            return;
        }

        const url = `${CONFIG.API_BASE}/weatherstations/${sensorId}/files/${year}/${month}`;

        try {
            const response = await fetch(url, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (!response.ok) {
                throw new Error(`Download failed with status ${response.status}`);
            }
            // Validate Content-Type header
            const contentType = response.headers.get('Content-Type');
            if (!contentType || !contentType.includes('text/csv')) {
                throw new Error('Invalid file type: Only CSV files are allowed');
            }
            const blob = await response.blob();
            if (blob.type && !blob.type.includes('text/csv') && !blob.type.includes('application/csv')) {
                throw new Error('Invalid file type: Only CSV files are allowed');
            }

            const downloadUrl = window.URL.createObjectURL(blob);

            const link = document.createElement('a');
            link.href = downloadUrl;
            link.download = `${sensorId}_${year}_${month}.csv`;

            document.body.appendChild(link);
            link.click();
            link.remove();

            window.URL.revokeObjectURL(downloadUrl);
        } catch (error) {
            ErrorHandler.handle(error, 'download', 'Failed to download file');
        }
    };

    // =============================================================================
    // FILE RENDERING
    // =============================================================================

    /**
     * Creates a download button for a file.
     * @param {Object} fileData - File data with token, year, month
     * @param {string} monthName - Display name for the month
     * @returns {jQuery} Button element
     */
    const createDownloadButton = (fileData, monthName) => {
        const $button = $('<button>')
            .addClass('btn btn-link download-observation')
            .attr({
                type: 'button',
                'data-file': fileData.token,
                'data-year': fileData.year,
                'data-month': fileData.month,
                'aria-label': `Download data for ${monthName}`,
                'title': `Download data for ${monthName}`
            });

        $('<i>')
            .addClass('bi bi-download')
            .attr('aria-hidden', 'true')
            .appendTo($button);

        return $button;
    };

    /**
     * Creates a list item for a file download.
     * @param {Object} fileData - File data with token, year, month
     * @returns {jQuery} List item element
     */
    const createFileListItem = (fileData) => {
        const monthName = getMonthName(fileData.month || '');

        const $listItem = $('<li>')
            .addClass('list-group-item d-flex justify-content-start align-items-center gap-2')
            .attr('role', 'listitem');

        $('<span>')
            .text(monthName)
            .appendTo($listItem);

        const $button = createDownloadButton(fileData, monthName);
        $listItem.append($button);

        return $listItem;
    };

    /**
     * Populates the observation list with download buttons for each file.
     * @param {Object[]} files - Array of file objects with key, token, year, month
     */
    const renderFiles = (files) => {
        UI_ELEMENTS.observation.$dataList.empty();

        if (!files.length) {
            obsLoader.error('No data for this year');
            return;
        }

        files.forEach((fileData) => {
            const $listItem = createFileListItem(fileData);
            UI_ELEMENTS.observation.$dataList.append($listItem);
        });

        obsLoader.success();
    };

    // =============================================================================
    // API FUNCTIONS
    // =============================================================================

    /**
     * Makes a secure API request with standard headers.
     * @param {string} url - The URL to fetch
     * @param {Object} options - Additional fetch options
     * @returns {Promise<Response>} Fetch response
     */
    const makeApiRequest = async (url, options = {}) => {
        return fetch(url, {
            ...options,
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
                ...options.headers
            }
        });
    };

    /**
     * Fetches observation files for the selected sensor/year and updates UI.
     */
    const updateObservationTable = async () => {
        const year = UI_ELEMENTS.sensor.$yearSelect.val();

        if (!year) {
            obsLoader.error('Select a year to download observation data');
            return;
        }

        obsLoader.loading();

        const sensorData = selectedFeature?.get('sensorData');
        const sensorId = sensorData?.id;

        if (!sensorId) {
            obsLoader.error('No sensor selected');
            return;
        }

        // Cancel any pending request
        fileFetchController?.abort();
        fileFetchController = new AbortController();

        try {
            // Validate inputs
            const sensorIdNum = Number(sensorId);
            const yearNum = Number(year);

            if (!validateSensorId(sensorIdNum) || !validateYear(yearNum)) {
                throw new Error('Invalid sensor ID or year');
            }

            const url = `${CONFIG.API_BASE}/weatherstations/${sensorId}/years/${year}`;
            const response = await makeApiRequest(url, {
                signal: fileFetchController.signal
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }

            const files = await response.json();

            // Ensure the selection hasn't changed while we were fetching
            if (selectedFeature?.get('sensorData').id === sensorId &&
                UI_ELEMENTS.sensor.$yearSelect.val() === year) {
                renderFiles(files);
            }
        } catch (error) {
            ErrorHandler.handle(error, 'observations', 'Error loading data');
        }
    };

    /**
     * Transforms raw sensor data into normalized format.
     * @param {Object} rawSensor - Raw sensor data from API
     * @returns {Object} Normalized sensor data
     */
    const normalizeSensorData = (rawSensor) => ({
        id: rawSensor.id,
        name: rawSensor.name || `Sensor ${rawSensor.id}`,
        description: rawSensor.description || 'No description available',
        longitude: rawSensor.longitude,
        latitude: rawSensor.latitude
    });

    /**
     * Fetches sensors from API and invokes callback with sorted results.
     * @param {Function} callback - Callback function to handle sensor data
     */
    const fetchSensors = async (callback) => {
        sensorLoader.loading();

        try {
            const response = await makeApiRequest(`${CONFIG.API_BASE}/weatherstations`);

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }

            const data = await response.json();

            allSensors = data
                .map(normalizeSensorData)
                .sort((a, b) => a.name.localeCompare(b.name));

            callback(allSensors);
            sensorLoader.success();
        } catch (error) {
            ErrorHandler.handle(error, 'sensors', 'Failed to load sensors');
            callback([]);
        }
    };

    // =============================================================================
    // MAP INITIALIZATION
    // =============================================================================

    /**
     * Initializes the OpenLayers map and base layers.
     */
    const initializeMap = () => {
        const bcExtent = ol.proj.transformExtent(
            MAP_CONFIG.BC_EXTENT,
            'EPSG:4326',
            'EPSG:3857'
        );

        map = new ol.Map({
            target: 'map',
            view: new ol.View({
                center: ol.proj.fromLonLat(MAP_CONFIG.CENTER),
                zoom: MAP_CONFIG.ZOOM,
                minZoom: MAP_CONFIG.MIN_ZOOM,
                extent: bcExtent
            })
        });

        vectorLayer = new ol.layer.Vector({
            source: new ol.source.Vector()
        });

        olms.apply(map, MAP_CONFIG.BASEMAP_URL, {
            webfonts: MAP_CONFIG.WEBFONTS_PATH
        })
            .then(() => {
                const attrLayer = new ol.layer.Vector({
                    source: new ol.source.Vector({ attributions: '| Powered by ESRI' }),
                    style: MAP_STYLES.default
                });

                map.addLayer(vectorLayer);
                map.addLayer(attrLayer);
                setupMapInteractions();
                fetchSensors(loadSensors);
            })
            .catch((error) => {
                ErrorHandler.handle(error, 'map', 'Failed to initialize map');
            });
    };

    // =============================================================================
    // MAP INTERACTIONS
    // =============================================================================

    /**
     * Handles pointer movement over the map for hover effects.
     * @param {ol.MapBrowserEvent} evt - The map event
     * @param {ol.Feature|null} lastHovered - Previously hovered feature
     * @returns {ol.Feature|null} Currently hovered feature
     */
    const handleMapPointerMove = (evt, lastHovered) => {
        if (evt.dragging || map.getView().getAnimating() || map.getView().getInteracting()) {
            UI_ELEMENTS.map.$tooltip.hide();
            return lastHovered;
        }
        const hit = map.forEachFeatureAtPixel(
            evt.pixel,
            (feature, layer) => layer === vectorLayer ? feature : null,
            { layerFilter: (layer) => layer === vectorLayer }
        );

        // Reset previous hover state
        if (lastHovered && lastHovered !== selectedFeature && lastHovered !== hit) {
            lastHovered.setStyle(MAP_STYLES.default);
        }

        // Apply hover state
        if (hit && hit !== selectedFeature) {
            UI_ELEMENTS.map.$tooltip.css({
                left: evt.pixel[0] + 'px',
                top: evt.pixel[1] + 'px'
            });
            UI_ELEMENTS.map.$tooltip.show();
            UI_ELEMENTS.map.$tooltip.text(hit.get('sensorData')?.name || "Unknown");
            hit.setStyle(MAP_STYLES.hover);
            map.getTargetElement().style.cursor = 'pointer';
            return hit;
        } else {
            UI_ELEMENTS.map.$tooltip.hide();
            map.getTargetElement().style.cursor = '';
            return null;
        }
    };

    /**
     * Handles map click events.
     * @param {ol.MapBrowserEvent} evt - The map event
     */
    const handleMapClick = (evt) => {
        const features = map.getFeaturesAtPixel(evt.pixel, {
            layerFilter: (layer) => layer === vectorLayer
        });

        if (features.length) {
            handleSensorSelection(features[0], true);
        }
    };

    /**
     * Sets up hover/click handling for sensor features on the map.
     */
    const setupMapInteractions = () => {
        let lastHovered = null;

        const throttledPointerMove = throttle((evt) => {
            lastHovered = handleMapPointerMove(evt, lastHovered);
        }, CONFIG.THROTTLE_DELAY);

        map.on('pointermove', throttledPointerMove);
        map.on('singleclick', handleMapClick);
    };

    // =============================================================================
    // SENSOR MANAGEMENT
    // =============================================================================

    /**
     * Creates a sensor list item element.
     * @param {Object} sensor - Sensor data
     * @returns {jQuery} List item element
     */
    const createSensorListItem = (sensor) => {
        return $('<li>')
            .addClass('list-group-item list-group-item-action text-decoration-none')
            .attr({
                'data-id': sensor.id,
                'role': 'option',
                'tabindex': '0',
                'aria-label': `Weather station: ${sensor.name}`
            })
            .text(sensor.name);
    };

    /**
     * Creates a map feature for a sensor.
     * @param {Object} sensor - Sensor data
     * @returns {ol.Feature} OpenLayers feature
     */
    const createSensorFeature = (sensor) => {
        const feature = new ol.Feature({
            geometry: new ol.geom.Point(ol.proj.fromLonLat([sensor.longitude, sensor.latitude])),
            sensorData: sensor
        });

        feature.setStyle(MAP_STYLES.default);
        return feature;
    };

    /**
     * Renders sensor features on map and in list UI.
     * @param {Object[]} sensors - Array of sensor objects
     */
    const loadSensors = (sensors) => {
        UI_ELEMENTS.sensor.$listGroup.empty();

        sensors.forEach((sensor) => {
            // Create and add map feature
            const feature = createSensorFeature(sensor);
            vectorLayer.getSource().addFeature(feature);
            featureMap.set(sensor.id, feature);

            // Create and add list item
            const $listItem = createSensorListItem(sensor);
            UI_ELEMENTS.sensor.$listGroup.append($listItem);
        });
    };

    // =============================================================================
    // SENSOR SELECTION
    // =============================================================================

    /**
     * Clears the search filter and shows all sensors.
     */
    const clearSearchFilter = () => {
        UI_ELEMENTS.sensor.$searchInput.val('');
        UI_ELEMENTS.sensor.$listGroup.find('li').show();
    };

    /**
     * Updates the selected feature on the map.
     * @param {ol.Feature} newFeature - The new feature to select
     */
    const updateSelectedFeature = (newFeature) => {
        if (selectedFeature) {
            selectedFeature.setStyle(MAP_STYLES.default);
        }
        selectedFeature = newFeature;
        newFeature.setStyle(MAP_STYLES.active);
    };

    /**
     * Animates the map view to center on a feature.
     * @param {ol.Feature} feature - The feature to center on
     */
    const animateToFeature = (feature) => {
        const coords = feature.getGeometry().getCoordinates();
        map.getView().animate({
            center: coords,
            duration: CONFIG.ANIMATION_DURATION
        });
    };

    /**
     * Updates the sensor detail display with sensor data.
     * @param {Object} sensorData - The sensor data to display
     */
    const updateSensorDetails = (sensorData) => {
        UI_ELEMENTS.details.$name.text(sensorData.name);
        UI_ELEMENTS.details.$description.text(sensorData.description);
        UI_ELEMENTS.details.$lng.text(sensorData.longitude.toFixed(CONFIG.COORDINATE_PRECISION));
        UI_ELEMENTS.details.$lat.text(sensorData.latitude.toFixed(CONFIG.COORDINATE_PRECISION));
    };

    /**
     * Updates the UI state when a sensor is selected.
     * @param {Object} sensorData - The selected sensor data
     */
    const updateSelectionUI = (sensorData) => {
        UI_ELEMENTS.map.$panel.addClass('open').removeClass('expanded');
        resetExpandButton();

        // Update list selection state
        UI_ELEMENTS.sensor.$listGroup.find('li.active')
            .removeClass('active')
            .removeAttr('aria-selected');

        const $targetItem = UI_ELEMENTS.sensor.$listGroup.find(`li[data-id="${sensorData.id}"]`);
        $targetItem
            .addClass('active')
            .attr('aria-selected', 'true')
            .get(0)
            .scrollIntoView({ behavior: 'smooth', block: 'center' });

        UI_ELEMENTS.buttons.$close.focus();
        UI_ELEMENTS.sensor.$detailsContents.scrollTop(0);
        toggleExpandButton();
    };

    /**
     * Handles selection of a sensor, updates map view & detail UI.
     * @param {ol.Feature} feature - The selected feature
     * @param {boolean} fromMap - Whether selection came from map click
     */
    const handleSensorSelection = (feature, fromMap = false) => {
        if (fromMap) {
            clearSearchFilter();
        }

        if (selectedFeature === feature) return;

        updateSelectedFeature(feature);

        if (!fromMap) {
            animateToFeature(feature);
        }

        // Reset year selection
        UI_ELEMENTS.sensor.$yearSelect.prop('selectedIndex', 0).trigger('change');

        const sensorData = feature.get('sensorData');
        updateSensorDetails(sensorData);
        updateSelectionUI(sensorData);
    };

    /**
     * Closes detail pane and resets selection state.
     */
    const closeSensorDetails = () => {
        UI_ELEMENTS.map.$panel.removeClass('open expanded');
        resetExpandButton();

        if (selectedFeature) {
            selectedFeature.setStyle(MAP_STYLES.default);
        }
        selectedFeature = null;

        const $activeItem = UI_ELEMENTS.sensor.$listGroup.find('li.active');
        $activeItem.removeClass('active');

        // Focus appropriate element
        if (UI_ELEMENTS.sensor.$list.hasClass('d-none')) {
            UI_ELEMENTS.buttons.$list.focus();
        } else {
            $activeItem.focus();
        }
    };

    // =============================================================================
    // UI INTERACTIONS
    // =============================================================================

    /**
     * Shows or hides the sensor list overlay.
     */
    const toggleSensorList = () => {
        UI_ELEMENTS.sensor.$list.toggleClass('d-none');
        const isHidden = UI_ELEMENTS.sensor.$list.hasClass('d-none');

        UI_ELEMENTS.sensor.$list.prop('inert', isHidden);
        UI_ELEMENTS.buttons.$list.attr('aria-expanded', !isHidden);

        if (!isHidden && UI_ELEMENTS.sensor.$listGroup.find('li.active').length) {
            const $active = UI_ELEMENTS.sensor.$listGroup.find('li.active');
            $active.get(0).scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    };

    /**
     * Toggles expand button display on mobile.
     */
    const toggleExpandButton = () => {
        if ($(window).width() < CONFIG.MOBILE_BREAKPOINT) {
            UI_ELEMENTS.buttons.$expand.show().off('click').on('click', toggleMobileExpand);
        } else {
            UI_ELEMENTS.buttons.$expand.hide();
        }
    };

    /**
     * Resets expand button icon to collapsed state.
     */
    const resetExpandButton = () => {
        UI_ELEMENTS.buttons.$expand.hide()
            .find('i')
            .removeClass('bi-chevron-down')
            .addClass('bi-chevron-up');
    };

    /**
     * Toggles full-screen detail view on mobile.
     */
    const toggleMobileExpand = () => {
        UI_ELEMENTS.map.$panel.toggleClass('expanded');
        UI_ELEMENTS.buttons.$expand.find('i')
            .toggleClass('bi-chevron-up bi-chevron-down');
    };

    // =============================================================================
    // EVENT HANDLERS
    // =============================================================================

    /**
     * Handles search input with filtering.
     */
    const handleSearchInput = debounce(() => {
        const rawQuery = UI_ELEMENTS.sensor.$searchInput.val();
        const query = rawQuery
            .toLowerCase()
            .substring(0, CONFIG.MAX_SEARCH_LENGTH);

        UI_ELEMENTS.sensor.$listGroup.find('li').each(function () {
            const sensorName = $(this).text().toLowerCase();
            $(this).toggle(sensorName.includes(query));
        });
    }, CONFIG.DEBOUNCE_DELAY);

    /**
     * Handles list item interactions (click and keyboard).
     * @param {Event} event - The interaction event
     */
    const handleListItemInteraction = (event) => {
        if (event.type === 'keydown' && !isValidInteractionKey(event.key)) {
            return;
        }

        event.preventDefault();

        const sensorId = $(event.currentTarget).data('id');
        const feature = featureMap.get(sensorId);

        if (feature) {
            handleSensorSelection(feature, false);
        }
    };

    /**
     * Handles download button clicks.
     * @param {Event} event - The click event
     */
    const handleDownloadClick = (event) => {
        const $button = $(event.currentTarget);
        const token = $button.data('file');
        const year = $button.data('year');
        const month = $button.data('month');

        downloadCsvFile(year, month, token);
    };

    /**
     * Binds UI events for selectors, buttons, and list interactions.
     */
    const setupEventHandlers = () => {
        // Sensor year selection
        UI_ELEMENTS.sensor.$yearSelect.on('change', updateObservationTable);

        // List toggle buttons
        UI_ELEMENTS.buttons.$list.on('click', toggleSensorList);
        UI_ELEMENTS.buttons.$listClose.on('click', toggleSensorList);

        // Detail panel close
        UI_ELEMENTS.buttons.$close.on('click', closeSensorDetails);

        // Search input
        UI_ELEMENTS.sensor.$searchInput.on('input', handleSearchInput);

        // Sensor list interactions
        UI_ELEMENTS.sensor.$listGroup.on('click keydown', 'li', handleListItemInteraction);

        // Download button clicks
        UI_ELEMENTS.observation.$dataList.on('click', '.download-observation', handleDownloadClick);
    };

    // =============================================================================
    // PUBLIC API
    // =============================================================================

    /**
     * Initializes the PWA application.
     */
    const initialize = () => {
        initializeMap();
        setupEventHandlers();
    };

    // Return public interface
    return {
        initialize
    };
})();

// Initialize the application when DOM is ready
$(document).ready(() => {
    PWAApp.initialize();
});