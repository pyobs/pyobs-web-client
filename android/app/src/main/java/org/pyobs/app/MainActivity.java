package org.pyobs.app;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;
import org.pyobs.app.weather.WeatherWidgetPlugin;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Local plugins must be registered before the bridge starts.
        registerPlugin(WeatherWidgetPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
