/**
 * Input validation utilities
 * @module utils/validation
 */

import { CONFIG } from '../config/constants.js';

/**
 * Validates sensor ID before request.
 * @param {number|string} id - Sensor ID to validate
 * @returns {boolean} True if valid
 */
export function validateSensorId(id) {
    const numId = parseInt(id, 10);
    return Number.isInteger(numId) &&
        numId >= CONFIG.SENSOR_ID_RANGE.MIN &&
        numId <= CONFIG.SENSOR_ID_RANGE.MAX;
}

/**
 * Validates year before request.
 * @param {number|string} year - Year to validate
 * @returns {boolean} True if valid
 */
export function validateYear(year) {
    const numYear = parseInt(year, 10);
    const currentYear = new Date().getFullYear();
    return Number.isInteger(numYear) &&
        numYear >= CONFIG.YEAR_RANGE.MIN &&
        numYear <= currentYear;
}

