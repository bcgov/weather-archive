/**
 * Weather App (WA) Main Application
 * @module main
 */

import { CONFIG, UI_ELEMENTS } from './config/constants.js';
import { createToastManager } from './core/toastManager.js';
import { createWeatherStation } from './models/WeatherStation.js';
import { createWeatherStationAPI } from './services/WeatherStationAPI.js';
import { createMapController } from './components/MapController.js';
import { createSensorList } from './components/SensorList.js';
import { createObservationPanel } from './components/ObservationPanel.js';

/**
 * Creates the main Weather App instance.
 * @returns {Object} WeatherApp instance
 */
function createWeatherApp() {
    // Core services
    const toastManager = createToastManager();
    const api = createWeatherStationAPI(CONFIG.API_BASE, toastManager);

    // UI Components
    const mapController = createMapController('map', toastManager);
    const sensorList = createSensorList(
        UI_ELEMENTS.sensor.$listGroup,
        UI_ELEMENTS.sensor.$searchInput,
        UI_ELEMENTS.sensor.$list
    );
    const observationPanel = createObservationPanel(api, toastManager);

    /**
     * Handles station selection from any source (map click, list click).
     * @param {Object} station - WeatherStation instance
     * @param {boolean} fromMap - Whether selection came from map interaction
     */
    function handleStationSelection(station, fromMap = false) {
        if (!station) {
            return;
        }
        
        // Update all components to reflect the selection
        if (!fromMap) {
            mapController.selectStation(station);
        }

        // Clear search filter if selection came from map
        if (fromMap) {
            sensorList.clearFilter();
        }

        // Highlight station in list
        sensorList.highlightStation(station);

        // Show observation panel
        observationPanel.showForStation(station);
    }

    /**
     * Clears the current station selection across all components.
     */
    function clearSelection() {
        // Clear selection on Map and Sensor List
        mapController.clearSelection();
        sensorList.highlightStation(null);
    }

    /**
     * Loads weather stations from the API and populates components.
     */
    async function loadStations() {
        try {
            mapController.showLoader();
            const rawStationData = await api.fetchStations();

            if (!rawStationData.length ) {
                mapController.showError("No weather stations found.");
                return;
            }

            // Convert raw data to WeatherStation instances
            let allStations = rawStationData
                .map(rawData => {
                    try {
                        return createWeatherStation(rawData);
                    } catch (error) {
                        console.warn('Failed to create weather station:', rawData, error);
                        return null;
                    }
                });

            // Populate components
            sensorList.render(allStations);
            mapController.addStations(allStations);
            
            mapController.hideLoader();
        } catch (error) {
            toastManager.handleError(error, 'loadStations', 'Failed to load weather stations');
        }
    }

    /**
     * Sets up communication between components.
     */
    function setupComponentCommunication() {
        // Map selection events
        mapController.onFeatureSelected((station, fromMap) => {
            handleStationSelection(station, fromMap);
        });

        // Sensor list click events
        sensorList.onItemClicked((station) => {
            handleStationSelection(station, false);
        });

        // Observation panel close events
        observationPanel.onPanelClosed(() => {
            clearSelection();
        });
    }

    /**
     * Sets up global UI event handlers.
     */
    function setupGlobalEventHandlers() {
        // List toggle buttons
        $(UI_ELEMENTS.buttons.$list).on('click', () => {
            sensorList.toggle();
        });

        $(UI_ELEMENTS.buttons.$listClose).on('click', () => {
            sensorList.hide();
        });

        // Handle window resize for mobile responsiveness
        $(window).on('resize', () => {
            observationPanel.updateExpandButton();
        });

        // Handle keyboard shortcuts
        $(document).on('keydown', (event) => {
            // ESC key closes overlays
            if (event.key === 'Escape') {
                if (observationPanel.isOpen()) {
                    observationPanel.close();
                } else if (sensorList.isOpen()) {
                    sensorList.hide();
                }
            }
        });
    }

    /**
     * Initializes the weather app.
     */
    async function initialize() {
        try {
            // Initialize map
            await mapController.initialize();

            // Setup component communication
            setupComponentCommunication();

            // Setup global event handlers
            setupGlobalEventHandlers();

            // Load stations data
            await loadStations();

        } catch (error) {
            toastManager.handleError(error, 'initialization', 'Failed to initialize Weather Archive');
        }
    }

    // Public API
    const weatherApp = {
        async initialize() {
            await initialize();
        }
    };

    return weatherApp;
}

// Initialize the application when DOM is ready
$(document).ready(async () => {
    try {
        await createWeatherApp().initialize();
    } catch (error) {
        console.error('Failed to initialize Weather Archive:', error);
        // Show fallback error message
        $('body').prepend(`
            <div class="alert alert-danger alert-dismissible fade show position-absolute top-50 start-50 translate-middle w-50" style="z-index:2000;" role="alert">
                <strong>Application Error:</strong> Failed to initialize Weather Archive. Please try again.
            </div>
        `);
    }
});