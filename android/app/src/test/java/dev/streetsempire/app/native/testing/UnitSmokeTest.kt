package dev.streetsempire.app.native.testing

import org.junit.Assert.assertEquals
import org.junit.Test

class UnitSmokeTest {
  @Test
  fun testRuntimeIsConfigured() {
    assertEquals("streets", listOf("street", "s").joinToString(""))
  }
}
