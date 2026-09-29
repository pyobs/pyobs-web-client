package org.pyobs.app.weather;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import org.json.JSONException;

/** Fetches one pyobs-weather instance over plain HTTP. No auth: both endpoints are public. */
public final class WeatherFetcher {

    private static final int TIMEOUT_MS = 10_000;

    private WeatherFetcher() {}

    /** {@code baseUrl} is the normalized instance URL (no trailing slash; may carry a root_url path). */
    public static WeatherSnapshot fetch(String baseUrl) throws IOException {
        String current = get(baseUrl + "/api/current/");
        String sensors;
        try {
            sensors = get(baseUrl + "/api/sensors/");
        } catch (IOException e) {
            // Values without units/limits beat no values at all.
            sensors = null;
        }
        try {
            return WeatherParser.parse(current, sensors, System.currentTimeMillis());
        } catch (JSONException e) {
            throw new IOException("unexpected response from " + baseUrl, e);
        }
    }

    private static String get(String url) throws IOException {
        HttpURLConnection conn = (HttpURLConnection) new URL(url).openConnection();
        try {
            conn.setConnectTimeout(TIMEOUT_MS);
            conn.setReadTimeout(TIMEOUT_MS);
            conn.setRequestProperty("Accept", "application/json");
            int code = conn.getResponseCode();
            if (code != HttpURLConnection.HTTP_OK) throw new IOException("HTTP " + code + " from " + url);
            try (InputStream in = conn.getInputStream()) {
                ByteArrayOutputStream out = new ByteArrayOutputStream();
                byte[] buf = new byte[8192];
                int n;
                while ((n = in.read(buf)) != -1) out.write(buf, 0, n);
                return out.toString(StandardCharsets.UTF_8.name());
            }
        } finally {
            conn.disconnect();
        }
    }
}
