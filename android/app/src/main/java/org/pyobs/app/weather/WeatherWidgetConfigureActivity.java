package org.pyobs.app.weather;

import android.appwidget.AppWidgetManager;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.view.View;
import android.widget.ArrayAdapter;
import android.widget.Button;
import android.widget.ListView;
import android.widget.TextView;
import androidx.appcompat.app.AppCompatActivity;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import org.pyobs.app.R;

/**
 * Picks which weather sites a widget shows. Opened by the launcher when a widget is placed, and
 * again from the widget's gear button or (Android 12+) the long-press "reconfigure" entry.
 */
public class WeatherWidgetConfigureActivity extends AppCompatActivity {

    private int widgetId = AppWidgetManager.INVALID_APPWIDGET_ID;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        // Backing out of the first configuration makes the launcher drop the widget.
        setResult(RESULT_CANCELED);
        setContentView(R.layout.wx_configure);
        setTitle(R.string.wx_configure_title);

        Bundle extras = getIntent().getExtras();
        if (extras != null) widgetId = extras.getInt(AppWidgetManager.EXTRA_APPWIDGET_ID, AppWidgetManager.INVALID_APPWIDGET_ID);
        if (widgetId == AppWidgetManager.INVALID_APPWIDGET_ID) {
            finish();
            return;
        }

        List<WeatherInstance> candidates = WeatherStore.getInstances(this);
        List<String> existing = WeatherStore.getSelection(this, widgetId);
        ListView list = findViewById(R.id.wx_configure_list);
        TextView empty = findViewById(R.id.wx_configure_empty);
        Button done = findViewById(R.id.wx_configure_done);

        if (candidates.isEmpty()) {
            list.setVisibility(View.GONE);
            empty.setVisibility(View.VISIBLE);
            done.setText(R.string.wx_configure_open_app);
            done.setOnClickListener(v -> {
                Intent launch = getPackageManager().getLaunchIntentForPackage(getPackageName());
                if (launch != null) startActivity(launch);
                finish();
            });
            return;
        }

        List<String> labels = new ArrayList<>();
        for (WeatherInstance instance : candidates) {
            labels.add(instance.label.isEmpty() ? Uri.parse(instance.url).getHost() : instance.label);
        }
        list.setAdapter(new ArrayAdapter<>(this, android.R.layout.simple_list_item_multiple_choice, labels));
        // New widget: everything preselected, the common case is "show all my sites".
        Set<String> checked = existing == null ? null : new HashSet<>(existing);
        for (int i = 0; i < candidates.size(); i++) {
            list.setItemChecked(i, checked == null || checked.contains(candidates.get(i).url));
        }

        done.setText(existing == null ? R.string.wx_configure_add : R.string.wx_configure_save);
        done.setOnClickListener(v -> {
            List<String> urls = new ArrayList<>();
            for (int i = 0; i < candidates.size(); i++) {
                if (list.isItemChecked(i)) urls.add(candidates.get(i).url);
            }
            WeatherStore.setSelection(this, widgetId, urls);
            WeatherWidgets.update(this, widgetId);
            WeatherRefresh.schedule(this);
            WeatherRefresh.refreshNow(this);
            setResult(RESULT_OK, new Intent().putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, widgetId));
            finish();
        });
    }
}
