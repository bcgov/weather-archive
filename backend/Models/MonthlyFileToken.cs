namespace PWAApi.Models
{
    public class MonthlyFileToken
    {
        public int StationId { get; set; }
        public int Year { get; set; }
        public int Month { get; set; }
        public string Token { get; set; } = default!;
    }
}
