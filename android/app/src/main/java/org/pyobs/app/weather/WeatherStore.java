package org.pyobs.app.weather;

import android.content.Context;
import android.content.SharedPreferences;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.json.JSONArray;
import org.json.JSONException;

/** Native-side storage for the weather widgets, in its own SharedPreferences file. */
public final class WeatherStore {

    private static final String PREFS = "pyobs_weather_widget";
    private static final String KEY_INSTANCES = "instances";
    private static final String SNAPSHOT_PREFIX = "snapshot:";
    private static final String ERROR_PREFIX = "error:";
    private static final String SELECTION_PREFIX = "selection:";

    private WeatherStore() {}

    private static SharedPreferences prefs(Context context) {
        return context.getApplicationContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    /** Stores the candidate instance list exactly as the app sent it (JSON array). */
    public static void setInstances(Context context, String json) {
        prefs(context).edit().putString(KEY_INSTANCES, json).apply();
    }

    public static List<WeatherInstance> getInstances(Context context) {
        return WeatherInstance.parseList(prefs(context).getString(KEY_INSTANCES, null));
    }

    /** Sites a widget shows, by instance URL. */
    public static void setSelection(Context context, int widgetId, List<String> urls) {
        prefs(context).edit().putString(SELECTION_PREFIX + widgetId, new JSONArray(urls).toString()).apply();
    }

    /** A widget's selected URLs, or null if it was never configured. */
    public static List<String> getSelection(Context context, int widgetId) {
        return parseUrls(prefs(context).getString(SELECTION_PREFIX + widgetId, null));
    }

    public static void removeSelection(Context context, int widgetId) {
        prefs(context).edit().remove(SELECTION_PREFIX + widgetId).apply();
    }

    /**
     * Candidates at least one placed widget shows, in the app's order. A selected URL whose link
     * was deleted in the app is dropped here, so it disappears from every widget.
     */
    public static List<WeatherInstance> instancesInUse(Context context) {
        Set<String> selected = new HashSet<>();
        for (Map.Entry<String, ?> e : prefs(context).getAll().entrySet()) {
            if (!e.getKey().startsWith(SELECTION_PREFIX) || !(e.getValue() instanceof String)) continue;
            List<String> urls = parseUrls((String) e.getValue());
            if (urls != null) selected.addAll(urls);
        }
        List<WeatherInstance> result = new ArrayList<>();
        for (WeatherInstance instance : getInstances(context)) {
            if (selected.contains(instance.url)) result.add(instance);
        }
        return result;
    }

    /** Last successful fetch; clears the error for this instance. */
    public static void putSnapshot(Context context, String url, WeatherSnapshot snapshot) {
        prefs(context).edit().putString(SNAPSHOT_PREFIX + url, snapshot.toJson()).remove(ERROR_PREFIX + url).apply();
    }

    /** Last successful fetch, or null if there never was one. */
    public static WeatherSnapshot getSnapshot(Context context, String url) {
        return WeatherSnapshot.fromJson(prefs(context).getString(SNAPSHOT_PREFIX + url, null));
    }

    /** Records that the latest fetch failed; the cached snapshot (if any) stays. */
    public static void putError(Context context, String url, long at) {
        prefs(context).edit().putLong(ERROR_PREFIX + url, at).apply();
    }

    /** When the latest fetch failed, or 0 if it didn't. */
    public static long getErrorAt(Context context, String url) {
        return prefs(context).getLong(ERROR_PREFIX + url, 0);
    }

    private static List<String> parseUrls(String json) {
        if (json == null) return null;
        List<String> urls = new ArrayList<>();
        try {
            JSONArray array = new JSONArray(json);
            for (int i = 0; i < array.length(); i++) {
                String url = array.optString(i, "");
                if (!url.isEmpty()) urls.add(url);
            }
        } catch (JSONException e) {
            return null;
        }
        return urls;
    }
}
