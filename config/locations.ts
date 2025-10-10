import { Tables } from "@/lib/supabase/types";

export const serviceLocations: Tables<"locations">[] = [
  {
    id: 1,
    short: "SGP",
    city: "Singapore",
    country: "Singapore",
    country_code: "SG",
    available: true,
  },
  {
    id: 2,
    short: "MUM",
    city: "Mumbai",
    country: "India",
    country_code: "IN",
    available: true,
  },
  {
    id: 3,
    short: "DEL",
    city: "Delhi",
    country: "India",
    country_code: "IN",
    available: false,
  },
  {
    id: 4,
    short: "FRA",
    city: "Frankfurt",
    country: "Germany",
    country_code: "DE",
    available: true,
  },
  {
    id: 5,
    short: "SFO",
    city: "San Francisco",
    country: "United States",
    country_code: "US",
    available: true,
  },
  {
    id: 6,
    short: "TYO",
    city: "Tokyo",
    country: "Japan",
    country_code: "JP",
    available: false,
  },
  {
    id: 7,
    short: "SYD",
    city: "Sydney",
    country: "Australia",
    country_code: "AU",
    available: true,
  },
];



//  "ams3",
//           "blr1",
//           "fra1",
//           "lon1",
//           "nyc1",
//           "nyc2",
//           "nyc3",
//           "sfo2",
//           "sfo3",
//           "sgp1",
//           "syd1",
//           "tor1"


export const vmLocations: Tables<"locations">[] = [
 {
  id: 2,
  short: "fra1",
  city: "Frankfurt",
  country: "Germany",
  country_code: "DE",
  available: true
},

{
  id: 3,
  short: "tor1",
  city: "Toronto",
  country: "Canada",
  country_code: "CA",
  available: true
},

{
  id: 4,
  short: "blr1",
  city: "Banglore",
  country: "India",
  country_code: "IN",
  available: true
}

];

