package org.pyobs.app.weather;

/** The three widget styles from the plan's mockups (A list, B tiles, D detailed). */
public enum WidgetStyle {
    LIST(WeatherListWidget.class),
    TILES(WeatherTilesWidget.class),
    DETAILED(WeatherDetailedWidget.class);

    public final Class<? extends WeatherWidgetProvider> provider;

    WidgetStyle(Class<? extends WeatherWidgetProvider> provider) {
        this.provider = provider;
    }

    static WidgetStyle forProvider(String className) {
        for (WidgetStyle style : values()) {
            if (style.provider.getName().equals(className)) return style;
        }
        return null;
    }
}
