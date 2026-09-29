package org.pyobs.app.weather;

import com.getcapacitor.JSArray;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/** Receives the pyobs-weather instance list from the app (src/native/weatherWidget.ts). */
@CapacitorPlugin(name = "WeatherWidget")
public class WeatherWidgetPlugin extends Plugin {

    @PluginMethod
    public void setInstances(PluginCall call) {
        JSArray instances = call.getArray("instances");
        if (instances == null) {
            call.reject("instances missing");
            return;
        }
        WeatherStore.setInstances(getContext(), instances.toString());
        // Labels or links may have changed; nothing to do while no widget is placed.
        if (WeatherWidgets.anyPlaced(getContext())) {
            WeatherWidgets.updateAll(getContext());
            WeatherRefresh.refreshNow(getContext());
        }
        call.resolve();
    }
}
