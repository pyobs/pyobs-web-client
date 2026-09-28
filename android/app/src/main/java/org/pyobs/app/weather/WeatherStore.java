package org.pyobs.app.weather;

import android.content.Context;
import android.content.SharedPreferences;
import java.util.List;

/** Native-side storage for the weather widgets, in its own SharedPreferences file. */
public final class WeatherStore {

    private static final String PREFS = "pyobs_weather_widget";
    private static final String KEY_INSTANCES = "instances";

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
}
