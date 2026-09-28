package org.pyobs.app.weather;

import java.util.Collections;
import java.util.Iterator;
import java.util.LinkedHashMap;
import java.util.Map;
import org.json.JSONException;
import org.json.JSONObject;

/**
 * One instance's state at fetch time: pyobs-weather's own data time and overall good flag, plus
 * every sensor type's reading. Cached as JSON so a failed fetch can still show the last data.
 */
public final class WeatherSnapshot {

    /** pyobs-weather's data timestamp (ISO 8601, as sent), or null. */
    public final String time;
    /** pyobs-weather's top-level good flag, or null if it sent none. */
    public final Boolean good;
    /** When this device fetched it, epoch millis. Drives the age / stale display. */
    public final long fetchedAt;
    public final Map<String, Reading> sensors;

    public WeatherSnapshot(String time, Boolean good, long fetchedAt, Map<String, Reading> sensors) {
        this.time = time;
        this.good = good;
        this.fetchedAt = fetchedAt;
        this.sensors = Collections.unmodifiableMap(sensors);
    }

    /** Reading for a sensor type code, or null if the instance doesn't have it. */
    public Reading get(String typeCode) {
        return sensors.get(typeCode);
    }

    /** Value for a sensor type code, or null if missing or without a value. */
    public Double value(String typeCode) {
        Reading reading = sensors.get(typeCode);
        return reading == null ? null : reading.value;
    }

    public String toJson() {
        try {
            JSONObject obj = new JSONObject();
            obj.put("time", time == null ? JSONObject.NULL : time);
            obj.put("good", good == null ? JSONObject.NULL : good);
            obj.put("fetchedAt", fetchedAt);
            JSONObject sensorsObj = new JSONObject();
            for (Map.Entry<String, Reading> e : sensors.entrySet()) sensorsObj.put(e.getKey(), e.getValue().toJson());
            obj.put("sensors", sensorsObj);
            return obj.toString();
        } catch (JSONException e) {
            throw new IllegalStateException(e);
        }
    }

    /** Parses a cached snapshot; null if missing or unreadable (treated as "no cache"). */
    public static WeatherSnapshot fromJson(String json) {
        if (json == null) return null;
        try {
            JSONObject obj = new JSONObject(json);
            Map<String, Reading> sensors = new LinkedHashMap<>();
            JSONObject sensorsObj = obj.optJSONObject("sensors");
            if (sensorsObj != null) {
                for (Iterator<String> it = sensorsObj.keys(); it.hasNext(); ) {
                    String key = it.next();
                    JSONObject r = sensorsObj.optJSONObject(key);
                    if (r != null) sensors.put(key, Reading.fromJson(r));
                }
            }
            return new WeatherSnapshot(
                obj.isNull("time") ? null : obj.optString("time"),
                obj.isNull("good") ? null : obj.optBoolean("good"),
                obj.optLong("fetchedAt", 0),
                sensors);
        } catch (JSONException e) {
            return null;
        }
    }
}
