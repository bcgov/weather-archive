/**
 * WeatherStation API service factory
 * @module services/WeatherStationAPI
 */

import { validateSensorId, validateYear } from '../utils/validation.js';

/**
 * Creates a WeatherStation API service for handling all external communication.
 * @param {string} baseUrl - Base URL for the API
 * @param {Object} toastManager - Toast manager for error handling
 * @returns {Object} WeatherStationAPI instance
 */
export function createWeatherStationAPI(baseUrl, toastManager) {


    /**
     * Makes a secure API request with standard headers.
     * @param {string} url - The URL to fetch (relative to baseUrl)
     * @param {Object} options - Additional fetch options
     * @returns {Promise<Response>} Fetch response
     */
    async function makeRequest(url, options = {}) {
        // Ensure URL is relative to base URL
        const fullUrl = `${baseUrl}/${url.replace(/^\//, '')}`;
        
        return fetch(fullUrl, {
            ...options,
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
                ...options.headers
            }
        });
    }

    /**
     * Handles API response and error checking.
     * @param {Response} response - Fetch response
     * @returns {Promise<any>} Parsed response data
     */
    async function handleResponse(response) {
        if (!response.ok) {
            const error = new Error(`HTTP ${response.status}: ${response.statusText}`);
            error.status = response.status;
            error.response = response;
            throw error;
        }

        // Handle different content types
        const contentType = response.headers.get('Content-Type');
        if (contentType && contentType.includes('application/json')) {
            return response.json();
        }
        
        return response;
    }

    const api = {
        /**
         * Fetches all weather stations from the API.
         * @returns {Promise<Object[]>} Array of raw weather station data
         */
        async fetchStations() {
            try {
                const response = await makeRequest('weatherstations');
                const data = await handleResponse(response);
                
                if (!Array.isArray(data)) {
                    throw new Error('Invalid response from API.');
                }

                return data;
            } catch (error) {
                toastManager.handleError(error, 'fetchStations', 'Failed to load weather stations');
                return [];
            }
        },

        /**
         * Fetches observation files for a specific sensor and year.
         * @param {number} sensorId - The sensor ID
         * @param {number} year - The year to fetch data for
         * @param {AbortSignal} [signal] - Optional abort signal for cancellation
         * @returns {Promise<Object[]>} Array of file metadata objects
         */
        async fetchObservationFiles(sensor, year, signal = null) {
            try {
                // Validate inputs
                const sensorIdNum = Number(sensor.id);
                const yearNum = Number(year);

                if (!validateSensorId(sensorIdNum)) {
                    throw new Error('Invalid sensor ID');
                }

                if (!validateYear(yearNum, sensor.dataStart, sensor.dataEnd)) {
                    throw new Error('Invalid year');
                }

                const url = `weatherstations/${sensor.id}/years/${year}`;
                const response = await makeRequest(url, {
                    signal
                });

                const files = await handleResponse(response, 'fetchObservationFiles');

                if (!Array.isArray(files)) {
                    throw new Error('Invalid response from API.');
                }

                return files;
            } catch (error) {
                if (error.name === 'AbortError') {
                    return []; // Silent fail for aborted requests
                }
                
                toastManager.handleError(error, 'fetchObservationFiles', 'Error loading observation data');
                return [];
            }
        },

        /**
         * Downloads a CSV file for a specific sensor, year, and month.
         * @param {number} sensorId - The sensor ID
         * @param {number} year - The year of the data
         * @param {number} month - The month of the data
         * @param {string} token - The Bearer token for authorization
         * @returns {Promise<void>}
         */
        async downloadFile(sensorId, year, month, token) {
            try {
                // Validate inputs
                if (!sensorId) {
                    throw new Error('Sensor ID is required');
                }

                if (!token || typeof token !== 'string') {
                    throw new Error('Valid authorization token is required');
                }

                const url = `weatherstations/${sensorId}/files/${year}/${month}`;
                const response = await makeRequest(url, {
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
                
                // Additional blob type validation
                if (blob.type && !blob.type.includes('text/csv') && !blob.type.includes('application/csv')) {
                    throw new Error('Invalid file type: Only CSV files are allowed');
                }

                // Create download
                const downloadUrl = window.URL.createObjectURL(blob);
                const link = document.createElement('a');
                link.href = downloadUrl;
                link.download = `${sensorId}_${year}_${month.toString().padStart(2, '0')}.csv`;

                document.body.appendChild(link);
                link.click();
                link.remove();

                window.URL.revokeObjectURL(downloadUrl);

            } catch (error) {
                toastManager.handleError(error, 'downloadFile', 'Failed to download file');
            }
        },

        /**
         * Creates a new AbortController for request cancellation.
         * @returns {AbortController} New abort controller
         */
        createAbortController() {
            return new AbortController();
        },


    };

    return api;
}