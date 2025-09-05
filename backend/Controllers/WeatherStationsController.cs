using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using PWAApi.DTOs;
using PWAApi.Models.Queries;
using PWAApi.Services.Interfaces;
using System.ComponentModel.DataAnnotations;

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
                Latitude = m.Latitude
            });
            return Ok(dtos);
        }

        /// <summary>
        /// Get download tokens for each month of a specified year.
        /// </summary>
        [HttpGet("{stationId}/years/{year}")]
        public async Task<ActionResult<IEnumerable<MonthlyFileTokenDto>>> GetMonthlyTokensAsync([FromRoute] int stationId, [FromRoute] int year)
        {
            var request = new MonthlyTokenQuery
            {
                StationId = stationId,
                Year = year
            };
            var validationContext = new ValidationContext(request);
            var validationResults = new List<ValidationResult>();

            if (!Validator.TryValidateObject(request, validationContext, validationResults, true))
            {
                return BadRequest();
            }
            var tokenModels = await _weatherStationService.GetMonthlyFileTokensAsync(request.StationId, request.Year);
            if (tokenModels == null || !tokenModels.Any())
            {
                return Ok(Enumerable.Empty<MonthlyFileTokenDto>());
            }

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
        public async Task<IActionResult> DownloadFileAsync([FromRoute] int stationId, [FromRoute] int year, [FromRoute] int month)
        {
            try
            {
                var request = new FileDownloadQuery
                {
                    StationId = stationId,
                    Year = year,
                    Month = month
                };
                var validationContext = new ValidationContext(request);
                var validationResults = new List<ValidationResult>();

                if (!Validator.TryValidateObject(request, validationContext, validationResults, true))
                {
                    return BadRequest();
                }
                // Extract the 'file' claim from the JWT
                var fileClaim = User.FindFirst("file")?.Value;
                var expectedFileKey = $"{stationId}_{year:D4}_{month:D2}.csv";

                if (fileClaim == null || !fileClaim.EndsWith(expectedFileKey, StringComparison.OrdinalIgnoreCase))
                {
                    return Unauthorized(); // Claim is missing or doesn't match the requested file
                }

                var stream = await _weatherStationService.GetMonthlyDataStreamAsync(stationId, year, month);
                if (stream == null)
                {
                    return NotFound();
                }

                var fileName = $"{stationId}_{year}_{month}.csv";
                return File(stream, "text/csv", fileName);
            }
            catch (UnauthorizedAccessException)
            {
                return Unauthorized();
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { error = ex.Message });
            }
        }
    }
}
