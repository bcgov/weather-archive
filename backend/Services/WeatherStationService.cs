using Amazon.S3;
using Amazon.S3.Model;
using Microsoft.Extensions.Options;
using Microsoft.IdentityModel.JsonWebTokens;
using Microsoft.IdentityModel.Tokens;
using PWAApi.Configuration;
using PWAApi.Models;
using PWAApi.Services.Interfaces;
using System.Text;
using System.Text.Json;

namespace PWAApi.Services
{
    public class WeatherStationService(
      IHostEnvironment env,
      IAmazonS3 s3Client,
      IOptions<JwtOptions> jwtOptions,
      IOptions<S3Options> s3Options) : IWeatherStationService
    {
        private readonly IAmazonS3 _s3Client = s3Client;
        private readonly JwtOptions _jwtOptions = jwtOptions.Value;
        private readonly S3Options _s3Options = s3Options.Value;

        public async Task<IReadOnlyList<WeatherStation>> ListAllAsync()
        {
            var filePath = Path.Combine(env.ContentRootPath, "Data", "sensors.json");
            if (!File.Exists(filePath))
            {
                return [];
            }

            var json = await File.ReadAllTextAsync(filePath);
            using var doc = JsonDocument.Parse(json);

            var stations = doc.RootElement.EnumerateArray()
              .Select(el =>
              {
                  // parse coordinates array: [lon, lat]
                  var coords = el.GetProperty("location")
                           .GetProperty("coordinates")
                           .EnumerateArray()
                           .Select(j => j.GetDouble())
                           .ToArray();

                  return new WeatherStation
                  {
                      Id = int.Parse(el.GetProperty("id").GetString()!),
                      Name = el.GetProperty("weather_station_name").GetString()!,
                      Description = el.GetProperty("location_description").GetString()!,
                      Longitude = coords[0],
                      Latitude = coords[1]
                  };
              })
              .ToList();

            return stations;
        }

        public async Task<IReadOnlyList<MonthlyFileToken>> GetMonthlyFileTokensAsync(int stationId, int year)
        {
            try
            {
                // TODO: Determine available months (e.g., from S3 or precomputed data)
                var availableMonths = await GetAvailableMonthsAsync(stationId, year);

                var now = DateTime.UtcNow;
                var keyBytes = Encoding.UTF8.GetBytes(_jwtOptions.Key);
                var securityKey = new SymmetricSecurityKey(keyBytes);
                var handler = new JsonWebTokenHandler { SetDefaultTimesOnTokenCreation = false };

                var tokens = new List<MonthlyFileToken>();
                var tokenTasks =
                availableMonths.Select(month => Task.Run(() =>
                {
                    var claims = new Dictionary<string, object>
                    {
                        ["file"] = BuildS3Key(stationId, year, month)
                    };
                    var descriptor = new SecurityTokenDescriptor
                    {
                        Issuer = _jwtOptions.Issuer,
                        Audience = _jwtOptions.Audience,
                        Claims = claims,
                        IssuedAt = now,
                        NotBefore = now,
                        Expires = now.AddMinutes(_jwtOptions.ExpiryMinutes),
                        SigningCredentials = new SigningCredentials(securityKey, SecurityAlgorithms.HmacSha256)
                    };
                    var token = handler.CreateToken(descriptor);
                    return new MonthlyFileToken
                    {
                        StationId = stationId,
                        Year = year,
                        Month = month,
                        Token = token
                    };
                }));

                return await Task.WhenAll(tokenTasks);
            }
            catch
            {
                throw new Exception("An error occurred while generating monthly file tokens.");
            }
        }

        public async Task<Stream?> GetMonthlyDataStreamAsync(int stationId, int year, int month)
        {
            // Validate token and authorization have already occurred via middleware
            var key = BuildS3Key(stationId, year, month);
            try
            {
                var response = await _s3Client.GetObjectAsync(new GetObjectRequest
                {
                    BucketName = _s3Options.Bucket,
                    Key = key
                });
                return response.ResponseStream;
            }
            catch (AmazonS3Exception ex) when (ex.StatusCode == System.Net.HttpStatusCode.NotFound)
            {
                return null;
            }
        }

        private async Task<IReadOnlyList<int>> GetAvailableMonthsAsync(int stationId, int year)
        {
            //Needs caching
            try
            {
                var prefix = $"{stationId}_{year}_";
                var request = new ListObjectsV2Request
                {
                    BucketName = _s3Options.Bucket,
                    Prefix = prefix
                };

                var months = new HashSet<int>();
                var response = await _s3Client.ListObjectsV2Async(request);


                if (response.S3Objects == null || response.S3Objects.Count == 0)
                {
                    return [];
                }


                foreach (var s3Object in response.S3Objects)
                {
                    var fileName = Path.GetFileNameWithoutExtension(s3Object.Key); // e.g., "1111_2024_01"
                    var parts = fileName.Split('_');
                    if (parts.Length == 3 && int.TryParse(parts[2], out int month) && month >= 1 && month <= 12)
                    {
                        months.Add(month);
                    }
                }

                return [.. months.OrderBy(m => m)];
            }
            catch
            {
                throw new Exception("An error occurred while getting monthly data for sensor.");
            }
        }

        private static string BuildS3Key(int stationId, int year, int month)
          => $"{stationId}_{year}_{month:D2}.csv";
    }
}
