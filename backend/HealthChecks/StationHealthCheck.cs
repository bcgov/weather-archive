using Microsoft.Extensions.Diagnostics.HealthChecks;

namespace PWAApi.HealthChecks
{
    public class StationHealthCheck : IHealthCheck
    {
        public async Task<HealthCheckResult> CheckHealthAsync(HealthCheckContext context, CancellationToken cancellationToken = default)
        {
            try
            {
                var sensorsFilePath = Path.Combine("Data", "sensors.json");

                if (!File.Exists(sensorsFilePath))
                    return HealthCheckResult.Unhealthy("sensors.json file not found");

                // Verify file is readable and contains valid JSON
                var content = await File.ReadAllTextAsync(sensorsFilePath, cancellationToken);
                if (string.IsNullOrWhiteSpace(content))
                    return HealthCheckResult.Unhealthy("sensors.json file is empty");

                // Basic JSON validation
                await Task.Run(() => System.Text.Json.JsonDocument.Parse(content), cancellationToken);

                return HealthCheckResult.Healthy("sensors.json file is accessible and valid");
            }
            catch (System.Text.Json.JsonException ex)
            {
                return HealthCheckResult.Unhealthy($"sensors.json contains invalid JSON: {ex.Message}");
            }
            catch (Exception ex)
            {
                return HealthCheckResult.Unhealthy($"sensors.json file check failed: {ex.Message}");
            }
        }
    }
}
