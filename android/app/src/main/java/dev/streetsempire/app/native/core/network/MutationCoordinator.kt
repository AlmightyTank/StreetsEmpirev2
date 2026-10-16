package dev.streetsempire.app.native.core.network

import java.util.UUID
import kotlinx.coroutines.CancellationException

sealed interface MutationStatus {
  data object Idle : MutationStatus
  data class InFlight(val actionId: String) : MutationStatus
  data class ReconciliationRequired(val actionId: String) : MutationStatus
  data class ReadyToRetry(val actionId: String) : MutationStatus
  data class Completed(val actionId: String) : MutationStatus
}

sealed interface MutationResult<out T> {
  val actionId: String

  data class Success<T>(override val actionId: String, val value: T) : MutationResult<T>
  data class Uncertain(override val actionId: String, val error: ApiError) : MutationResult<Nothing>
  data class RequiresReconciliation(override val actionId: String) : MutationResult<Nothing>
  data class AlreadyInFlight(override val actionId: String) : MutationResult<Nothing>
  data class AlreadyCompleted(override val actionId: String) : MutationResult<Nothing>
}

sealed interface ReconciliationDecision {
  /** Authoritative state proves that the original mutation was applied. */
  data object Applied : ReconciliationDecision

  /** Authoritative state proves that the mutation was not applied and may be retried safely. */
  data object NotApplied : ReconciliationDecision

  /** The read cannot yet distinguish applied from not applied. */
  data object Unknown : ReconciliationDecision
}

sealed interface ReconciliationResult {
  val actionId: String

  data class Applied(override val actionId: String) : ReconciliationResult
  data class RetryAllowed(override val actionId: String) : ReconciliationResult
  data class StillUnknown(override val actionId: String) : ReconciliationResult
  data object NothingToReconcile : ReconciliationResult {
    override val actionId: String = ""
  }
}

/**
 * Coordinates one server mutation per logical intent.
 *
 * An uncertain response may have committed on the server, so a second call is blocked until
 * [reconcile] checks authoritative state. If the server proves it was not applied, the exact
 * same action ID is reused. Completed intents stay closed until the owning screen explicitly
 * calls [reset] for a new user intent.
 */
class MutationCoordinator(
  private val newActionId: () -> String = { UUID.randomUUID().toString() },
) {
  private val states = mutableMapOf<String, MutationStatus>()

  fun status(intentKey: String): MutationStatus = synchronized(states) {
    states[intentKey] ?: MutationStatus.Idle
  }

  suspend fun <T> submit(
    intentKey: String,
    mutation: suspend (actionId: String) -> T,
  ): MutationResult<T> {
    val actionId = synchronized(states) {
      when (val current = states[intentKey]) {
        is MutationStatus.InFlight -> return MutationResult.AlreadyInFlight(current.actionId)
        is MutationStatus.ReconciliationRequired -> return MutationResult.RequiresReconciliation(current.actionId)
        is MutationStatus.Completed -> return MutationResult.AlreadyCompleted(current.actionId)
        is MutationStatus.ReadyToRetry -> current.actionId
        MutationStatus.Idle, null -> newActionId()
      }.also { states[intentKey] = MutationStatus.InFlight(it) }
    }

    return try {
      val value = mutation(actionId)
      synchronized(states) { states[intentKey] = MutationStatus.Completed(actionId) }
      MutationResult.Success(actionId, value)
    } catch (error: CancellationException) {
      synchronized(states) { states[intentKey] = MutationStatus.ReconciliationRequired(actionId) }
      throw error
    } catch (error: ApiError) {
      if (error.isUncertain) {
        synchronized(states) { states[intentKey] = MutationStatus.ReconciliationRequired(actionId) }
        MutationResult.Uncertain(actionId, error)
      } else {
        synchronized(states) { states.remove(intentKey) }
        throw error
      }
    } catch (error: Exception) {
      val uncertain = ApiError(
        status = 0,
        code = "UNKNOWN_MUTATION_RESULT",
        message = "The result could not be confirmed. Refresh before trying again.",
        cause = error,
      )
      synchronized(states) { states[intentKey] = MutationStatus.ReconciliationRequired(actionId) }
      MutationResult.Uncertain(actionId, uncertain)
    }
  }

  suspend fun reconcile(
    intentKey: String,
    readAuthoritativeState: suspend (actionId: String) -> ReconciliationDecision,
  ): ReconciliationResult {
    val actionId = synchronized(states) {
      (states[intentKey] as? MutationStatus.ReconciliationRequired)?.actionId
    } ?: return ReconciliationResult.NothingToReconcile

    return when (readAuthoritativeState(actionId)) {
      ReconciliationDecision.Applied -> {
        synchronized(states) { states[intentKey] = MutationStatus.Completed(actionId) }
        ReconciliationResult.Applied(actionId)
      }
      ReconciliationDecision.NotApplied -> {
        synchronized(states) { states[intentKey] = MutationStatus.ReadyToRetry(actionId) }
        ReconciliationResult.RetryAllowed(actionId)
      }
      ReconciliationDecision.Unknown -> ReconciliationResult.StillUnknown(actionId)
    }
  }

  /** Opens a completed or definitely failed logical slot for the user's next distinct intent. */
  fun reset(intentKey: String): Boolean = synchronized(states) {
    when (states[intentKey]) {
      null, MutationStatus.Idle -> true
      is MutationStatus.Completed -> {
        states.remove(intentKey)
        true
      }
      else -> false
    }
  }
}
