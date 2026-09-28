package org.pyobs.app.weather;

import android.content.Context;
import android.content.SharedPreferences;
import java.util.List;

/** Native-side storage for the weather widgets, in its own SharedPreferences file. */
public final class WeatherStore {

    private static final String PREFS = "pyobs_weather_widget";
    private static final String KEY_INSTANCES = "instances";
    private static final String SNAPSHOT_PREFIX = "snapshot:";
    private static final String ERROR_PREFIX = "error:";

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

    /**
     * Instances the refresh job fetches. Every candidate for now; becomes the union of all placed
     * widgets' selections once per-widget configuration exists (plan phase 4).
     */
    public static List<WeatherInstance> instancesInUse(Context context) {
        return getInstances(context);
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
}
