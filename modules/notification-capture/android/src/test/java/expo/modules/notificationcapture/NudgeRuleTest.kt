package expo.modules.notificationcapture

import android.app.Notification
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * The privacy rule of the поштовх, proven on the JVM (monobank-sync-freshness, spec
 * bank-notifications-capture «A monobank notification is noted as a поштовх and never captured»).
 */
class NudgeRuleTest {
  private val mono = "com.ftband.mono"
  private val privat = "ua.privatbank.ap24"

  @Test
  fun `Scenario - Only the moment is noted - monobank is a поштовх, never a capture`() {
    assertEquals(NudgeRule.Route.NUDGE, NudgeRule.route(mono, 0, nudgesWanted = true, watched = emptySet()))
    // Even a stored watched set that somehow names monobank cannot make it a capture.
    assertEquals(NudgeRule.Route.NUDGE, NudgeRule.route(mono, 0, nudgesWanted = true, watched = setOf(mono)))
  }

  @Test
  fun `Scenario - Nothing is noted when no рахунок is linked`() {
    assertEquals(NudgeRule.Route.DROP, NudgeRule.route(mono, 0, nudgesWanted = false, watched = setOf(mono)))
  }

  @Test
  fun `Scenario - An ongoing monobank notification is ignored`() {
    for (flag in listOf(
      Notification.FLAG_ONGOING_EVENT,
      Notification.FLAG_FOREGROUND_SERVICE,
      Notification.FLAG_GROUP_SUMMARY,
    )) {
      assertEquals(NudgeRule.Route.DROP, NudgeRule.route(mono, flag, nudgesWanted = true, watched = emptySet()))
    }
    // An ordinary flag beside them is still news.
    assertEquals(
      NudgeRule.Route.NUDGE,
      NudgeRule.route(mono, Notification.FLAG_AUTO_CANCEL, nudgesWanted = true, watched = emptySet()),
    )
  }

  @Test
  fun `Scenario - A watched bank's capture is unchanged`() {
    assertEquals(NudgeRule.Route.CAPTURE, NudgeRule.route(privat, 0, nudgesWanted = true, watched = setOf(privat)))
    assertEquals(NudgeRule.Route.DROP, NudgeRule.route(privat, 0, nudgesWanted = true, watched = emptySet()))
  }

  @Test
  fun `Scenario - A burst of notifications costs one дочитування`() {
    assertTrue(NudgeRule.shouldEnqueue(emptyList()))
    assertTrue(NudgeRule.shouldEnqueue(listOf("SUCCEEDED", "CANCELLED", "FAILED")))
    // A second request while one waits, or runs after another, changes nothing.
    assertFalse(NudgeRule.shouldEnqueue(listOf("SUCCEEDED", "ENQUEUED")))
    assertFalse(NudgeRule.shouldEnqueue(listOf("BLOCKED")))
    // One that is running is not pending: the chain's next link may be asked for from inside it.
    assertTrue(NudgeRule.shouldEnqueue(listOf("RUNNING")))
  }
}
