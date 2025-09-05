using Microsoft.AspNetCore.Mvc.ModelBinding;
using System.ComponentModel.DataAnnotations;

namespace PWAApi.Models.Queries
{
    public class MonthlyTokenQuery
    {

        [BindRequired, Range(1, 100000, ErrorMessage = "Station ID must be between 1 and 100000.")]
        public int StationId { get; set; }

        [BindRequired, Range(1900, 2100, ErrorMessage = "Year must be between 1900 and 2100.")]
        public int Year { get; set; }


    }
}
