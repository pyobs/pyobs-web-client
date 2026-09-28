package org.pyobs.app.weather;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

/** One sensor type's current average value plus its unit and limits. */
public final class Reading {

    public final Double value;
    public final String unit;
    public final List<SensorLimit> limits;

    public Reading(Double value, String unit, List<SensorLimit> limits) {
        this.value = value;
        this.unit = unit;
        this.limits = Collections.unmodifiableList(limits);
    }

    public SensorLevel level() {
        return SensorLevel.of(value, limits);
    }

    static List<SensorLimit> limitsFromJson(JSONArray array) {
        List<SensorLimit> limits = new ArrayList<>();
        if (array == null) return limits;
        for (int i = 0; i < array.length(); i++) {
            JSONObject obj = array.optJSONObject(i);
            if (obj != null) limits.add(SensorLimit.fromJson(obj));
        }
        return limits;
    }

    static Reading fromJson(JSONObject obj) {
        return new Reading(
            obj.isNull("value") ? null : obj.optDouble("value"),
            obj.optString("unit", ""),
            limitsFromJson(obj.optJSONArray("limits")));
    }

    JSONObject toJson() throws JSONException {
        JSONObject obj = new JSONObject();
        obj.put("value", value == null ? JSONObject.NULL : value);
        obj.put("unit", unit);
        JSONArray array = new JSONArray();
        for (SensorLimit limit : limits) array.put(limit.toJson());
        obj.put("limits", array);
        return obj;
    }
}
