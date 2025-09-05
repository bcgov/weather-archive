namespace PWAApi
{
    public static class Security
    {
        public const int MinJwtKeyLength = 32;
        public const int JwtClockSkewMinutes = 5;
        public const int S3TimeoutSeconds = 30;
        public const int S3MaxRetries = 3;
    }

    public static class Limits
    {
        public const int MaxRequestHeadersTotalSizeKb = 128;
        public const int MaxRequestHeaderCount = 50;
        public const int MaxRequestLineSizeKb = 32;
        public const int RequestHeadersTimeoutSeconds = 30;
        public const int MaxRequestBodySizeMb = 10;
    }
}