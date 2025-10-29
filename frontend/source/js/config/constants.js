/**
 * Application configuration constants
 * @module config/constants
 */

// Main application configuration
export const CONFIG = {
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

// Map-specific configuration
export const MAP_CONFIG = {
    BC_EXTENT: [-160, 40, -100, 70],
    CENTER: [-127.545, 54.15],
    ZOOM: 6,
    MIN_ZOOM: 5,
    BASEMAP_URL: 'https://www.arcgis.com/sharing/rest/content/items/b1624fea73bd46c681fab55be53d96ae/resources/styles/root.json',
    WEBFONTS_PATH: './vendor/fonts/{font-family}/{fontweight}{-fontstyle}.css'
};

// UI element selectors organized by component responsibility
export const UI_ELEMENTS = {
    sensor: {
        $yearSelect: $('#sensor-year-select'),
        $detailsContents: $('#sensorDetailsContents'),
        $list: $('#sensorList'),
        $listGroup: $('#sensorListGroup'),
        $searchInput: $('#stationSearchInput')
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
        $list: $('#stationsListBtn'),
        $listClose: $('#stationsListCloseBtn'),
        $close: $('#closeBtn')
    },
    details: {
        $name: $('#detailName'),
        $description: $('#detailDescription'),
        $lng: $('#detailLng'),
        $lat: $('#detailLat')
    }
};