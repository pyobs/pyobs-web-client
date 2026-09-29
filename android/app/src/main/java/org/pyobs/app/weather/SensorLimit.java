package org.pyobs.app.weather;

import org.json.JSONException;
import org.json.JSONObject;

/**
 * One limit band from pyobs-weather's {@code /api/sensors/} ({@code {type, min?, max?}}), as its
 * evaluators' {@code areas()} produce them. Both ends inclusive, a missing end is open.
 */
public final class SensorLimit {

    public final String type;
    public final Double min;
    public final Double max;

    public SensorLimit(String type, Double min, Double max) {
        this.type = type;
        this.min = min;
        this.max = max;
    }

    public boolean contains(double value) {
        return (min == null || value >= min) && (max == null || value <= max);
    }

    static SensorLimit fromJson(JSONObject obj) {
        return new SensorLimit(
            obj.optString("type", ""),
            obj.isNull("min") ? null : obj.optDouble("min"),
            obj.isNull("max") ? null : obj.optDouble("max"));
    }

    JSONObject toJson() throws JSONException {
        JSONObject obj = new JSONObject();
        obj.put("type", type);
        if (min != null) obj.put("min", min);
        if (max != null) obj.put("max", max);
        return obj;
    }
}
