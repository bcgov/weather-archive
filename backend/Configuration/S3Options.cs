namespace PWAApi.Configuration
{
    public class S3Options
    {
        /// <summary>
        /// The service URL (e.g. http://localhost:9000 for MinIO).
        /// </summary>
        public string ServiceUrl { get; set; } = string.Empty;

        /// <summary>
        /// Whether to force path-style addressing.
        /// </summary>
        public bool ForcePathStyle { get; set; }

        /// <summary>
        /// The S3 bucket name where CSV files are stored.
        /// </summary>
        public string Bucket { get; set; } = string.Empty;

        /// <summary>
        /// Access key ID for S3 credentials.
        /// </summary>
        public string AccessKey { get; set; } = string.Empty;

        /// <summary>
        /// Secret access key for S3 credentials.
        /// </summary>
        public string SecretKey { get; set; } = string.Empty;
    }
}
