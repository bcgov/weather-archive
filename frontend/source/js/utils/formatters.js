/**
 * Formatting utilities
 * @module utils/formatters
 */

/**
 * Converts a two-digit month code to a full month name.
 * @param {string|number} monthCode - Month code "01".."12" or 1..12
 * @returns {string} Month name
 */
export function getMonthName(monthCode) {
    const monthNum = parseInt(monthCode, 10);
    if (monthNum < 1 || monthNum > 12 || isNaN(monthNum)) {
        return String(monthCode);
    }
    
    return new Date(2000, monthNum - 1, 1)
        .toLocaleDateString('en', { month: 'long' });
}