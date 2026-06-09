using Amazon.S3;
using Amazon.S3.Model;
using CsvHelper;
using CsvHelper.Configuration;
using Microsoft.Extensions.Caching.Memory;
using Microsoft.Extensions.Options;
using Microsoft.IdentityModel.JsonWebTokens;
using Microsoft.IdentityModel.Tokens;
using PWAApi.Configuration;
using PWAApi.Exceptions;
using PWAApi.Models;
using PWAApi.Services.Interfaces;
using System.Globalization;
using System.Text;
using System.Text.Json;

namespace PWAApi.Services
{
    public class WeatherStationService(
      IHostEnvironment env,
      IAmazonS3 s3Client,
      ILogger<WeatherStationService> logger,
      IOptions<JwtOptions> jwtOptions,
      IOptions<S3Options> s3Options,
      IOptions<LimitsOptions> limitsOptions,
      IMemoryCache memoryCache) : IWeatherStationService
    {
        private readonly IAmazonS3 _s3Client = s3Client;
        private readonly JwtOptions _jwtOptions = jwtOptions.Value;
        private readonly S3Options _s3Options = s3Options.Value;
        private readonly IMemoryCache _memoryCache = memoryCache;
        private readonly ILogger _logger = logger;
        private readonly long _maxCombinedInMemoryBytes =
            limitsOptions.Value.MaxCombinedInMemorySizeMb * 1024L * 1024L;
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
            var filePath = Path.Combine(env.ContentRootPath, "data", "stations.json");
            if (!File.Exists(filePath))
            {
                logger.LogWarning("Weather stations file not found at {FilePath}", filePath);
                return [];
            }
            var json = await File.ReadAllTextAsync(filePath);
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
                      Description = el.GetProperty("location_description").GetString(),
                      Longitude = coords[0],
                      Latitude = coords[1],
                      Elevation = el.TryGetProperty("elevation", out var elevProp) && elevProp.ValueKind != JsonValueKind.Null ? elevProp.GetInt32() : null,
                      DataStartYear = el.GetProperty("dataStartYear").GetInt32(),
                      DataEndYear = el.GetProperty("dataEndYear").ValueKind == JsonValueKind.Null ? currentYearDate : el.GetProperty("dataEndYear").GetInt32(),
                      Status = el.GetProperty("status").GetString()!
                  };
              })
              .ToDictionary(station => station.Id);

            return stations;
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

                var tokens = await Task.WhenAll(tokenTasks);

                if (tokens.Length >= 2)
                {
                    var allClaims = new Dictionary<string, object>
                    {
                        ["file"] = $"{stationId}_{year}_all"
                    };
                    var allDescriptor = new SecurityTokenDescriptor
                    {
                        Issuer = _jwtOptions.Issuer,
                        Audience = _jwtOptions.Audience,
                        Claims = allClaims,
                        IssuedAt = now,
                        NotBefore = now,
                        Expires = now.AddMinutes(_jwtOptions.ExpiryMinutes),
                        SigningCredentials = new SigningCredentials(securityKey, SecurityAlgorithms.HmacSha256)
                    };
                    var allToken = handler.CreateToken(allDescriptor);
                    var combinedEntry = new MonthlyFileToken
                    {
                        StationId = stationId,
                        Year = year,
                        Month = 0,
                        Token = allToken,
                        IsYearlyCombined = true
                    };
                    return [.. tokens, combinedEntry];
                }

                return tokens;
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
                try
                {
                    await response.ResponseStream.CopyToAsync(memoryStream);
                    memoryStream.Position = 0;
                    return memoryStream;
                }
                catch
                {
                    await memoryStream.DisposeAsync();
                    throw;
                }
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
                    if (!s3Object.Key.EndsWith(".csv", StringComparison.OrdinalIgnoreCase))
                        continue;

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

        public async Task<Stream?> GetCombinedYearDataStreamAsync(int stationId, int year)
        {
            var availableMonths = await GetAvailableMonthsAsync(stationId, year);
            if (availableMonths.Count == 0)
                return null;

            var sourceStreams = new List<Stream>();
            try
            {
                long totalBytes = 0;
                foreach (var month in availableMonths)
                {
                    var stream = await GetMonthlyDataStreamAsync(stationId, year, month);
                    if (stream == null)
                    {
                        _logger.LogError(
                            "Data file for station {StationId}, year {Year}, month {Month} was unavailable during combined download.",
                            stationId, year, month);
                        throw new InvalidOperationException(
                            $"Data file for month {month} was unavailable. Combined download aborted.");
                    }

                    sourceStreams.Add(stream);
                    totalBytes += stream.Length;

                    if (totalBytes > _maxCombinedInMemoryBytes)
                    {
                        _logger.LogWarning(
                            "Combined data size {TotalBytes} bytes exceeds limit for station {StationId}, year {Year}.",
                            totalBytes, stationId, year);
                        throw new FileSizeLimitExceededException(
                            $"Combined data for year {year} exceeds the {_maxCombinedInMemoryBytes / 1024 / 1024}MB in-memory limit.");
                    }
                }

                var csvConfig = new CsvConfiguration(CultureInfo.InvariantCulture) { HasHeaderRecord = true };

                // Pass 1: collect ordered union of all headers
                var allHeaders = new List<string>();
                var headerSet = new HashSet<string>(StringComparer.Ordinal);

                foreach (var ms in sourceStreams)
                {
                    ms.Position = 0;
                    using var reader = new StreamReader(ms, Encoding.UTF8, false, 1024, leaveOpen: true);
                    using var csv = new CsvReader(reader, csvConfig);
                    csv.Read();
                    csv.ReadHeader();
                    foreach (var header in csv.HeaderRecord!)
                    {
                        if (headerSet.Add(header))
                            allHeaders.Add(header);
                    }
                }

                // Pass 2: write combined CSV to output stream
                var outputStream = new MemoryStream();
                try
                {
                    using var streamWriter = new StreamWriter(outputStream, Encoding.UTF8, 1024, leaveOpen: true);
                    using var csvWriter = new CsvWriter(streamWriter, new CsvConfiguration(CultureInfo.InvariantCulture));

                    foreach (var header in allHeaders)
                        csvWriter.WriteField(header);
                    csvWriter.NextRecord();

                    foreach (var ms in sourceStreams)
                    {
                        ms.Position = 0;
                        using var reader = new StreamReader(ms, Encoding.UTF8, false, 1024, leaveOpen: true);
                        using var csv = new CsvReader(reader, csvConfig);
                        csv.Read();
                        csv.ReadHeader();

                        while (csv.Read())
                        {
                            foreach (var header in allHeaders)
                            {
                                csv.TryGetField<string>(header, out var value);
                                csvWriter.WriteField(value ?? string.Empty);
                            }
                            csvWriter.NextRecord();
                        }
                    }

                    await csvWriter.FlushAsync();
                }
                catch
                {
                    await outputStream.DisposeAsync();
                    throw;
                }

                outputStream.Position = 0;
                return outputStream;
            }
            finally
            {
                foreach (var ms in sourceStreams)
                    ms.Dispose();
            }
        }
    }
}
