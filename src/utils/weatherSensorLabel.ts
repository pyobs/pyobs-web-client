// Cosmetic display names for WeatherSensorReading.sensor wire values
// (../pyobs-core/pyobs/utils/enums.py's WeatherSensors StrEnum). Not
// schema-derived — units come straight from each reading's own `unit` field
// instead. Unknown sensors fall back to their raw wire value.
const WEATHER_SENSOR_LABELS: Record<string, string> = {
  temp: 'Temp.',
  humid: 'Rel. humid.',
  press: 'Pressure',
  winddir: 'Wind dir.',
  windspeed: 'Wind speed',
  rain: 'Rain',
  skytemp: 'Sky temp.',
  dewpoint: 'Dew point',
  particles: 'Particles',
  skymag: 'Sky mag.',
}

export function weatherSensorLabel(sensor: string): string {
  return WEATHER_SENSOR_LABELS[sensor] ?? sensor
}
