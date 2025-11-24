using Amazon.S3;
using Amazon.S3.Model;
using Microsoft.Extensions.Caching.Memory;
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
      IAmazonS3 s3Client,
      ILogger<WeatherStationService> logger,
      IOptions<JwtOptions> jwtOptions,
      IOptions<S3Options> s3Options,
      IMemoryCache memoryCache) : IWeatherStationService
    {
        private readonly IAmazonS3 _s3Client = s3Client;
        private readonly JwtOptions _jwtOptions = jwtOptions.Value;
        private readonly S3Options _s3Options = s3Options.Value;
        private readonly IMemoryCache _memoryCache = memoryCache;
        private readonly ILogger _logger = logger;
        private const string STATIONS_CACHE_KEY = "weather_stations";

        
        private async Task<Dictionary<int, WeatherStation>> GetCachedStationsAsync()
        {
            if (_memoryCache.TryGetValue(STATIONS_CACHE_KEY, out Dictionary<int, WeatherStation>? cached))
            {
                return cached!;
            }

            var stations = await LoadStationsFromFileAsync();

            // Cache until 2:30 AM next day
            var expiration = DateTime.Today.AddDays(1).AddHours(2.5);
            _memoryCache.Set(STATIONS_CACHE_KEY, stations, expiration);

            _logger.LogInformation("Loaded and cached {StationCount} weather stations until {ExpirationTime}",
                stations.Count, expiration);

            return stations;
        }

        private async Task<Dictionary<int, WeatherStation>> LoadStationsFromFileAsync()
        {
            try
            {
                var bucketName = _s3Options.Bucket;
                var environment = _s3Options.Prefix;
                var key = $"{environment}/SAWS.JSON";

                _logger.LogInformation("Loading sensors from S3");

                var response = await _s3Client.GetObjectAsync(bucketName, key);
                using var reader = new StreamReader(response.ResponseStream);
                var json = await reader.ReadToEndAsync();

                //var filePath = Path.Combine(env.ContentRootPath, "Data", "sensors.json");
                //if (!File.Exists(filePath))
                //{
                //    logger.LogWarning("Weather stations file not found at {FilePath}", filePath);
                //    return [];
                //}
                //var json = await File.ReadAllTextAsync(filePath);
                using var doc = JsonDocument.Parse(json);
                var currentYearDate = DateTime.Now.Year;
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
                          Id = int.Parse(el.GetProperty("code").GetString()!),
                          Name = el.GetProperty("weather_station_name").GetString()!,
                          Description = el.GetProperty("location_description").GetString()!,
                          Longitude = coords[0],
                          Latitude = coords[1],
                          Elevation = el.GetProperty("elevation").GetInt32(),
                          DataStartYear = el.GetProperty("dataStartYear").GetInt32(),
                          DataEndYear = el.GetProperty("dataEndYear").ValueKind == JsonValueKind.Null ? currentYearDate : el.GetProperty("dataEndYear").GetInt32(),
                          Status = el.GetProperty("status").GetString()!
                      };
                  })
                  .ToDictionary(station => station.Id);

                return stations;
            }
            catch (AmazonS3Exception ex) when (ex.StatusCode == System.Net.HttpStatusCode.NotFound)
            {
                _logger.LogWarning("Sensors file not found in S3");
                return [];
            }
            catch (AmazonS3Exception ex)
            {
                _logger.LogError(ex, "Error reading sensors file from S3");
                return [];
            }
        }

        public async Task<IReadOnlyList<WeatherStation>> ListAllAsync()
        {
            var stations = await GetCachedStationsAsync();
            return [.. stations.Values];
        }
        public async Task<bool> IsValidStationRequestAsync(int stationId, int stationYear)
        {
            var stations = await GetCachedStationsAsync();
            if (!stations.TryGetValue(stationId, out var station))
            {
                return false;
            }
            return stationYear >= station.DataStartYear && stationYear <= station.DataEndYear;
        }

        public async Task<IReadOnlyList<MonthlyFileToken>> GetMonthlyFileTokensAsync(int stationId, int year)
        {
                var availableMonths = await GetAvailableMonthsAsync(stationId, year);
                if (availableMonths.Count == 0)
                {
                    _logger.LogInformation("No data available for station {StationId}, year {Year}", stationId, year);
                }
                var now = DateTime.UtcNow;
                var keyBytes = Encoding.UTF8.GetBytes(_jwtOptions.Key);
                var securityKey = new SymmetricSecurityKey(keyBytes);
                var handler = new JsonWebTokenHandler { SetDefaultTimesOnTokenCreation = false };

                var tokenTasks =
                availableMonths.Select(month => Task.Run(() =>
                {
                    var claims = new Dictionary<string, object>
                    {
                        ["file"] = $"{ stationId }_{ year }_{ month:D2}.csv"
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

        public async Task<Stream?> GetMonthlyDataStreamAsync(int stationId, int year, int month)
        {
            // Validate token and authorization have already occurred via middleware
            var key = BuildS3Key(_s3Options.Prefix, stationId, year, month);
            try
            {
                var request = new GetObjectRequest
                {
                    BucketName = _s3Options.Bucket,
                    Key = key
                };
                using var response = await _s3Client.GetObjectAsync(request);
                var memoryStream = new MemoryStream();
                await response.ResponseStream.CopyToAsync(memoryStream);
                memoryStream.Position = 0;
                return memoryStream;
            }
            catch (AmazonS3Exception ex) when (ex.StatusCode == System.Net.HttpStatusCode.NotFound)
            {
                _logger.LogWarning(ex, "File not found in S3: {S3Key} for station {StationId}", key, stationId);
                return null;
            }
        }

        private async Task<IReadOnlyList<int>> GetAvailableMonthsAsync(int stationId, int year)
        {
                var s3Prefix = _s3Options.Prefix;
                var prefix = $"{s3Prefix}/{stationId}/{year}/";
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

        private static string BuildS3Key(string prefix, int stationId, int year, int month)
          => $"{prefix}/{stationId}/{year}/{stationId}_{year}_{month:D2}.csv";
    }
}
