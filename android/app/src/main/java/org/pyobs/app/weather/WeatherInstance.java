package org.pyobs.app.weather;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

/**
 * A pyobs-weather instance the widgets can show, as handed over by the app
 * (src/native/weatherWidget.ts). {@code url} is already normalized there and is the key used
 * everywhere on the native side: per-widget selection, fetch cache.
 */
public final class WeatherInstance {

    public final String url;
    public final String label;

    public WeatherInstance(String url, String label) {
        this.url = url;
        this.label = label;
    }

    /** Parses the stored list; malformed input or entries without a URL are skipped, never thrown. */
    public static List<WeatherInstance> parseList(String json) {
        if (json == null || json.isEmpty()) return Collections.emptyList();
        List<WeatherInstance> result = new ArrayList<>();
        try {
            JSONArray array = new JSONArray(json);
            for (int i = 0; i < array.length(); i++) {
                JSONObject obj = array.optJSONObject(i);
                if (obj == null) continue;
                String url = obj.optString("url", "").trim();
                if (url.isEmpty()) continue;
                result.add(new WeatherInstance(url, obj.optString("label", "").trim()));
            }
        } catch (JSONException e) {
            return Collections.emptyList();
        }
        return result;
    }
}
