using Amazon.S3;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.Extensions.Diagnostics.HealthChecks;
using Microsoft.Extensions.Options;
using Microsoft.IdentityModel.Tokens;
using PWAApi.Configuration;
using PWAApi.Exceptions;
using PWAApi.HealthChecks;
using PWAApi.Services;
using PWAApi;
using PWAApi.Services.Interfaces;
using System.Text;

var builder = WebApplication.CreateBuilder(args);

builder.Configuration.AddEnvironmentVariables();

// Validate critical configuration
var jwtSection = builder.Configuration.GetSection("Jwt");
var jwtOptions = jwtSection.Get<JwtOptions>();
if (string.IsNullOrWhiteSpace(jwtOptions?.Key) || jwtOptions.Key.Length < Security.MinJwtKeyLength)
{
    throw new InvalidOperationException($"JWT Key is required and must be at least {Security.MinJwtKeyLength} characters");
}

var s3Section = builder.Configuration.GetSection("S3");
var s3Options = s3Section.Get<S3Options>() ?? throw new InvalidOperationException("S3 configuration section is missing");

if (string.IsNullOrWhiteSpace(s3Options.ServiceUrl))
{
    throw new InvalidOperationException("S3 ServiceUrl is required");
}
if (string.IsNullOrWhiteSpace(s3Options.Bucket))
{
    throw new InvalidOperationException("S3 Bucket is required");
}

var s3AccessKey = builder.Configuration["S3:AccessKey"];
var s3SecretKey = builder.Configuration["S3:SecretKey"];

if (string.IsNullOrWhiteSpace(s3AccessKey))
{
    throw new InvalidOperationException("S3 AccessKey is required");
}
if (string.IsNullOrWhiteSpace(s3SecretKey))
{
    throw new InvalidOperationException("S3 SecretKey is required");
}

// Bind configuration sections
builder.Services.Configure<JwtOptions>(jwtSection);
builder.Services.Configure<S3Options>(s3Section);

builder.Services.AddProblemDetails();
builder.Services.AddExceptionHandler<GlobalExceptionHandler>();


// CORS policy and OpenApi for development
if (builder.Environment.IsDevelopment())
{
    builder.Services.AddCors(options =>
    {
        options.AddPolicy("AllowAll", policy =>
            policy.AllowAnyOrigin().AllowAnyMethod().AllowAnyHeader());
    });
    builder.Services.AddOpenApi();
}

// AWS S3 / MinIO client
builder.Services.AddSingleton<IAmazonS3>(sp =>
{
    var s3Opts = sp.GetRequiredService<IOptions<S3Options>>().Value;
    var config = new AmazonS3Config
    {
        ServiceURL = s3Opts.ServiceUrl,
        ForcePathStyle = s3Opts.ForcePathStyle,
        Timeout = TimeSpan.FromSeconds(Security.S3TimeoutSeconds),
        MaxErrorRetry = Security.S3MaxRetries
    };
    return new AmazonS3Client(s3AccessKey, s3SecretKey, config);
});

// JWT Authentication
builder.Services.AddAuthentication(options =>
{
    options.DefaultAuthenticateScheme = JwtBearerDefaults.AuthenticationScheme;
    options.DefaultChallengeScheme = JwtBearerDefaults.AuthenticationScheme;
})
.AddJwtBearer(options =>
{
    var key = Encoding.UTF8.GetBytes(jwtOptions.Key);
    options.TokenValidationParameters = new TokenValidationParameters
    {
        ValidateIssuer = true,
        ValidIssuer = jwtOptions.Issuer,
        ValidateAudience = true,
        ValidAudience = jwtOptions.Audience,
        ValidateIssuerSigningKey = true,
        IssuerSigningKey = new SymmetricSecurityKey(key),
        ValidateLifetime = true,
        ClockSkew = TimeSpan.FromMinutes(Security.JwtClockSkewMinutes),
        RequireExpirationTime = true,
        RequireSignedTokens = true
    };
});

builder.Services.AddAuthorization();

// Application services
builder.Services.AddSingleton<IWeatherStationService, WeatherStationService>();

// Controllers and OpenAPI
builder.Services.AddControllers();


// Health checks configuration
builder.Services.AddHealthChecks()
  .AddCheck("liveness", () => HealthCheckResult.Healthy("Application is running"))
  .AddCheck<S3HealthCheck>("s3")
  .AddCheck<StationHealthCheck>("sensors-file");

builder.WebHost.ConfigureKestrel(serverOptions =>
{
    serverOptions.Limits.MaxRequestHeadersTotalSize = Limits.MaxRequestHeadersTotalSizeKb * 1024;
    serverOptions.Limits.MaxRequestHeaderCount = Limits.MaxRequestHeaderCount;
    serverOptions.Limits.MaxRequestLineSize = Limits.MaxRequestLineSizeKb * 1024;
    serverOptions.Limits.RequestHeadersTimeout = TimeSpan.FromSeconds(Limits.RequestHeadersTimeoutSeconds);
});

builder.Services.AddMemoryCache();

var app = builder.Build();

var sensorsPath = Path.Combine(app.Environment.ContentRootPath, "data", "stations.json");
if (!File.Exists(sensorsPath))
{
    throw new FileNotFoundException($"Required sensors file not found: {sensorsPath}");
}

if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
    app.UseCors("AllowAll");
}

app.UseExceptionHandler();
app.UseAuthentication();
app.UseAuthorization();

app.MapControllers();

await app.RunAsync();