package org.pyobs.app.weather;

/**
 * The widget's condition icon, derived from a site's own limits
 * (specs/plans/2026-09-28-android-weather-widget.md, "Condition rules"):
 *
 * <ol>
 *   <li>{@code rain} in its danger band → RAIN; without limits, {@code rain > 0} → RAIN.
 *   <li>else {@code skytemp} danger → CLOUDY, warning → PARTLY_CLOUDY, otherwise CLEAR.
 *   <li>no {@code skytemp} value or no skytemp limits → DRY (no claim about clouds).
 *   <li>{@code sunalt < 0} → night variant.
 * </ol>
 */
public final class WeatherCondition {

    public enum Kind { RAIN, CLOUDY, PARTLY_CLOUDY, CLEAR, DRY }

    public final Kind kind;
    public final boolean night;

    public WeatherCondition(Kind kind, boolean night) {
        this.kind = kind;
        this.night = night;
    }

    public static WeatherCondition classify(WeatherSnapshot snapshot) {
        Double sunalt = snapshot.value("sunalt");
        boolean night = sunalt != null && sunalt < 0;
        return new WeatherCondition(kind(snapshot), night);
    }

    private static Kind kind(WeatherSnapshot snapshot) {
        Reading rain = snapshot.get("rain");
        if (rain != null && rain.value != null) {
            boolean raining = rain.limits.isEmpty() ? rain.value > 0 : rain.level() == SensorLevel.DANGER;
            if (raining) return Kind.RAIN;
        }

        Reading sky = snapshot.get("skytemp");
        if (sky == null || sky.value == null || sky.limits.isEmpty()) return Kind.DRY;
        switch (sky.level()) {
            case DANGER:
                return Kind.CLOUDY;
            case WARNING:
                return Kind.PARTLY_CLOUDY;
            default:
                return Kind.CLEAR;
        }
    }
}
