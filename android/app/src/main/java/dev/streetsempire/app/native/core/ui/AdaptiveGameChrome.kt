package dev.streetsempire.app.native.core.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Badge
import androidx.compose.material3.BadgedBox
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalDrawerSheet
import androidx.compose.material3.ModalNavigationDrawer
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.NavigationBarItemDefaults
import androidx.compose.material3.NavigationDrawerItem
import androidx.compose.material3.NavigationDrawerItemDefaults
import androidx.compose.material3.NavigationRail
import androidx.compose.material3.NavigationRailItem
import androidx.compose.material3.NavigationRailItemDefaults
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.launch

data class AppDestination(
  val label: String,
  val category: String,
  val shortLabel: String = label.take(1),
  val showsUnread: Boolean = false,
)

val PrimaryDestinations = listOf(
  AppDestination("Dashboard", "Primary", "D"),
  AppDestination("Actions", "Primary", "A"),
  AppDestination("Crew & Turf", "Primary", "C"),
  AppDestination("More", "Primary", "…"),
)

val AllFeatureDestinations = listOf(
  AppDestination("Actions", "Street"),
  AppDestination("Combat", "Street"),
  AppDestination("Casino", "Street"),
  AppDestination("Crew & Turf", "Empire"),
  AppDestination("Alliance", "Empire"),
  AppDestination("Community", "Social"),
  AppDestination("Notifications", "Social", showsUnread = true),
  AppDestination("Supporter", "Account"),
  AppDestination("Account", "Account"),
)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AdaptiveGameChrome(
  title: String,
  selected: String,
  unreadNotifications: Int,
  onNavigate: (String) -> Unit,
  modifier: Modifier = Modifier,
  content: @Composable (PaddingValues) -> Unit,
) {
  val drawerState = androidx.compose.material3.rememberDrawerState(androidx.compose.material3.DrawerValue.Closed)
  val scope = rememberCoroutineScope()
  fun openMenu() { scope.launch { drawerState.open() } }
  fun closeMenu() { scope.launch { drawerState.close() } }
  ModalNavigationDrawer(
    drawerState = drawerState,
    gesturesEnabled = true,
    drawerContent = {
      FeatureMenu(
        selected = selected,
        unreadNotifications = unreadNotifications,
        onNavigate = {
          closeMenu()
          onNavigate(it)
        },
        onClose = ::closeMenu,
      )
    },
    modifier = modifier,
  ) {
    BoxWithConstraints(Modifier.fillMaxSize().background(SeShell.Bg)) {
      val expanded = maxWidth >= 840.dp
      val barColors = TopAppBarDefaults.topAppBarColors(
        containerColor = SeShell.Panel,
        titleContentColor = SeShell.Text,
        actionIconContentColor = SeShell.TextDim,
      )
      if (expanded) {
        Row(Modifier.fillMaxSize()) {
          NavigationRail(
            modifier = Modifier.fillMaxHeight().testTag("expanded-navigation"),
            containerColor = SeShell.Panel,
            header = { TextButton(onClick = ::openMenu) { Text("All", color = SeShell.Accent) } },
          ) {
            PrimaryDestinations.filterNot { it.label == "More" }.forEach { destination ->
              NavigationRailItem(
                selected = selected == destination.label,
                onClick = { onNavigate(destination.label) },
                icon = { DestinationGlyph(destination, unreadNotifications) },
                label = { Text(destination.label, color = if (selected == destination.label) SeShell.Accent else SeShell.TextDim) },
                modifier = Modifier.testTag("rail-item-${destination.label}"),
                colors = NavigationRailItemDefaults.colors(
                  selectedIconColor = SeShell.Accent,
                  selectedTextColor = SeShell.Accent,
                  unselectedIconColor = SeShell.TextDim,
                  unselectedTextColor = SeShell.TextDim,
                  indicatorColor = SeShell.PanelHi,
                ),
              )
            }
          }
          Scaffold(
            modifier = Modifier.weight(1f),
            containerColor = SeShell.Bg,
            topBar = {
              Column {
                TopAppBar(
                  title = { SeBrand(title) },
                  actions = {
                    TextButton(onClick = ::openMenu, modifier = Modifier.testTag("expanded-all-features")) {
                      Text("All features", color = SeShell.TextDim)
                    }
                  },
                  colors = barColors,
                )
                HorizontalDivider(color = SeShell.Line, thickness = 1.dp)
              }
            },
            content = content,
          )
        }
      } else {
        Scaffold(
          modifier = Modifier.testTag("compact-navigation"),
          containerColor = SeShell.Bg,
          topBar = {
            Column {
              TopAppBar(
                title = { SeBrand(title) },
                colors = barColors,
              )
              HorizontalDivider(color = SeShell.Line, thickness = 1.dp)
            }
          },
          bottomBar = {
            Column {
              HorizontalDivider(color = SeShell.Line, thickness = 1.dp)
              NavigationBar(
                Modifier.testTag("compact-bottom-bar"),
                containerColor = SeShell.Panel,
              ) {
                PrimaryDestinations.forEach { destination ->
                  NavigationBarItem(
                    selected = selected == destination.label,
                    onClick = {
                      if (destination.label == "More") openMenu() else onNavigate(destination.label)
                    },
                    icon = { DestinationGlyph(destination, unreadNotifications) },
                    label = { Text(destination.label) },
                    modifier = Modifier.testTag("bottom-item-${destination.label}"),
                    colors = NavigationBarItemDefaults.colors(
                      selectedIconColor = SeShell.Accent,
                      selectedTextColor = SeShell.Accent,
                      unselectedIconColor = SeShell.TextDim,
                      unselectedTextColor = SeShell.TextDim,
                      indicatorColor = SeShell.PanelHi,
                    ),
                  )
                }
              }
            }
          },
          content = content,
        )
      }
    }
  }
}

