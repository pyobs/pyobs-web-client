package org.pyobs.app.weather;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import java.util.Collections;
import java.util.Locale;
import org.junit.Test;

public class WeatherFormatTest {

    private static Reading r(Double value, String unit) {
        return new Reading(value, unit, Collections.<SensorLimit>emptyList());
    }

    @Test
    public void temperature() {
        assertEquals("5.4°", WeatherFormat.temperature(r(5.4, "°C"), Locale.US));
        assertEquals("-31.5°", WeatherFormat.temperature(r(-31.51, "°C"), Locale.US));
        assertEquals("5,4°", WeatherFormat.temperature(r(5.4, "°C"), Locale.GERMANY));
        assertEquals("41.0 °F", WeatherFormat.temperature(r(41.0, "°F"), Locale.US));
        assertEquals("n/a", WeatherFormat.temperature(r(null, "°C"), Locale.US));
        assertEquals("n/a", WeatherFormat.temperature(null, Locale.US));
    }

    @Test
    public void wholeValues() {
        assertEquals("66 %", WeatherFormat.whole(r(65.7, "%"), Locale.US));
        assertEquals("36 km/h", WeatherFormat.whole(r(36.36, "km/h"), Locale.US));
        assertEquals("5", WeatherFormat.whole(r(4.92, ""), Locale.US));
        assertEquals("n/a", WeatherFormat.whole(null, Locale.US));
    }

    @Test
    public void age() {
        long now = 10_000_000_000L;
        assertEquals("just now", WeatherFormat.age(now - 30_000, now));
        assertEquals("5 min ago", WeatherFormat.age(now - 5 * 60_000, now));
        assertEquals("2 h ago", WeatherFormat.age(now - 2 * 3_600_000L, now));
        assertEquals("3 d ago", WeatherFormat.age(now - 72 * 3_600_000L, now));
        assertEquals("just now", WeatherFormat.age(now + 60_000, now));
    }

    @Test
    public void staleAfterAnHour() {
        long now = 10_000_000_000L;
        assertFalse(WeatherFormat.isStale(now - 59 * 60_000, now));
        assertTrue(WeatherFormat.isStale(now - 61 * 60_000, now));
    }
}
