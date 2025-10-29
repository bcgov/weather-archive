/**
 * WeatherStation model factory
 * @module models/WeatherStation
 */

import { validateSensorId } from '../utils/validation.js';
import { CONFIG } from '../config/constants.js';

/**
 * Creates a WeatherStation model instance with validation and behavior.
 * @param {Object} rawData - Raw sensor data from API
 * @param {number} rawData.id - Sensor ID
 * @param {string} [rawData.name] - Sensor name
 * @param {string} [rawData.description] - Sensor description
 * @param {number} rawData.longitude - Longitude coordinate
 * @param {number} rawData.latitude - Latitude coordinate
 * @returns {Object} WeatherStation instance
 */
export function createWeatherStation(rawData) {
    // Validate required data
    if (!rawData || typeof rawData !== 'object') {
        throw new Error('Weather station data is required');
    }

    if (!validateSensorId(rawData.id)) {
        throw new Error(`Invalid sensor ID: ${rawData.id}`);
    }

    if (typeof rawData.longitude !== 'number' || typeof rawData.latitude !== 'number') {
        throw new Error('Valid longitude and latitude coordinates are required');
    }


    // Create the weather station object
    const station = {
        id: rawData.id,
        name: rawData.name || `Sensor ${rawData.id}`,
        description: rawData.description || 'No description available',
        longitude: rawData.longitude,
        latitude: rawData.latitude,

        /**
         * Gets the coordinates as an array [longitude, latitude].
         * @returns {number[]} Coordinate array
         */
        getCoordinates() {
            return [this.longitude, this.latitude];
        },

        /**
         * Gets formatted coordinate display strings.
         * @returns {Object} Object with formatted lng and lat strings
         */
        getFormattedCoordinates() {
            return {
                lng: this.longitude.toFixed(CONFIG.COORDINATE_PRECISION),
                lat: this.latitude.toFixed(CONFIG.COORDINATE_PRECISION)
            };
        },


    };

    return station;
}