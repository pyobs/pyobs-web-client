package org.pyobs.app.weather;

import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;
import android.content.Intent;
import android.os.Bundle;

/** Shared lifecycle of the three weather widgets; subclasses only pick their style. */
public abstract class WeatherWidgetProvider extends AppWidgetProvider {

    static final String ACTION_REFRESH = "org.pyobs.app.weather.REFRESH";

    abstract WidgetStyle style();

    @Override
    public void onUpdate(Context context, AppWidgetManager manager, int[] appWidgetIds) {
        for (int id : appWidgetIds) WeatherWidgets.update(context, manager, style(), id);
        WeatherRefresh.schedule(context);
    }

    @Override
    public void onAppWidgetOptionsChanged(Context context, AppWidgetManager manager, int appWidgetId, Bundle newOptions) {
        WeatherWidgets.update(context, manager, style(), appWidgetId);
    }

    @Override
    public void onEnabled(Context context) {
        WeatherRefresh.schedule(context);
    }

    @Override
    public void onDeleted(Context context, int[] appWidgetIds) {
        for (int id : appWidgetIds) WeatherStore.removeSelection(context, id);
    }

    @Override
    public void onDisabled(Context context) {
        // Last widget of this style gone; the job stays while another style is still placed.
        if (!WeatherWidgets.anyPlaced(context)) WeatherRefresh.cancel(context);
    }

    @Override
    public void onReceive(Context context, Intent intent) {
        if (ACTION_REFRESH.equals(intent.getAction())) {
            WeatherRefresh.refreshNow(context);
            return;
        }
        super.onReceive(context, intent);
    }
}
