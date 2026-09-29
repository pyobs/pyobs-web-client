package org.pyobs.app.weather;

import java.util.Locale;

/** Display strings for the widgets. Pure, so it's unit-tested without Android. */
public final class WeatherFormat {

    /** Data older than this is shown as stale, so an old "clear" doesn't read as current. */
    public static final long STALE_AFTER_MS = 60 * 60 * 1000L;

    static final String NA = "n/a";

    private WeatherFormat() {}

    /** Temperature with one decimal; °C collapses to a bare degree sign. */
    public static String temperature(Reading reading, Locale locale) {
        if (reading == null || reading.value == null) return NA;
        String unit = reading.unit == null ? "" : reading.unit;
        if (unit.isEmpty() || unit.equals("°C") || unit.equals("°")) {
            return String.format(locale, "%.1f°", reading.value);
        }
        return String.format(locale, "%.1f %s", reading.value, unit);
    }

    /** Whole-number value plus unit, e.g. "65 %", "36 km/h". */
    public static String whole(Reading reading, Locale locale) {
        if (reading == null || reading.value == null) return NA;
        String unit = reading.unit == null ? "" : reading.unit.trim();
        String value = String.format(locale, "%.0f", reading.value);
        return unit.isEmpty() ? value : value + " " + unit;
    }

    public static String age(long fetchedAt, long now) {
        long minutes = Math.max(0, now - fetchedAt) / 60_000L;
        if (minutes < 1) return "just now";
        if (minutes < 60) return minutes + " min ago";
        long hours = minutes / 60;
        if (hours < 48) return hours + " h ago";
        return (hours / 24) + " d ago";
    }

    public static boolean isStale(long fetchedAt, long now) {
        return now - fetchedAt > STALE_AFTER_MS;
    }

    public static String conditionName(WeatherCondition.Kind kind) {
        switch (kind) {
            case RAIN:
                return "Rain";
            case CLOUDY:
                return "Cloudy";
            case PARTLY_CLOUDY:
                return "Partly cloudy";
            case CLEAR:
                return "Clear";
            default:
                return "No sky sensor";
        }
    }
}
