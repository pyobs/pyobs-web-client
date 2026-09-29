package org.pyobs.app.weather;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import org.junit.Test;
import org.pyobs.app.weather.WeatherCondition.Kind;

/** Fixtures are live responses from 2026-09-28 (sensors trimmed to the average station + one row per type). */
public class WeatherParserTest {

    private static String fixture(String name) throws IOException {
        try (InputStream in = WeatherParserTest.class.getResourceAsStream("/weather/" + name)) {
            assertNotNull("missing fixture " + name, in);
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            byte[] buf = new byte[8192];
            int n;
            while ((n = in.read(buf)) != -1) out.write(buf, 0, n);
            return out.toString(StandardCharsets.UTF_8.name());
        }
    }

    @Test
    public void monetSouthWithSkySensor() throws Exception {
        WeatherSnapshot s = WeatherParser.parse(fixture("saao-current.json"), fixture("saao-sensors.json"), 1000);
        assertEquals("2026-09-28T19:53:09Z", s.time);
        assertEquals(Boolean.TRUE, s.good);
        assertEquals(1000, s.fetchedAt);
        assertEquals(5.3, s.value("temp"), 1e-9);
        assertEquals("km/h", s.get("windspeed").unit);
        assertEquals(SensorLevel.WARNING, s.get("windspeed").level()); // 43.9 in 35..45
        assertEquals(SensorLevel.OK, s.get("humid").level());
        assertNull(s.value("dewpoint"));

        WeatherCondition c = WeatherCondition.classify(s);
        assertEquals(Kind.CLEAR, c.kind); // skytemp -30.4 below the warning band
        assertTrue(c.night);
    }

    @Test
    public void iag50WithoutSkySensorOrLimits() throws Exception {
        WeatherSnapshot s = WeatherParser.parse(fixture("iag50-current.json"), fixture("iag50-sensors.json"), 0);
        assertEquals(18.95, s.value("temp"), 1e-9);
        assertEquals("°C", s.get("temp").unit);
        assertTrue(s.get("rain").limits.isEmpty());
        assertNull(s.get("skytemp"));

        WeatherCondition c = WeatherCondition.classify(s);
        assertEquals(Kind.DRY, c.kind);
        assertTrue(c.night);
    }

    @Test
    public void averageStationPickedByNameNotByCode() throws Exception {
        // IAG's average station code is iag50cm_avg, not "average"; the boltwood row for the
        // same type must not be used.
        WeatherSnapshot s = WeatherParser.parse(fixture("iag50-current.json"), fixture("iag50-sensors.json"), 0);
        assertEquals("%", s.get("humid").unit);
    }

    @Test
    public void missingOrBrokenSensorsResponseKeepsValues() throws Exception {
        for (String sensors : new String[] {null, "not json", "[]"}) {
            WeatherSnapshot s = WeatherParser.parse(fixture("saao-current.json"), sensors, 0);
            assertEquals(5.3, s.value("temp"), 1e-9);
            assertEquals("", s.get("temp").unit);
            assertTrue(s.get("skytemp").limits.isEmpty());
            assertEquals(Kind.DRY, WeatherCondition.classify(s).kind);
        }
    }

    @Test
    public void snapshotRoundTripsThroughCacheJson() throws Exception {
        WeatherSnapshot s = WeatherParser.parse(fixture("saao-current.json"), fixture("saao-sensors.json"), 42);
        WeatherSnapshot back = WeatherSnapshot.fromJson(s.toJson());
        assertNotNull(back);
        assertEquals(s.time, back.time);
        assertEquals(s.good, back.good);
        assertEquals(42, back.fetchedAt);
        assertEquals(s.value("skytemp"), back.value("skytemp"));
        assertNull(back.value("dewpoint"));
        assertEquals(2, back.get("skytemp").limits.size());
        assertNull(back.get("skytemp").limits.get(0).max);
        assertEquals(SensorLevel.WARNING, back.get("windspeed").level());
        assertEquals(WeatherCondition.classify(s).kind, WeatherCondition.classify(back).kind);
    }

    @Test
    public void unreadableCacheIsNoCache() {
        assertNull(WeatherSnapshot.fromJson(null));
        assertNull(WeatherSnapshot.fromJson("{broken"));
        assertFalse(WeatherSnapshot.fromJson("{}").sensors.containsKey("temp"));
    }
}
