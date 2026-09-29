package org.pyobs.app.weather;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNull;

import java.util.Arrays;
import java.util.Collections;
import java.util.List;
import org.junit.Test;

public class SensorLevelTest {

    // MONET/S skytemp limits (Schmitt trigger good=-25, bad=-20)
    private static final List<SensorLimit> SKY = Arrays.asList(
        new SensorLimit("danger", -20.0, null),
        new SensorLimit("warning", -25.0, -20.0));

    @Test
    public void bandsAreInclusiveAndDangerWins() {
        assertEquals(SensorLevel.OK, SensorLevel.of(-30.4, SKY));
        assertEquals(SensorLevel.WARNING, SensorLevel.of(-25.0, SKY));
        assertEquals(SensorLevel.WARNING, SensorLevel.of(-22.0, SKY));
        assertEquals(SensorLevel.DANGER, SensorLevel.of(-20.0, SKY));
        assertEquals(SensorLevel.DANGER, SensorLevel.of(-5.0, SKY));
    }

    @Test
    public void maxOnlyBand() {
        List<SensorLimit> low = Collections.singletonList(new SensorLimit("danger", null, 2.0));
        assertEquals(SensorLevel.DANGER, SensorLevel.of(2.0, low));
        assertEquals(SensorLevel.OK, SensorLevel.of(2.1, low));
    }

    @Test
    public void noValueOrNoLimits() {
        assertNull(SensorLevel.of(null, SKY));
        assertEquals(SensorLevel.OK, SensorLevel.of(99.0, Collections.<SensorLimit>emptyList()));
    }
}
