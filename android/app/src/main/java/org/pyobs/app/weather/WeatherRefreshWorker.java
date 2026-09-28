package org.pyobs.app.weather;

import android.content.Context;
import android.util.Log;
import androidx.annotation.NonNull;
import androidx.work.Worker;
import androidx.work.WorkerParameters;

/** Fetches every instance in use and caches the result; one failing instance doesn't stop the rest. */
public class WeatherRefreshWorker extends Worker {

    private static final String TAG = "WeatherRefresh";

    public WeatherRefreshWorker(@NonNull Context context, @NonNull WorkerParameters params) {
        super(context, params);
    }

    @NonNull
    @Override
    public Result doWork() {
        Context context = getApplicationContext();
        for (WeatherInstance instance : WeatherStore.instancesInUse(context)) {
            try {
                WeatherStore.putSnapshot(context, instance.url, WeatherFetcher.fetch(instance.url));
            } catch (Exception e) {
                Log.w(TAG, "fetch failed for " + instance.url + ": " + e);
                WeatherStore.putError(context, instance.url, System.currentTimeMillis());
            }
        }
        // Always success: a failed fetch is shown as stale/unreachable, and the next periodic run
        // retries anyway. WorkManager's own backoff would only add extra requests.
        return Result.success();
    }
}
