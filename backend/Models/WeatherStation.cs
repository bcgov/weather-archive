namespace PWAApi.Models
{
    /// <summary>
    /// Represents a weather station in the system.
    /// </summary>
  public class WeatherStation
    {
        public int Id { get; set; }
        public string Name { get; set; } = default!;
        public string? Description { get; set; }
        public double Longitude { get; set; }
        public double Latitude { get; set; }
        public int? Elevation { get; set; }
        public int DataStartYear {  get; set; }
        public int DataEndYear { get; set; }
        public string Status { get; set; } = default!;

    }

}
