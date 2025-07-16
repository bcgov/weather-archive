using Amazon.S3;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.Extensions.Diagnostics.HealthChecks;
using Microsoft.Extensions.Options;
using Microsoft.IdentityModel.Tokens;
using PWAApi.Configuration;
using PWAApi.HealthChecks;
using PWAApi.Services;
using PWAApi.Services.Interfaces;
using System.Text;

var builder = WebApplication.CreateBuilder(args);

builder.Configuration.AddEnvironmentVariables();

// Bind configuration sections
builder.Services.Configure<JwtOptions>(builder.Configuration.GetSection("Jwt"));
builder.Services.Configure<S3Options>(builder.Configuration.GetSection("S3"));

// CORS policy (dev only)
builder.Services.AddCors(options =>
{
    options.AddPolicy("AllowAll", policy =>
    {
        policy.AllowAnyOrigin()
              .AllowAnyMethod()
              .AllowAnyHeader();
    });
});


// AWS S3 / MinIO client
builder.Services.AddSingleton<IAmazonS3>(sp =>
{
    var s3Opts = sp.GetRequiredService<IOptions<S3Options>>().Value;
    var config = new AmazonS3Config
    {
        ServiceURL = s3Opts.ServiceUrl,
        ForcePathStyle = s3Opts.ForcePathStyle
    };
    return new AmazonS3Client(s3Opts.AccessKey, s3Opts.SecretKey, config);
});

// JWT Authentication
var jwtOpts = builder.Configuration.GetSection("Jwt").Get<JwtOptions>()!;
builder.Services.AddAuthentication(options =>
{
    options.DefaultAuthenticateScheme = JwtBearerDefaults.AuthenticationScheme;
    options.DefaultChallengeScheme = JwtBearerDefaults.AuthenticationScheme;
})
.AddJwtBearer(options =>
{
    var key = Encoding.UTF8.GetBytes(jwtOpts.Key);
    options.TokenValidationParameters = new TokenValidationParameters
    {
        ValidateIssuer = true,
        ValidIssuer = jwtOpts.Issuer,
        ValidateAudience = true,
        ValidAudience = jwtOpts.Audience,
        ValidateIssuerSigningKey = true,
        IssuerSigningKey = new SymmetricSecurityKey(key),
        ValidateLifetime = true
    };
});

builder.Services.AddAuthorization();

// Application services
builder.Services.AddScoped<IWeatherStationService, WeatherStationService>();

// Controllers and OpenAPI
builder.Services.AddControllers();
builder.Services.AddOpenApi();

// Health checks configuration
builder.Services.AddHealthChecks()
  .AddCheck("liveness", () => HealthCheckResult.Healthy("Application is running"))
  .AddCheck<S3HealthCheck>("s3")
  .AddCheck<StationHealthCheck>("sensors-file");

builder.WebHost.ConfigureKestrel(serverOptions =>
{
    serverOptions.Limits.MaxRequestHeadersTotalSize = 32 * 1024;
    serverOptions.Limits.MaxRequestHeaderCount = 20;
    serverOptions.Limits.MaxRequestLineSize = 8 * 1024;
    serverOptions.Limits.RequestHeadersTimeout = TimeSpan.FromSeconds(10);
});


var app = builder.Build();

if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
}

app.UseCors("AllowAll");

app.UseAuthentication();
app.UseAuthorization();

app.MapControllers();

app.Run();
