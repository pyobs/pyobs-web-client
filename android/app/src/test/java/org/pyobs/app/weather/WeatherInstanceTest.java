package org.pyobs.app.weather;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;

import java.util.List;
import org.junit.Test;

public class WeatherInstanceTest {

    @Test
    public void parsesInstances() {
        List<WeatherInstance> list = WeatherInstance.parseList(
            "[{\"url\":\"https://weather.monet.saao.ac.za\",\"label\":\"MONET/S\"},"
                + "{\"url\":\"https://weather.iag50srv.astro.physik.uni-goettingen.de\",\"label\":\"IAG 50cm\"}]");
        assertEquals(2, list.size());
        assertEquals("https://weather.monet.saao.ac.za", list.get(0).url);
        assertEquals("MONET/S", list.get(0).label);
        assertEquals("IAG 50cm", list.get(1).label);
    }

    @Test
    public void skipsEntriesWithoutUrl() {
        List<WeatherInstance> list = WeatherInstance.parseList(
            "[{\"label\":\"no url\"},{\"url\":\"  \"},42,{\"url\":\"https://w.x\"}]");
        assertEquals(1, list.size());
        assertEquals("https://w.x", list.get(0).url);
        assertEquals("", list.get(0).label);
    }

    @Test
    public void emptyOrMalformedIsEmpty() {
        assertTrue(WeatherInstance.parseList(null).isEmpty());
        assertTrue(WeatherInstance.parseList("").isEmpty());
        assertTrue(WeatherInstance.parseList("{not json").isEmpty());
        assertTrue(WeatherInstance.parseList("{\"url\":\"https://w.x\"}").isEmpty());
    }
}
