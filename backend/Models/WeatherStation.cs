namespace PWAApi.Models
{
    /// <summary>
    /// Represents a weather station in the system.
    /// </summary>
  public class WeatherStation
    {
        public int Id { get; set; }
        public string Name { get; set; } = default!;
        public string Description { get; set; } = default!;
        public double Longitude { get; set; }
        public double Latitude { get; set; }

    }

}
