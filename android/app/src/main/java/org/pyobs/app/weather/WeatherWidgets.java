package org.pyobs.app.weather;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProviderInfo;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.util.SizeF;
import android.view.View;
import android.widget.RemoteViews;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import org.pyobs.app.R;

/**
 * Builds and pushes the widgets' RemoteViews. Layout adapts to the size the launcher reports:
 * on Android 12+ one layout per reported size (the launcher picks), below that the portrait size
 * from the widget options, rebuilt on every resize. Entries that don't fit are counted in the
 * header ("+2") instead of being squeezed.
 */
public final class WeatherWidgets {

    // Heights in dp, matching the entry layouts (wx_list_row, wx_tile, wx_detail_block).
    private static final float PADDING = 16;
    private static final float HEADER = 36;
    private static final float LIST_ROW = 52;
    /** Rows with at least this much height use the large row (bigger text, condition line). */
    private static final float LIST_ROW_LARGE = 72;
    /** Compact tiles at least this wide also show humidity and wind on the right. */
    private static final float COMPACT_TILE_SIDE_WIDTH = 170;
    private static final float TILE_MIN_WIDTH = 96;
    // Measured on a Motorola launcher: a 4x2 widget reports 409x181 dp in its smaller orientation,
    // leaving ~129 dp below the header, which full tiles fill fine.
    private static final float TILE_MIN_HEIGHT = 120;
    /** Compact tiles (1 cell tall): icon, temperature, dot, name side by side. */
    private static final float COMPACT_TILE_MIN_WIDTH = 100;
    private static final float COMPACT_TILE_MIN_HEIGHT = 48;
    private static final float DETAIL_BLOCK = 96;
    /** Below this height the header (title, refresh, choose sites) is dropped to fit one row. */
    private static final float HEADER_MIN_HEIGHT = 96;

    private WeatherWidgets() {}

    /** One site as a widget shows it; {@code snapshot} is null until the first successful fetch. */
    static final class Entry {
        final WeatherInstance instance;
        final WeatherSnapshot snapshot;
        final long errorAt;

        Entry(WeatherInstance instance, WeatherSnapshot snapshot, long errorAt) {
            this.instance = instance;
            this.snapshot = snapshot;
            this.errorAt = errorAt;
        }
    }

    public static boolean anyPlaced(Context context) {
        AppWidgetManager manager = AppWidgetManager.getInstance(context);
        for (WidgetStyle style : WidgetStyle.values()) {
            if (manager.getAppWidgetIds(new ComponentName(context, style.provider)).length > 0) return true;
        }
        return false;
    }

    public static void updateAll(Context context) {
        AppWidgetManager manager = AppWidgetManager.getInstance(context);
        for (WidgetStyle style : WidgetStyle.values()) {
            for (int id : manager.getAppWidgetIds(new ComponentName(context, style.provider))) {
                update(context, manager, style, id);
            }
        }
    }

    /** Update one widget whose style isn't known to the caller (configure activity). */
    public static void update(Context context, int widgetId) {
        AppWidgetManager manager = AppWidgetManager.getInstance(context);
        AppWidgetProviderInfo info = manager.getAppWidgetInfo(widgetId);
        if (info == null) return;
        WidgetStyle style = WidgetStyle.forProvider(info.provider.getClassName());
        if (style != null) update(context, manager, style, widgetId);
    }

