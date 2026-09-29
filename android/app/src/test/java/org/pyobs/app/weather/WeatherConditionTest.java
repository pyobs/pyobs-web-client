package org.pyobs.app.weather;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import java.util.Arrays;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.junit.Test;
import org.pyobs.app.weather.WeatherCondition.Kind;

public class WeatherConditionTest {

    private static final List<SensorLimit> RAIN = Collections.singletonList(new SensorLimit("danger", 0.5, 1.0));
    private static final List<SensorLimit> SKY = Arrays.asList(
        new SensorLimit("danger", -20.0, null),
        new SensorLimit("warning", -25.0, -20.0));
    private static final List<SensorLimit> NONE = Collections.emptyList();

    private static final class Builder {
        final Map<String, Reading> sensors = new LinkedHashMap<>();

        Builder with(String code, Double value, List<SensorLimit> limits) {
            sensors.put(code, new Reading(value, "", limits));
            return this;
        }

        WeatherCondition classify() {
            return WeatherCondition.classify(new WeatherSnapshot(null, true, 0, sensors));
        }
    }

    @Test
    public void skyTemperatureBands() {
        assertEquals(Kind.CLEAR, new Builder().with("rain", 0.0, RAIN).with("skytemp", -30.0, SKY).classify().kind);
        assertEquals(Kind.PARTLY_CLOUDY, new Builder().with("rain", 0.0, RAIN).with("skytemp", -22.0, SKY).classify().kind);
        assertEquals(Kind.CLOUDY, new Builder().with("rain", 0.0, RAIN).with("skytemp", -10.0, SKY).classify().kind);
    }

    @Test
    public void rainWinsOverSky() {
        assertEquals(Kind.RAIN, new Builder().with("rain", 1.0, RAIN).with("skytemp", -30.0, SKY).classify().kind);
    }

    @Test
    public void rainWithoutLimitsIsValueAboveZero() {
        assertEquals(Kind.RAIN, new Builder().with("rain", 1.0, NONE).classify().kind);
        assertEquals(Kind.DRY, new Builder().with("rain", 0.0, NONE).classify().kind);
    }

    @Test
    public void dryWithoutUsableSkySensor() {
        assertEquals(Kind.DRY, new Builder().with("rain", 0.0, RAIN).classify().kind);
        assertEquals(Kind.DRY, new Builder().with("skytemp", null, SKY).classify().kind);
        assertEquals(Kind.DRY, new Builder().with("skytemp", -30.0, NONE).classify().kind);
    }

    @Test
    public void missingRainValueDoesNotMeanRain() {
        assertEquals(Kind.CLEAR, new Builder().with("rain", null, RAIN).with("skytemp", -30.0, SKY).classify().kind);
    }

    @Test
    public void nightFromSunAltitude() {
        assertTrue(new Builder().with("sunalt", -12.0, NONE).classify().night);
        assertFalse(new Builder().with("sunalt", 5.0, NONE).classify().night);
        assertFalse(new Builder().classify().night);
    }
}
