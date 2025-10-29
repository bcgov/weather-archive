using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Diagnostics.HealthChecks;
using System.Text.Json;


namespace PWAApi.Controllers
{
    [ApiController]
    [Route("[controller]")]
    public class HealthController(HealthCheckService healthCheckService, ILogger<HealthController> logger) : ControllerBase
    {
        private readonly HealthCheckService _healthCheckService = healthCheckService;
        private readonly ILogger<HealthController> _logger = logger;

        private const string HealthCheckFailedMessage = "Health check failed";

        /// <summary>
        /// Liveness probe - checks if the application is running
        /// Used by Kubernetes to determine if pod should be restarted
        /// </summary>
        [HttpGet("live")]
        public async Task<IActionResult> GetLiveness()
        {
            try
            {
                var result = await _healthCheckService.CheckHealthAsync(
                  check => check.Tags.Contains("liveness") || check.Name == "liveness"
                );

                return result.Status == HealthStatus.Healthy
                  ? Ok("Healthy")
                  : StatusCode(503, "Unhealthy");
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, HealthCheckFailedMessage);
                return StatusCode(503, HealthCheckFailedMessage);
            }
        }

        /// <summary>
        /// Readiness probe - checks if application can handle requests
        /// Used by Kubernetes to determine if pod should receive traffic
        /// </summary>
        [HttpGet("ready")]
        public async Task<IActionResult> GetReadiness()
        {
            try
            {
                var result = await _healthCheckService.CheckHealthAsync();

                var response = new
                {
                    status = result.Status.ToString(),
                    checks = result.Entries.Select(x => new
                    {
                        name = x.Key,
                        status = x.Value.Status.ToString(),
                        description = x.Value.Description,
                        duration = x.Value.Duration.TotalMilliseconds
                    })
                };

                var jsonResponse = JsonSerializer.Serialize(response);

                return result.Status == HealthStatus.Healthy
                  ? Ok(jsonResponse)
                  : StatusCode(503, jsonResponse);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, HealthCheckFailedMessage);
                return StatusCode(503, HealthCheckFailedMessage);
            }
        }

        /// <summary>
        /// General health endpoint - basic health status
        /// </summary>
        [HttpGet]
        public async Task<IActionResult> GetHealth()
        {
            try
            {
                var result = await _healthCheckService.CheckHealthAsync();

                return result.Status == HealthStatus.Healthy
                  ? Ok(result.Status.ToString())
                  : StatusCode(503, result.Status.ToString());
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, HealthCheckFailedMessage);
                return StatusCode(503, HealthCheckFailedMessage);
            }
        }
    }
}