    static void update(Context context, AppWidgetManager manager, WidgetStyle style, int widgetId) {
        Bundle options = manager.getAppWidgetOptions(widgetId);
        List<Entry> entries = entries(context, widgetId);
        boolean noCandidates = WeatherStore.getInstances(context).isEmpty();
        boolean configured = WeatherStore.getSelection(context, widgetId) != null;

        RemoteViews views = null;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            @SuppressWarnings("deprecation")
            ArrayList<SizeF> sizes = options.getParcelableArrayList(AppWidgetManager.OPTION_APPWIDGET_SIZES);
            if (sizes != null && !sizes.isEmpty()) {
                Map<SizeF, RemoteViews> bySize = new HashMap<>();
                for (SizeF size : sizes) {
                    if (bySize.size() >= 16) break;
                    bySize.put(size, render(context, style, widgetId, entries, noCandidates, configured, size.getWidth(), size.getHeight()));
                }
                views = new RemoteViews(bySize);
            }
        }
        if (views == null) {
            float width = options.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH, 250);
            float height = options.getInt(AppWidgetManager.OPTION_APPWIDGET_MAX_HEIGHT, 110);
            views = render(context, style, widgetId, entries, noCandidates, configured, width, height);
        }
        manager.updateAppWidget(widgetId, views);
    }

    /** The widget's selected sites that still exist, in the app's order, with their cached data. */
    static List<Entry> entries(Context context, int widgetId) {
        List<String> selection = WeatherStore.getSelection(context, widgetId);
        List<Entry> entries = new ArrayList<>();
        if (selection == null) return entries;
        Set<String> selected = new HashSet<>(selection);
        for (WeatherInstance instance : WeatherStore.getInstances(context)) {
            if (!selected.contains(instance.url)) continue;
            entries.add(new Entry(
                instance,
                WeatherStore.getSnapshot(context, instance.url),
                WeatherStore.getErrorAt(context, instance.url)));
        }
        return entries;
    }

    private static RemoteViews render(Context context, WidgetStyle style, int widgetId, List<Entry> entries,
                                      boolean noCandidates, boolean configured, float width, float height) {
        RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.wx_frame);
        views.setOnClickPendingIntent(R.id.wx_refresh, refreshIntent(context, style, widgetId));
        views.setOnClickPendingIntent(R.id.wx_settings, configureIntent(context, widgetId));

        boolean header = height >= HEADER_MIN_HEIGHT;
        views.setViewVisibility(R.id.wx_header, header ? View.VISIBLE : View.GONE);
        float contentHeight = height - PADDING - (header ? HEADER : 0);
        float contentWidth = width - PADDING;

        views.removeAllViews(R.id.wx_content);
        if (noCandidates || entries.isEmpty()) {
            views.setViewVisibility(R.id.wx_content, View.GONE);
            views.setViewVisibility(R.id.wx_empty, View.VISIBLE);
            views.setTextViewText(R.id.wx_empty, context.getString(noCandidates ? R.string.wx_no_instances : R.string.wx_no_selection));
            views.setOnClickPendingIntent(R.id.wx_empty, noCandidates ? openAppIntent(context) : configureIntent(context, widgetId));
            views.setTextViewText(R.id.wx_info, "");
            return views;
        }
        views.setViewVisibility(R.id.wx_content, View.VISIBLE);
        views.setViewVisibility(R.id.wx_empty, View.GONE);

        long now = System.currentTimeMillis();
        int shown;
        switch (style) {
            case TILES:
                shown = addTiles(context, views, entries, contentWidth, contentHeight, now, widgetId);
                break;
            case DETAILED:
                shown = addBlocks(context, views, entries, contentHeight, now, widgetId);
                break;
            default:
                shown = addRows(context, views, entries, contentHeight, now, widgetId);
        }
        views.setTextViewText(R.id.wx_info, info(entries, shown, now));
        return views;
    }

    /** Header text: "+N" for sites that don't fit, else the age of the oldest data. */
    private static String info(List<Entry> entries, int shown, long now) {
        if (shown < entries.size()) return "+" + (entries.size() - shown);
        long oldest = Long.MAX_VALUE;
        for (Entry e : entries) if (e.snapshot != null) oldest = Math.min(oldest, e.snapshot.fetchedAt);
        return oldest == Long.MAX_VALUE ? "" : WeatherFormat.age(oldest, now);
    }

    private static int addRows(Context context, RemoteViews views, List<Entry> entries, float height, long now, int widgetId) {
        int capacity = Math.max(1, (int) (height / LIST_ROW));
        int shown = Math.min(capacity, entries.size());
        boolean large = height / shown >= LIST_ROW_LARGE;
        Locale locale = Locale.getDefault();
        for (int i = 0; i < shown; i++) {
            Entry e = entries.get(i);
            RemoteViews row = new RemoteViews(context.getPackageName(), large ? R.layout.wx_list_row_large : R.layout.wx_list_row);
            fillCommon(context, row, e, widgetId, i);
            if (large) row.setTextViewText(R.id.wx_line2, e.snapshot == null ? "" : conditionLine(e.snapshot, locale));
            if (e.snapshot == null) {
                row.setTextViewText(R.id.wx_line, context.getString(e.errorAt > 0 ? R.string.wx_unreachable : R.string.wx_loading));
            } else if (WeatherFormat.isStale(e.snapshot.fetchedAt, now)) {
                row.setTextViewText(R.id.wx_line, "Last data " + WeatherFormat.age(e.snapshot.fetchedAt, now));
                row.setTextColor(R.id.wx_line, context.getColor(R.color.wx_warn));
            } else {
                row.setTextViewText(R.id.wx_line,
                    WeatherFormat.whole(e.snapshot.get("humid"), locale) + " · " + WeatherFormat.whole(e.snapshot.get("windspeed"), locale));
            }
            views.addView(R.id.wx_content, row);
        }
        return shown;
    }

    /** "Clear · sky -31.5°", or just the condition when there's no sky sensor. */
    private static String conditionLine(WeatherSnapshot snapshot, Locale locale) {
        String condition = WeatherFormat.conditionName(WeatherCondition.classify(snapshot).kind);
        Reading sky = snapshot.get("skytemp");
        return sky == null || sky.value == null ? condition : condition + " · sky " + WeatherFormat.temperature(sky, locale);
    }

    private static int addTiles(Context context, RemoteViews views, List<Entry> entries, float width, float height, long now, int widgetId) {
        boolean compact = height < TILE_MIN_HEIGHT;
        int maxCols = Math.max(1, (int) (width / (compact ? COMPACT_TILE_MIN_WIDTH : TILE_MIN_WIDTH)));
        int maxRows = Math.max(1, (int) (height / (compact ? COMPACT_TILE_MIN_HEIGHT : TILE_MIN_HEIGHT)));
        int shown = Math.min(entries.size(), maxCols * maxRows);
        int cols = Math.min(maxCols, shown);
        int rows = (shown + cols - 1) / cols;
        boolean side = compact && width / cols >= COMPACT_TILE_SIDE_WIDTH;
        Locale locale = Locale.getDefault();
        int index = 0;
        for (int r = 0; r < rows; r++) {
            RemoteViews rowView = new RemoteViews(context.getPackageName(), R.layout.wx_tile_row);
            for (int c = 0; c < cols; c++) {
                RemoteViews tile = new RemoteViews(context.getPackageName(), compact ? R.layout.wx_tile_compact : R.layout.wx_tile);
                if (index < shown && compact) {
                    Entry e = entries.get(index);
                    fillCompact(context, tile, e, widgetId, index);
                    if (side && e.snapshot != null) {
                        tile.setViewVisibility(R.id.wx_side, View.VISIBLE);
                        tile.setTextViewText(R.id.wx_line, WeatherFormat.whole(e.snapshot.get("humid"), locale));
                        tile.setTextViewText(R.id.wx_line2, WeatherFormat.whole(e.snapshot.get("windspeed"), locale));
                    }
                } else if (index < shown) {
                    Entry e = entries.get(index);
                    fillCommon(context, tile, e, widgetId, index);
                    if (e.snapshot == null) {
                        tile.setTextViewText(R.id.wx_line, context.getString(e.errorAt > 0 ? R.string.wx_unreachable : R.string.wx_loading));
                    } else {
                        tile.setTextViewText(R.id.wx_line,
                            WeatherFormat.whole(e.snapshot.get("humid"), locale) + " · " + WeatherFormat.whole(e.snapshot.get("windspeed"), locale));
                        if (WeatherFormat.isStale(e.snapshot.fetchedAt, now)) {
                            tile.setViewVisibility(R.id.wx_age, View.VISIBLE);
                            tile.setTextViewText(R.id.wx_age, WeatherFormat.age(e.snapshot.fetchedAt, now));
                        }
                    }
                } else {
                    // Keeps the last row's tiles the same width as the ones above.
                    tile.setViewVisibility(R.id.wx_entry, View.INVISIBLE);
                }
                rowView.addView(R.id.wx_tile_row, tile);
                index++;
            }
            views.addView(R.id.wx_content, rowView);
        }
        return shown;
    }

    private static int addBlocks(Context context, RemoteViews views, List<Entry> entries, float height, long now, int widgetId) {
        int capacity = Math.max(1, (int) (height / DETAIL_BLOCK));
        int shown = Math.min(capacity, entries.size());
        Locale locale = Locale.getDefault();
        for (int i = 0; i < shown; i++) {
            Entry e = entries.get(i);
            RemoteViews block = new RemoteViews(context.getPackageName(), R.layout.wx_detail_block);
            fillCommon(context, block, e, widgetId, i);
            if (e.snapshot == null) {
                block.setTextViewText(R.id.wx_line, context.getString(e.errorAt > 0 ? R.string.wx_unreachable : R.string.wx_loading));
                chip(context, block, R.id.wx_chip1, R.id.wx_chip1_label, R.id.wx_chip1_value, R.string.wx_humidity, null, locale);
                chip(context, block, R.id.wx_chip2, R.id.wx_chip2_label, R.id.wx_chip2_value, R.string.wx_wind, null, locale);
                chip(context, block, R.id.wx_chip3, R.id.wx_chip3_label, R.id.wx_chip3_value, R.string.wx_sky, null, locale);
            } else {
                WeatherCondition condition = WeatherCondition.classify(e.snapshot);
                String line = WeatherFormat.conditionName(condition.kind) + " · " + WeatherFormat.age(e.snapshot.fetchedAt, now);
                block.setTextViewText(R.id.wx_line, line);
                if (WeatherFormat.isStale(e.snapshot.fetchedAt, now)) block.setTextColor(R.id.wx_line, context.getColor(R.color.wx_warn));
                chip(context, block, R.id.wx_chip1, R.id.wx_chip1_label, R.id.wx_chip1_value, R.string.wx_humidity, e.snapshot.get("humid"), locale);
                chip(context, block, R.id.wx_chip2, R.id.wx_chip2_label, R.id.wx_chip2_value, R.string.wx_wind, e.snapshot.get("windspeed"), locale);
                chip(context, block, R.id.wx_chip3, R.id.wx_chip3_label, R.id.wx_chip3_value, R.string.wx_sky, e.snapshot.get("skytemp"), locale);
            }
            views.addView(R.id.wx_content, block);
        }
        return shown;
    }

    /** One of D's chips; highlighted when the value is inside the site's warning or danger band. */
    private static void chip(Context context, RemoteViews block, int chipId, int labelId, int valueId, int labelRes,
                             Reading reading, Locale locale) {
        block.setTextViewText(labelId, context.getString(labelRes));
        String value = labelRes == R.string.wx_sky ? WeatherFormat.temperature(reading, locale) : WeatherFormat.whole(reading, locale);
        block.setTextViewText(valueId, value);
        SensorLevel level = reading == null ? null : reading.level();
        if (level == SensorLevel.DANGER) {
            block.setInt(chipId, "setBackgroundResource", R.drawable.wx_chip_danger);
            block.setTextColor(valueId, context.getColor(R.color.wx_bad));
        } else if (level == SensorLevel.WARNING) {
            block.setInt(chipId, "setBackgroundResource", R.drawable.wx_chip_warn);
            block.setTextColor(valueId, context.getColor(R.color.wx_warn));
        }
    }

    /** Compact tile: no pill or value lines, OK/BAD as a coloured dot. Stale data greys the name. */
    private static void fillCompact(Context context, RemoteViews tile, Entry e, int widgetId, int index) {
        String label = e.instance.label.isEmpty() ? Uri.parse(e.instance.url).getHost() : e.instance.label;
        tile.setTextViewText(R.id.wx_label, label);
        tile.setOnClickPendingIntent(R.id.wx_entry, openUrlIntent(context, e.instance.url, widgetId, index));
        if (e.snapshot == null) {
            tile.setImageViewResource(R.id.wx_icon, e.errorAt > 0 ? R.drawable.wx_ic_offline : R.drawable.wx_ic_sky_unknown);
            tile.setTextViewText(R.id.wx_temp, "");
            tile.setViewVisibility(R.id.wx_dot, View.GONE);
            return;
        }
        WeatherCondition condition = WeatherCondition.classify(e.snapshot);
        tile.setImageViewResource(R.id.wx_icon, icon(condition));
        tile.setContentDescription(R.id.wx_icon, WeatherFormat.conditionName(condition.kind));
        tile.setTextViewText(R.id.wx_temp, WeatherFormat.temperature(e.snapshot.get("temp"), Locale.getDefault()));
        if (e.snapshot.good == null) {
            tile.setViewVisibility(R.id.wx_dot, View.GONE);
        } else {
            tile.setInt(R.id.wx_dot, "setBackgroundResource", e.snapshot.good ? R.drawable.wx_dot_ok : R.drawable.wx_dot_bad);
            tile.setContentDescription(R.id.wx_dot, e.snapshot.good ? "OK" : "BAD");
        }
        if (WeatherFormat.isStale(e.snapshot.fetchedAt, System.currentTimeMillis())) {
            tile.setTextViewText(R.id.wx_label, label + " · " + WeatherFormat.age(e.snapshot.fetchedAt, System.currentTimeMillis()));
            tile.setTextColor(R.id.wx_label, context.getColor(R.color.wx_warn));
        }
    }

    /** Label, icon, temperature, OK/BAD pill and tap-to-open, shared by all three entry layouts. */
    private static void fillCommon(Context context, RemoteViews entry, Entry e, int widgetId, int index) {
        String label = e.instance.label.isEmpty() ? Uri.parse(e.instance.url).getHost() : e.instance.label;
        entry.setTextViewText(R.id.wx_label, label);
        entry.setOnClickPendingIntent(R.id.wx_entry, openUrlIntent(context, e.instance.url, widgetId, index));

        if (e.snapshot == null) {
            entry.setImageViewResource(R.id.wx_icon, e.errorAt > 0 ? R.drawable.wx_ic_offline : R.drawable.wx_ic_sky_unknown);
            entry.setTextViewText(R.id.wx_temp, "");
            entry.setViewVisibility(R.id.wx_pill, View.GONE);
            return;
        }
        WeatherCondition condition = WeatherCondition.classify(e.snapshot);
        entry.setImageViewResource(R.id.wx_icon, icon(condition));
        entry.setContentDescription(R.id.wx_icon, WeatherFormat.conditionName(condition.kind));
        entry.setTextViewText(R.id.wx_temp, WeatherFormat.temperature(e.snapshot.get("temp"), Locale.getDefault()));
        if (e.snapshot.good == null) {
            entry.setViewVisibility(R.id.wx_pill, View.GONE);
        } else {
            boolean good = e.snapshot.good;
            entry.setViewVisibility(R.id.wx_pill, View.VISIBLE);
            entry.setTextViewText(R.id.wx_pill, good ? "OK" : "BAD");
            entry.setInt(R.id.wx_pill, "setBackgroundResource", good ? R.drawable.wx_pill_ok : R.drawable.wx_pill_bad);
            entry.setTextColor(R.id.wx_pill, context.getColor(good ? R.color.wx_ok : R.color.wx_bad));
        }
    }

    static int icon(WeatherCondition condition) {
        switch (condition.kind) {
            case RAIN:
                return R.drawable.wx_ic_rain;
            case CLOUDY:
                return R.drawable.wx_ic_cloudy;
            case PARTLY_CLOUDY:
                return condition.night ? R.drawable.wx_ic_partly_night : R.drawable.wx_ic_partly_day;
            case CLEAR:
                return condition.night ? R.drawable.wx_ic_clear_night : R.drawable.wx_ic_clear_day;
            default:
                return R.drawable.wx_ic_sky_unknown;
        }
    }

    private static PendingIntent refreshIntent(Context context, WidgetStyle style, int widgetId) {
        Intent intent = new Intent(context, style.provider).setAction(WeatherWidgetProvider.ACTION_REFRESH);
        return PendingIntent.getBroadcast(context, widgetId, intent, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
    }

    static PendingIntent configureIntent(Context context, int widgetId) {
        Intent intent = new Intent(context, WeatherWidgetConfigureActivity.class)
            .putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, widgetId)
            // Unique data so each widget gets its own PendingIntent.
            .setData(Uri.parse("pyobs-weather://configure/" + widgetId))
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        return PendingIntent.getActivity(context, widgetId, intent, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
    }

    private static PendingIntent openUrlIntent(Context context, String url, int widgetId, int index) {
        Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(url)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        return PendingIntent.getActivity(context, widgetId * 100 + index + 1, intent, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
    }

    static PendingIntent openAppIntent(Context context) {
        Intent intent = context.getPackageManager().getLaunchIntentForPackage(context.getPackageName());
        if (intent == null) intent = new Intent();
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        return PendingIntent.getActivity(context, 0, intent, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
    }
}
