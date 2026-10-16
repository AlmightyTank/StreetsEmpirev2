package dev.streetsempire.app.native.core.model

import kotlinx.serialization.Serializable

@Serializable
data class PlatformMetaDto(
  val environment: String,
  val app: PlatformAppDto,
  val ruleset: PlatformRulesetDto,
  val season: PlatformSeasonDto?,
  val turnstileSiteKey: String?,
  val rulesAgreement: RulesAgreementDto,
)

@Serializable
data class PlatformAppDto(val version: String, val commit: String?)

@Serializable
data class PlatformRulesetDto(val id: String, val version: String)

@Serializable
data class PlatformSeasonDto(
  val name: String,
  val slug: String,
  val status: String,
  val endsAt: String,
)

@Serializable
data class RulesAgreementDto(
  val version: String,
  val minimumAge: Int,
  val rules: List<RuleDto>,
)

@Serializable
data class RuleDto(val title: String, val body: String)
