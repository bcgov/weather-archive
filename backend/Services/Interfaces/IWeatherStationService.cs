using PWAApi.Models;

namespace PWAApi.Services.Interfaces
{
    public interface IWeatherStationService
    {
        /// <summary>
        /// Retrieves all weather stations.
        /// </summary>
        Task<IReadOnlyList<WeatherStation>> ListAllAsync();

        /// <summary>
        /// Retrieves download tokens for each month of the specified year for a station.
        /// </summary>
        Task<IReadOnlyList<MonthlyFileToken>> GetMonthlyFileTokensAsync(int stationId, int year);

        /// <summary>
        /// Gets a readable stream for the monthly CSV data file.
        /// Throws UnauthorizedAccessException if token validation fails.
        /// </summary>
        Task<Stream?> GetMonthlyDataStreamAsync(int stationId, int year, int month);
    }
}
