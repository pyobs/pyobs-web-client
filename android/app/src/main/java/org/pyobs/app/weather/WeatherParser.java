package org.pyobs.app.weather;

import java.util.Collections;
import java.util.HashMap;
import java.util.Iterator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

/**
 * Builds a {@link WeatherSnapshot} from pyobs-weather's {@code /api/current/} (values, good flag,
 * time) and {@code /api/sensors/} (units and limits).
 *
 * <p>{@code /api/sensors/} lists every station's sensors. The average station's code is
 * configurable per site ({@code average} at MONET/S, {@code iag50cm_avg} at IAG) and no endpoint
 * exposes it, so its rows are picked by the name pyobs-weather's {@code initweather} always gives
 * it. If that ever doesn't match, readings just come without unit and limits.
 */
public final class WeatherParser {

    static final String AVERAGE_STATION_NAME = "Average values";

    private WeatherParser() {}

    public static WeatherSnapshot parse(String currentJson, String sensorsJson, long fetchedAt) throws JSONException {
        JSONObject current = new JSONObject(currentJson);
        Map<String, JSONObject> meta = averageRows(sensorsJson);

        Map<String, Reading> sensors = new LinkedHashMap<>();
        JSONObject sensorsObj = current.optJSONObject("sensors");
        if (sensorsObj != null) {
            for (Iterator<String> it = sensorsObj.keys(); it.hasNext(); ) {
                String code = it.next();
                JSONObject entry = sensorsObj.optJSONObject(code);
                if (entry == null) continue;
                Double value = entry.isNull("value") ? null : entry.optDouble("value");
                if (value != null && value.isNaN()) value = null;
                JSONObject row = meta.get(code);
                String unit = row == null ? "" : row.optString("unit", "");
                List<SensorLimit> limits = row == null
                    ? Collections.<SensorLimit>emptyList()
                    : Reading.limitsFromJson(row.optJSONArray("limits"));
                sensors.put(code, new Reading(value, unit, limits));
            }
        }

        return new WeatherSnapshot(
            current.isNull("time") ? null : current.optString("time", null),
            current.isNull("good") ? null : current.optBoolean("good"),
            fetchedAt,
            sensors);
    }

    private static Map<String, JSONObject> averageRows(String sensorsJson) {
        Map<String, JSONObject> rows = new HashMap<>();
        if (sensorsJson == null) return rows;
        try {
            JSONArray array = new JSONArray(sensorsJson);
            for (int i = 0; i < array.length(); i++) {
                JSONObject row = array.optJSONObject(i);
                if (row == null || !AVERAGE_STATION_NAME.equals(row.optString("station_name"))) continue;
                rows.put(row.optString("type_code"), row);
            }
        } catch (JSONException e) {
            // Unreadable metadata: values still show, just without units and limits.
        }
        return rows;
    }
}
