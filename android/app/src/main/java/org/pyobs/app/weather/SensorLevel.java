package org.pyobs.app.weather;

import java.util.List;

/** Where a value sits relative to its site's own limits. Danger wins over warning. */
public enum SensorLevel {
    OK,
    WARNING,
    DANGER;

    /** {@code null} when there is no value; {@link #OK} when no band contains it (or there are none). */
    public static SensorLevel of(Double value, List<SensorLimit> limits) {
        if (value == null) return null;
        boolean warning = false;
        for (SensorLimit limit : limits) {
            if (!limit.contains(value)) continue;
            if ("danger".equals(limit.type)) return DANGER;
            if ("warning".equals(limit.type)) warning = true;
        }
        return warning ? WARNING : OK;
    }
}
