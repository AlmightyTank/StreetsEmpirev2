package dev.streetsempire.app.native.core.network

import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertSame
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Test

class MutationCoordinatorTest {
  @Test
  fun uncertainMutationCannotSubmitAgainBeforeReconciliation() = runBlocking {
    val coordinator = MutationCoordinator { "action-1" }
    var submissions = 0
    val uncertain = coordinator.submit("scout") { actionId ->
      submissions += 1
      assertEquals("action-1", actionId)
      throw ApiError(0, "NETWORK_ERROR", "Connection lost")
    }

    val blocked = coordinator.submit("scout") {
      submissions += 1
      "must not run"
    }

    assertTrue(uncertain is MutationResult.Uncertain)
    assertTrue(blocked is MutationResult.RequiresReconciliation)
    assertEquals("action-1", blocked.actionId)
    assertEquals(1, submissions)
    assertEquals(MutationStatus.ReconciliationRequired("action-1"), coordinator.status("scout"))
    assertFalse(coordinator.reset("scout"))
  }

  @Test
  fun notAppliedReconciliationRetriesWithSameActionId() = runBlocking {
    val coordinator = MutationCoordinator { "action-original" }
    coordinator.submit("claim") { throw ApiError(503, "UNAVAILABLE", "Try later") }

    val reconciliation = coordinator.reconcile("claim") { actionId ->
      assertEquals("action-original", actionId)
      ReconciliationDecision.NotApplied
    }
    val retried = coordinator.submit("claim") { actionId -> "completed with $actionId" }

    assertEquals(ReconciliationResult.RetryAllowed("action-original"), reconciliation)
    assertEquals(
      MutationResult.Success("action-original", "completed with action-original"),
      retried,
    )
    assertEquals(MutationStatus.Completed("action-original"), coordinator.status("claim"))
  }

  @Test
  fun appliedReconciliationPreventsDuplicateLogicalSubmission() = runBlocking {
    val coordinator = MutationCoordinator { "action-2" }
    var submissions = 0
    coordinator.submit("checkout") {
      submissions += 1
      throw ApiError(0, "NETWORK_ERROR", "Lost response")
    }

    assertEquals(
      ReconciliationResult.Applied("action-2"),
      coordinator.reconcile("checkout") { ReconciliationDecision.Applied },
    )
    val duplicate = coordinator.submit("checkout") {
      submissions += 1
      "duplicate"
    }

    assertTrue(duplicate is MutationResult.AlreadyCompleted)
    assertEquals(1, submissions)
    assertTrue(coordinator.reset("checkout"))
    assertSame(MutationStatus.Idle, coordinator.status("checkout"))
  }

  @Test
  fun definiteClientErrorClearsIntentForNewAttempt() = runBlocking {
    var nextId = 0
    val coordinator = MutationCoordinator { "action-${++nextId}" }
    try {
      coordinator.submit("quest") { throw ApiError(400, "INVALID", "No") }
      fail("Expected ApiError")
    } catch (error: ApiError) {
      assertEquals("INVALID", error.code)
    }

    val result = coordinator.submit("quest") { it }
    assertEquals(MutationResult.Success("action-2", "action-2"), result)
  }

  @Test
  fun cancelledCallRequiresReconciliation() = runBlocking {
    val coordinator = MutationCoordinator { "action-cancelled" }
    try {
      coordinator.submit("travel") { throw CancellationException("screen closed") }
      fail("Expected cancellation")
    } catch (_: CancellationException) {
      // Expected: cancellation still leaves a possibly dispatched write to reconcile.
    }

    assertEquals(
      MutationStatus.ReconciliationRequired("action-cancelled"),
      coordinator.status("travel"),
    )
  }
}
