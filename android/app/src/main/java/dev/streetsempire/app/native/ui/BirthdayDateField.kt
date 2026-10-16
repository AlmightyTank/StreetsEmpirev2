package dev.streetsempire.app.native.ui

import android.app.DatePickerDialog
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.compose.ui.platform.LocalContext
import java.time.LocalDate
import java.time.ZoneId
import java.time.ZoneOffset
import java.time.format.DateTimeFormatter
import java.util.Locale

// Must agree with packages/shared/src/rules-agreement.ts.
private const val MINIMUM_AGE = 16

internal fun birthdayError(value: String, today: LocalDate = LocalDate.now(ZoneOffset.UTC)): String? {
  val birthday = try {
    LocalDate.parse(value, DateTimeFormatter.ISO_LOCAL_DATE)
  } catch (_: Exception) {
    return "Select a valid date of birth."
  }
  if (birthday > today.minusYears(MINIMUM_AGE.toLong())) return "You must be at least $MINIMUM_AGE years old."
  if (birthday < today.minusYears(130)) return "Check the birth year you selected."
  return null
}

/** Android's native calendar picker; eligibility is determined using the server's UTC calendar. */
@Composable
internal fun BirthdayDateField(
  value: String,
  enabled: Boolean,
  onSelect: (String) -> Unit,
) {
  val context = LocalContext.current
  val nowUtc = LocalDate.now(ZoneOffset.UTC)
  val latest = nowUtc.minusYears(MINIMUM_AGE.toLong())
  val earliest = nowUtc.minusYears(130)

  Column(modifier = Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(6.dp)) {
    Text("Date of birth", style = MaterialTheme.typography.labelLarge)
    OutlinedButton(
      onClick = {
        val selected = try {
          LocalDate.parse(value, DateTimeFormatter.ISO_LOCAL_DATE)
        } catch (_: Exception) {
          nowUtc.minusYears(21)
        }
        DatePickerDialog(
          context,
          { _, year, month, day -> onSelect(String.format(Locale.ROOT, "%04d-%02d-%02d", year, month + 1, day)) },
          selected.year,
          selected.monthValue - 1,
          selected.dayOfMonth,
        ).apply {
          datePicker.minDate = earliest.atStartOfDay(ZoneId.systemDefault()).toInstant().toEpochMilli()
          datePicker.maxDate = latest.atStartOfDay(ZoneId.systemDefault()).toInstant().toEpochMilli()
        }.show()
      },
      modifier = Modifier.fillMaxWidth(),
      enabled = enabled,
    ) {
      Text(if (value.isEmpty()) "Choose your birthday" else value)
    }
    Text("Private · not shown on your player profile.", style = MaterialTheme.typography.bodySmall,
      color = MaterialTheme.colorScheme.onSurfaceVariant)
  }
}
