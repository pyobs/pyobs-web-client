package org.pyobs.app.weather;

import android.content.Context;
import androidx.work.Constraints;
import androidx.work.ExistingPeriodicWorkPolicy;
import androidx.work.ExistingWorkPolicy;
import androidx.work.NetworkType;
import androidx.work.OneTimeWorkRequest;
import androidx.work.PeriodicWorkRequest;
import androidx.work.WorkManager;
import java.util.concurrent.TimeUnit;

/** Scheduling for {@link WeatherRefreshWorker}. 15 min is WorkManager's minimum period. */
public final class WeatherRefresh {

    private static final String PERIODIC = "weather-refresh";
    private static final String ONE_OFF = "weather-refresh-now";

    private WeatherRefresh() {}

    private static Constraints constraints() {
        return new Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build();
    }

    /** Idempotent: keeps an already scheduled job instead of restarting its timer. */
    public static void schedule(Context context) {
        PeriodicWorkRequest request = new PeriodicWorkRequest.Builder(WeatherRefreshWorker.class, 15, TimeUnit.MINUTES)
            .setConstraints(constraints())
            .build();
        WorkManager.getInstance(context).enqueueUniquePeriodicWork(PERIODIC, ExistingPeriodicWorkPolicy.KEEP, request);
    }

    public static void cancel(Context context) {
        WorkManager.getInstance(context).cancelUniqueWork(PERIODIC);
    }

    /** Refresh now (refresh button, widget placed, instance list changed). */
    public static void refreshNow(Context context) {
        OneTimeWorkRequest request = new OneTimeWorkRequest.Builder(WeatherRefreshWorker.class)
            .setConstraints(constraints())
            .build();
        WorkManager.getInstance(context).enqueueUniqueWork(ONE_OFF, ExistingWorkPolicy.REPLACE, request);
    }
}
