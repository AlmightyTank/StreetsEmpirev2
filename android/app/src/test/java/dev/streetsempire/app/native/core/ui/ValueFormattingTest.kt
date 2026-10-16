package dev.streetsempire.app.native.core.ui

import org.junit.Assert.assertEquals
import org.junit.Test

class ValueFormattingTest {
  @Test
  fun formatsAuthoritativeValuesConsistently() {
    assertEquals("$128,457.00", formatUsdCents(12_845_700))
    assertEquals("1,234,567", formatWholeNumber(1_234_567))
    assertEquals("2d 3h 4m", formatDuration((((2 * 24 + 3) * 60 + 4) * 60_000L)))
    assertEquals("0m", formatDuration(-1))
  }
}
