namespace PWAApi.DTOs
{
    public class MonthlyFileTokenDto
    {
        public int Year { get; set; }
        public int Month { get; set; }
        public string Token { get; set; } = default!;
        public bool IsYearlyCombined { get; set; } = false;
    }
}
