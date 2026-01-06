using Amazon.S3;
using Microsoft.Extensions.Diagnostics.HealthChecks;

namespace PWAApi.HealthChecks
{
    public class S3HealthCheck(IAmazonS3 s3Client) : IHealthCheck
    {
        private readonly IAmazonS3 _s3Client = s3Client;

        public async Task<HealthCheckResult> CheckHealthAsync(HealthCheckContext context, CancellationToken cancellationToken = default)
        {
            try
            {
                await _s3Client.ListBucketsAsync(cancellationToken);
                return HealthCheckResult.Healthy("S3 is reachable");
            }
            catch (Exception ex)
            {
                return HealthCheckResult.Unhealthy("S3 check failed", ex);
            }
        }
    }
}
