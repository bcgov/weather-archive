using Amazon.S3;
using Microsoft.AspNetCore.Diagnostics;
using Microsoft.AspNetCore.Mvc;
using PWAApi.Exceptions;

namespace PWAApi.Exceptions
{
    internal sealed class GlobalExceptionHandler(
        IProblemDetailsService problemDetailsService,
        ILogger<GlobalExceptionHandler> logger ) : IExceptionHandler
    {
        public async ValueTask<bool> TryHandleAsync(
            HttpContext httpContext, 
            Exception exception, 
            CancellationToken cancellationToken)
        {
            var (statusCode, title, detail) = MapException(exception);
            logger.LogError(exception, "Unhandled exception occurred: {ExceptionType} - {Message}", exception.GetType().Name, exception.Message);
            httpContext.Response.StatusCode = statusCode;
            return await problemDetailsService.TryWriteAsync(new ProblemDetailsContext
            {
                HttpContext = httpContext,
                Exception = exception,
                ProblemDetails = new ProblemDetails
                {
                    Status = statusCode,
                    Title = title,
                    Detail = detail
                }
            }
            );
        }
        private static (int StatusCode, string Title, string Detail) MapException(Exception exception)
        {
            return exception switch
            {
                AmazonS3Exception => (503, "Storage Service Unavailable", "The storage service is temporarily unavailable."),

                FileSizeLimitExceededException => (413, "Payload Too Large", "The combined data exceeds the allowed size limit."),

                TaskCanceledException or OperationCanceledException => (408, "Request Timeout", "The request took too long to complete."),

                _ => (500, "Internal Server Error", "An unexpected error occurred while processing your request.")
            };
        }
    }
}
