package dev.streetsempire.app.native.core.model

import kotlinx.serialization.Serializable

@Serializable
data class ApiErrorBody(val error: ApiErrorDetail? = null)

@Serializable
data class ApiErrorDetail(
  val code: String,
  val message: String,
)

@Serializable
data class MessageResponse(
  val ok: Boolean,
  val message: String,
)