@Composable
private fun FeatureMenu(
  selected: String,
  unreadNotifications: Int,
  onNavigate: (String) -> Unit,
  onClose: () -> Unit,
) {
  ModalDrawerSheet(
    Modifier.fillMaxHeight().testTag("all-features-menu"),
    drawerContainerColor = SeShell.Panel,
    drawerContentColor = SeShell.Text,
  ) {
    Column(Modifier.verticalScroll(rememberScrollState()).padding(vertical = 12.dp)) {
      SeBrand("StreetsEmpire", modifier = Modifier.padding(horizontal = 20.dp, vertical = 4.dp))
      SeEyebrow("All features", modifier = Modifier.padding(horizontal = 20.dp, vertical = 8.dp))
      TextButton(onClick = onClose, modifier = Modifier.padding(horizontal = 8.dp)) {
        Text("Close", color = SeShell.TextDim)
      }
      AllFeatureDestinations.groupBy { it.category }.forEach { (category, destinations) ->
        HorizontalDivider(Modifier.padding(top = 8.dp), color = SeShell.LineSoft)
        Text(
          category.uppercase(),
          style = MaterialTheme.typography.labelSmall.copy(letterSpacing = 1.4.sp),
          color = SeShell.Muted,
          modifier = Modifier.padding(horizontal = 20.dp, vertical = 10.dp).testTag("category-$category"),
        )
        destinations.forEach { destination ->
          NavigationDrawerItem(
            label = { Text(destination.label) },
            selected = selected == destination.label,
            onClick = { onNavigate(destination.label) },
            icon = { DestinationGlyph(destination, unreadNotifications) },
            modifier = Modifier.padding(horizontal = 12.dp).testTag("drawer-item-${destination.label}"),
            colors = NavigationDrawerItemDefaults.colors(
              selectedContainerColor = SeShell.PanelHi,
              unselectedContainerColor = SeShell.Panel,
              selectedTextColor = SeShell.Accent,
              unselectedTextColor = SeShell.Text,
              selectedIconColor = SeShell.Accent,
              unselectedIconColor = SeShell.TextDim,
            ),
            shape = SeShell.ControlShape,
          )
        }
      }
    }
  }
}

@Composable
private fun DestinationGlyph(destination: AppDestination, unreadNotifications: Int) {
  BadgedBox(
    badge = {
      if (destination.showsUnread && unreadNotifications > 0) {
        Badge { Text(unreadNotifications.coerceAtMost(99).toString(), Modifier.testTag("unread-badge")) }
      }
    },
  ) {
    Text(destination.shortLabel, style = MaterialTheme.typography.labelLarge)
  }
}
