using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using PWAApi.DTOs;
using PWAApi.Models.Queries;
using PWAApi.Services.Interfaces;

namespace PWAApi.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class WeatherStationsController(IWeatherStationService weatherStationService) : ControllerBase
    {
        private readonly IWeatherStationService _weatherStationService = weatherStationService;

        /// <summary>
        /// List all weather stations.
        /// </summary>
        [HttpGet]
        public async Task<ActionResult<IEnumerable<WeatherStationDto>>> GetAllAsync()
        {
            var stationModels = await _weatherStationService.ListAllAsync();
            var dtos = stationModels.Select(m => new WeatherStationDto
            {
                Id = m.Id,
                Name = m.Name,
                Description = m.Description,
                Longitude = m.Longitude,
                Latitude = m.Latitude,
                Elevation = m.Elevation,
                DataStartYear = m.DataStartYear,
                DataEndYear = m.DataEndYear,
                Status = m.Status
            });
            return Ok(dtos);
        }

        /// <summary>
        /// Get download tokens for each month of a specified year.
        /// </summary>
        [HttpGet("{stationId}/years/{year}")]
        public async Task<ActionResult<IEnumerable<MonthlyFileTokenDto>>> GetMonthlyTokensAsync([FromRoute] MonthlyTokenQuery request)
        {
            if (!await _weatherStationService.IsValidStationRequestAsync(request.StationId, request.Year))
            {
                return Problem(
                    statusCode: 404,
                    title: "Data Not Found",
                    detail: "The requested data is not available"
                );
            }
            var tokenModels = await _weatherStationService.GetMonthlyFileTokensAsync(request.StationId, request.Year);
            
            var dtos = tokenModels.Select(m => new MonthlyFileTokenDto
            {
                Year = m.Year,
                Month = m.Month,
                Token = m.Token
            });
            return Ok(dtos);
        }

        /// <summary>
        /// Download monthly CSV data file.
        /// </summary>
        [HttpGet("{stationId}/files/{year}/{month}")]
        [Authorize(AuthenticationSchemes = "Bearer")]
        public async Task<IActionResult> DownloadFileAsync([FromRoute] FileDownloadQuery request)
        {
            if (!await _weatherStationService.IsValidStationRequestAsync(request.StationId, request.Year))
            {
                return Problem(
                    statusCode: 404,
                    title: "Data Not Found",
                    detail: "The requested data is not available"
                );
            }
            // Extract the 'file' claim from the JWT
            var fileClaim = User.FindFirst("file")?.Value;
            var expectedFileKey = $"{request.StationId}_{request.Year:D4}_{request.Month:D2}.csv";

            if (fileClaim == null || !fileClaim.Equals(expectedFileKey, StringComparison.OrdinalIgnoreCase))
            {
                return Unauthorized();
            }

            var stream = await _weatherStationService.GetMonthlyDataStreamAsync(request.StationId, request.Year, request.Month);
            if (stream == null)
            {
                return NotFound();
            }

            var fileName = $"{request.StationId}_{request.Year}_{request.Month}.csv";
            return File(stream, "text/csv", fileName);
      
        }
    }
}
