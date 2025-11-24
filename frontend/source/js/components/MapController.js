/**
 * MapController component factory
 * @module components/MapController
 */


import { MAP_CONFIG, CONFIG, UI_ELEMENTS } from '../config/constants.js';
import { MAP_STYLES } from '../config/MapStyles.js';
import { createLoader } from '../core/loaderManager.js';
/**
 * Creates a MapController for managing OpenLayers map functionality.
 * @param {string} containerId - ID of the map container element
 * @param {Object} toastManager - Toast manager for error handling
 * @returns {Object} MapController instance
 */
export function createMapController(containerId, toastManager) {

    let map = null;
    let vectorLayer = null;
    let selectedFeature = null;
    const featureMap = new Map();
    let lastHoveredFeature = null;
    const $tooltip = UI_ELEMENTS.map.$tooltip;

    // Event callbacks
    let onFeatureSelected = null;

    // Create loder UI element
    const mapLoaderUI = createLoader(
        UI_ELEMENTS.map.$loading,
        UI_ELEMENTS.map.$error
    );

    /**
     * Initializes the OpenLayers map and base layers.
     * @returns {Promise<void>}
     */
    async function initializeMap() {
        try {
            // Create map extent for BC
            const bcExtent = ol.proj.transformExtent(
                [...MAP_CONFIG.BC_EXTENT],
                'EPSG:4326',
                'EPSG:3857'
            );

            // Create map instance
            map = new ol.Map({
                target: containerId,
                view: new ol.View({
                    center: ol.proj.fromLonLat(MAP_CONFIG.CENTER),
                    zoom: MAP_CONFIG.ZOOM,
                    minZoom: MAP_CONFIG.MIN_ZOOM,
                    extent: bcExtent
                })
            });

            // Create vector layer for weather stations
            vectorLayer = new ol.layer.Vector({
                source: new ol.source.Vector()
            });

            // Apply basemap style and add layers
            await olms.apply(map, MAP_CONFIG.BASEMAP_URL, {
                webfonts: MAP_CONFIG.WEBFONTS_PATH
            });

            // Add attribution layer
            const attrLayer = new ol.layer.Vector({
                source: new ol.source.Vector({ 
                    attributions: '| Powered by ESRI' 
                }),
                style: MAP_STYLES.default
            });

            map.addLayer(vectorLayer);
            map.addLayer(attrLayer);

            // Setup map interactions
            setupMapInteractions();

        } catch (error) {
            toastManager.handleError(error, 'mapInitialization', 'Failed to initialize map');
            throw error;
        }
    }

    /**
     * Creates a map feature for a weather station.
     * @param {Object} stationData - Weather station data
     * @returns {ol.Feature} OpenLayers feature
     */
    function createStationFeature(stationData) {
        if (!stationData || typeof stationData.getCoordinates !== 'function') {
            throw new Error('Valid weather station instance required');
        }

        const coordinates = stationData.getCoordinates();
        const feature = new ol.Feature({
            geometry: new ol.geom.Point(ol.proj.fromLonLat(coordinates)),
            sensorData: stationData
        });

        feature.setStyle(MAP_STYLES.default);
        return feature;
    }

    /**
     * Handles pointer movement over the map for hover effects.
     * @param {ol.MapBrowserEvent} evt - The map event
     * @returns {ol.Feature|null} Currently hovered feature
     */
    function handlePointerMove(evt) {
        // Skip if map is being dragged or animated
        if (evt.dragging || map.getView().getAnimating() || map.getView().getInteracting()) {
            hideTooltip();
            return lastHoveredFeature;
        }

        const hit = map.forEachFeatureAtPixel(
            evt.pixel,
            (feature, layer) => layer === vectorLayer ? feature : null,
            { layerFilter: (layer) => layer === vectorLayer }
        );

        // Reset previous hover state
        if (lastHoveredFeature && lastHoveredFeature !== selectedFeature && lastHoveredFeature !== hit) {
            lastHoveredFeature.setStyle(MAP_STYLES.default);
        }

        // Apply hover state
        if (hit && hit !== selectedFeature) {
            showTooltip(evt.pixel, hit.get('sensorData')?.name || "Unknown");
            hit.setStyle(MAP_STYLES.hover);
            map.getTargetElement().style.cursor = 'pointer';
            
            lastHoveredFeature = hit;
            return hit;
        } else {
            hideTooltip();
            map.getTargetElement().style.cursor = '';
            lastHoveredFeature = null;
            return null;
        }
    }

    /**
     * Handles map click events.
     * @param {ol.MapBrowserEvent} evt - The map event
     */
    function handleMapClick(evt) {
        const features = map.getFeaturesAtPixel(evt.pixel, {
            layerFilter: (layer) => layer === vectorLayer
        });

        if (features.length) {
            hideTooltip();
            selectFeature(features[0], true);
        }
    }

    /**
     * Shows tooltip at specified pixel coordinates.
     * @param {number[]} pixel - Pixel coordinates [x, y]
     * @param {string} text - Tooltip text
     */
    function showTooltip(pixel, text) {
        if ($tooltip.length) {
            $tooltip.css({
                left: pixel[0] + 'px',
                top: pixel[1] + 'px'
            });
            $tooltip.text(text).show();
        }
    }

    /**
     * Hides the map tooltip.
     */
    function hideTooltip() {
        if ($tooltip.length) {
            $tooltip.hide();
        }
    }

    /**
     * Sets up hover/click/zoom handling for sensor features on the map.
     */
    function setupMapInteractions() {
        if (!map) return;

        map.on('pointermove', handlePointerMove);
        map.on('singleclick', handleMapClick);
        map.getView().on('change:resolution', () => {
            hideTooltip();
        });
    }

    /**
     * Updates the selected feature on the map.
     * @param {ol.Feature} newFeature - The new feature to select
     */
    function updateSelectedFeature(newFeature) {
        if (selectedFeature) {
            selectedFeature.setStyle(MAP_STYLES.default);
        }
        selectedFeature = newFeature;
        if (newFeature) {
            newFeature.setStyle(MAP_STYLES.active);
        }
    }

    /**
     * Selects a feature and updates the map view.
     * @param {ol.Feature} feature - The feature to select
     * @param {boolean} fromMapClick - Whether selection came from map interaction
     */
    function selectFeature(feature, fromMapClick = false) {
        if (!feature) {
            clearSelection();
            return;
        }

        if (selectedFeature === feature) return;

        updateSelectedFeature(feature);

        // Animate to feature if not from map click
        if (!fromMapClick) {
            animateToFeature(feature);
        }

        // Trigger selection callback
        if (onFeatureSelected) {
            const sensorData = feature.get('sensorData');
            onFeatureSelected(sensorData, fromMapClick);
        }
    }

    /**
     * Animates the map view to center on a feature.
     * @param {ol.Feature} feature - The feature to center on
     */
    function animateToFeature(feature) {
        if (!feature || !map) return;

        const coords = feature.getGeometry().getCoordinates();
        map.getView().animate({
            center: coords,
            duration: CONFIG.ANIMATION_DURATION
        });
    }

    /**
     * Clears the current selection.
     */
    function clearSelection() {
        if (selectedFeature) {
            selectedFeature.setStyle(MAP_STYLES.default);
            selectedFeature = null;
        }

        if (onFeatureSelected) {
            onFeatureSelected(null, false);
        }
    }

    /**
     * Shows loading spinner and hides map content while data is being fetched
     */
    function showMapLoading() {
        mapLoaderUI.loading();
    }

    /**
     * Hides loading spinner and displays map content after successful data load
     */
    function hideMapLoading() {
        mapLoaderUI.success();
    }

    /**
     * Shows error message and hides loading spinner when map data fails to load
     * @param {string} errorMessage - Error message to display to user
     */
    function showMapError(errorMessage) {
        mapLoaderUI.error(errorMessage);
    }

    // Public API
    const mapController = {
        /**
         * Initializes the map.
         * @returns {Promise<void>}
         */
        async initialize() {
            await initializeMap();
        },

        /**
         * Adds weather stations to the map.
         * @param {Object[]} stations - Array of WeatherStation instances
         */
        addStations(stations) {
            if (!Array.isArray(stations)) {
                throw new Error('Stations must be an array');
            }

            if (!vectorLayer) {
                throw new Error('Map must be initialized before adding stations');
            }

            // Clear existing features
            vectorLayer.getSource().clear();
            featureMap.clear();

            stations.forEach((station) => {
                try {
                    const feature = createStationFeature(station);
                    vectorLayer.getSource().addFeature(feature);
                    featureMap.set(station.id, feature);
                } catch (error) {
                    console.warn('Failed to add station to map:', station, error);
                }
            });
        },
        /**
         * Selects a station by ID.
         * @param {Object} station - WeatherStation instance
         * @returns {boolean} True if station was found and selected
         */
        selectStation(station) {
            if (!station || typeof station.id === 'undefined') {
                return false;
            }
            const feature = featureMap.get(station.id);
            if (feature) {
                selectFeature(feature, false);
                return true;
            }
            return false;
        },

        /**
         * Clears the current selection.
         */
        clearSelection() {
            clearSelection();
        },

        /**
         * Shows loader on top of map.
         */
        showLoader() {
            showMapLoading();
        },

        /**
         * Shows loader on top of map.
         */
        hideLoader() {
            hideMapLoading();
        },

        /**
         * Shows error on top of map.
         */
        showError(errorMessage) {
            showMapError(errorMessage);
        },

        /**
         * Sets callback for when a feature is selected.
         * @param {Function} callback - Callback function (sensorData, fromMapClick) => void
         */
        onFeatureSelected(callback) {
            onFeatureSelected = callback;
        },

        /**
         * Gets the OpenLayers map instance.
         * @returns {ol.Map|null} Map instance or null if not initialized
         */
        getMap() {
            return map;
        },
    };

    return mapController;
}