namespace PWAApi.Exceptions
{
    public class FileSizeLimitExceededException : Exception
    {
        public FileSizeLimitExceededException(string message) : base(message) { }
    }
}
