package dev.streetsempire.app

import android.content.Context
import android.util.AttributeSet
import android.view.MotionEvent
import android.view.View
import androidx.swiperefreshlayout.widget.SwipeRefreshLayout

/**
 * Pull-to-refresh that only engages when two fingers are down, so ordinary
 * one-finger scrolling and dragging in the game never reloads the page.
 */
class TwoFingerSwipeRefreshLayout @JvmOverloads constructor(
    context: Context,
    attrs: AttributeSet? = null,
) : SwipeRefreshLayout(context, attrs) {

    private var twoFingers = false

    override fun onInterceptTouchEvent(ev: MotionEvent): Boolean {
        when (ev.actionMasked) {
            MotionEvent.ACTION_DOWN -> twoFingers = false
            MotionEvent.ACTION_POINTER_DOWN -> if (ev.pointerCount >= 2) twoFingers = true
            // pointerCount still includes the finger that is lifting.
            MotionEvent.ACTION_POINTER_UP -> if (ev.pointerCount - 1 < 2) twoFingers = false
            MotionEvent.ACTION_UP, MotionEvent.ACTION_CANCEL -> twoFingers = false
        }
        // Always let the parent see the stream so its drag state stays in sync.
        val wantsIntercept = super.onInterceptTouchEvent(ev)
        return twoFingers && wantsIntercept
    }

    override fun onStartNestedScroll(child: View, target: View, nestedScrollAxes: Int): Boolean =
        twoFingers && super.onStartNestedScroll(child, target, nestedScrollAxes)
}
