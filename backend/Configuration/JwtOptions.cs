namespace PWAApi.Configuration
{
    public class JwtOptions
    {
        /// <summary>
        /// Symmetric key used for signing JWTs.
        /// </summary>
        public string Key { get; set; } = string.Empty;

        /// <summary>
        /// Expected issuer (iss) claim value.
        /// </summary>
        public string Issuer { get; set; } = string.Empty;

        /// <summary>
        /// Expected audience (aud) claim value.
        /// </summary>
        public string Audience { get; set; } = string.Empty;

        /// <summary>
        /// Token lifetime in minutes.
        /// </summary>
        public int ExpiryMinutes { get; set; }
    }
}
