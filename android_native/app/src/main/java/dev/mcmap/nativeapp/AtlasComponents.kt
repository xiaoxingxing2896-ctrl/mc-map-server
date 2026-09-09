package dev.mcmap.nativeapp

import android.os.Build
import android.os.SystemClock
import android.view.HapticFeedbackConstants
import android.view.View
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.unit.dp
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.*
import androidx.compose.foundation.Canvas
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.drawscope.Stroke

enum class AtlasFeedback { Selection, LongPress, Success }
class AtlasHaptics(private val view: View, private val enabled: () -> Boolean) {
    private var lastEvent = 0L
    fun emit(event: AtlasFeedback) {
        if (!enabled()) return
        val now = SystemClock.uptimeMillis()
        if (now - lastEvent < 100) return
        lastEvent = now
        val effect = when (event) {
            AtlasFeedback.Selection -> HapticFeedbackConstants.CLOCK_TICK
            AtlasFeedback.LongPress -> HapticFeedbackConstants.LONG_PRESS
            AtlasFeedback.Success -> if (Build.VERSION.SDK_INT >= 30) HapticFeedbackConstants.CONFIRM else HapticFeedbackConstants.CONTEXT_CLICK
        }
        // Framework feedback respects system touch-feedback settings; no forced vibration.
        view.performHapticFeedback(effect)
    }
}
val LocalAtlasHaptics = staticCompositionLocalOf<AtlasHaptics?> { null }
val LocalAtlasMotion = staticCompositionLocalOf { "off" }
val LocalAtlasTheme = staticCompositionLocalOf { ThemeCatalog.packs.first() }

enum class AtlasDestination(val label: String) { Servers("服务器"), Wiki("Wiki"), Map("地图"), Markers("标记"), Profile("我的") }
@Composable fun AtlasDestinationIcon(destination: AtlasDestination, modifier: Modifier = Modifier) {
    val color = LocalContentColor.current
    Canvas(modifier) {
        val unit = size.minDimension / 24f
        fun line(x: Float, y: Float, endX: Float, endY: Float) = drawLine(color, Offset(x * unit, y * unit), Offset(endX * unit, endY * unit), 2 * unit)
        fun box(x: Float, y: Float, width: Float, height: Float) = drawRect(color, Offset(x * unit, y * unit), Size(width * unit, height * unit), style = Stroke(2 * unit))
        when (destination) {
            AtlasDestination.Servers -> { box(3f, 3f, 18f, 7f); box(3f, 14f, 18f, 7f); line(6f, 6.5f, 8f, 6.5f); line(6f, 17.5f, 8f, 17.5f) }
            AtlasDestination.Wiki -> { box(3f, 4f, 18f, 16f); line(12f, 4f, 12f, 21f); line(5f, 8f, 9f, 8f); line(15f, 8f, 19f, 8f); line(5f, 12f, 9f, 12f); line(15f, 12f, 19f, 12f) }
            AtlasDestination.Map -> { box(3f, 5f, 6f, 16f); box(9f, 3f, 6f, 16f); box(15f, 5f, 6f, 16f) }
            AtlasDestination.Markers -> { line(6f, 21f, 6f, 3f); line(6f, 3f, 18f, 3f); line(18f, 3f, 18f, 21f); line(6f, 21f, 12f, 16f); line(12f, 16f, 18f, 21f) }
            AtlasDestination.Profile -> { box(9f, 3f, 6f, 6f); box(5f, 14f, 14f, 7f); line(8f, 14f, 8f, 11f); line(8f, 11f, 16f, 11f); line(16f, 11f, 16f, 14f) }
        }
    }
}
@Composable fun AtlasNavigationBar(selected: Int, select: (Int) -> Unit) {
    val feedback = LocalAtlasHaptics.current
    val motion = LocalAtlasMotion.current
    NavigationBar(containerColor = MaterialTheme.colorScheme.surface, tonalElevation = 0.dp) {
        AtlasDestination.entries.forEachIndexed { index, destination ->
            val active = selected == index
            val scale by animateFloatAsState(if (active && motion == "full") 1.12f else 1f, tween(motionDuration(motion, true, 160)), label = "navigation selection")
            NavigationBarItem(active, { if (!active) feedback?.emit(AtlasFeedback.Selection); select(index) },
                icon = { AtlasDestinationIcon(destination, Modifier.size(26.dp).graphicsLayer { scaleX = scale; scaleY = scale }) }, label = { Text(destination.label, maxLines = 1) },
                colors = NavigationBarItemDefaults.colors(indicatorColor = MaterialTheme.colorScheme.primaryContainer, selectedIconColor = MaterialTheme.colorScheme.primary, selectedTextColor = MaterialTheme.colorScheme.primary))
        }
    }
}

@Composable private fun pressModifier(source: MutableInteractionSource): Modifier {
    val down by source.collectIsPressedAsState()
    val mode = LocalAtlasMotion.current
    val amount by animateFloatAsState(if (down && mode == "full") 1f else 0f, tween(motionDuration(mode, true, 100)), label = "block press")
    return Modifier.graphicsLayer { translationY = 2.dp.toPx() * amount; scaleX = 1f - .025f * amount; scaleY = scaleX }
}

@Composable fun AtlasButton(onClick: () -> Unit, modifier: Modifier = Modifier, enabled: Boolean = true, shape: Shape = MaterialTheme.shapes.small, content: @Composable RowScope.() -> Unit) {
    val source = remember { MutableInteractionSource() }
    Button(onClick, modifier.heightIn(min = 48.dp).then(pressModifier(source)), enabled, shape = shape, interactionSource = source, content = content)
}
@Composable fun AtlasOutlinedButton(onClick: () -> Unit, modifier: Modifier = Modifier, enabled: Boolean = true, shape: Shape = MaterialTheme.shapes.small, border: BorderStroke? = BorderStroke(1.dp, MaterialTheme.colorScheme.outline), contentPadding: PaddingValues = ButtonDefaults.ContentPadding, content: @Composable RowScope.() -> Unit) {
    val source = remember { MutableInteractionSource() }
    OutlinedButton(onClick, modifier.heightIn(min = 48.dp).then(pressModifier(source)), enabled, shape = shape, border = border, contentPadding = contentPadding, interactionSource = source, content = content)
}
@Composable fun AtlasTextButton(onClick: () -> Unit, modifier: Modifier = Modifier, enabled: Boolean = true, shape: Shape = MaterialTheme.shapes.small, contentPadding: PaddingValues = ButtonDefaults.TextButtonContentPadding, content: @Composable RowScope.() -> Unit) {
    val source = remember { MutableInteractionSource() }
    TextButton(onClick, modifier.heightIn(min = 48.dp).then(pressModifier(source)), enabled, shape = shape, contentPadding = contentPadding, interactionSource = source, content = content)
}
@Composable fun AtlasFilledTonalButton(onClick: () -> Unit, modifier: Modifier = Modifier, enabled: Boolean = true, content: @Composable RowScope.() -> Unit) {
    val source = remember { MutableInteractionSource() }
    FilledTonalButton(onClick, modifier.heightIn(min = 48.dp).then(pressModifier(source)), enabled, shape = MaterialTheme.shapes.small, interactionSource = source, content = content)
}
@Composable fun AtlasIconButton(onClick: () -> Unit, modifier: Modifier = Modifier, enabled: Boolean = true, content: @Composable () -> Unit) {
    val source = remember { MutableInteractionSource() }
    IconButton(onClick, modifier.sizeIn(minWidth = 48.dp, minHeight = 48.dp).then(pressModifier(source)), enabled, interactionSource = source, content = content)
}
@Composable fun AtlasFilledTonalIconButton(onClick: () -> Unit, modifier: Modifier = Modifier, enabled: Boolean = true, content: @Composable () -> Unit) {
    val source = remember { MutableInteractionSource() }
    FilledTonalIconButton(onClick, modifier.sizeIn(minWidth = 48.dp, minHeight = 48.dp).then(pressModifier(source)), enabled, shape = MaterialTheme.shapes.small, interactionSource = source, content = content)
}
@Composable fun AtlasFilledIconButton(onClick: () -> Unit, modifier: Modifier = Modifier, enabled: Boolean = true, content: @Composable () -> Unit) {
    val source = remember { MutableInteractionSource() }
    FilledIconButton(onClick, modifier.sizeIn(minWidth = 48.dp, minHeight = 48.dp).then(pressModifier(source)), enabled, shape = MaterialTheme.shapes.small, interactionSource = source, content = content)
}
@Composable fun AtlasCard(modifier: Modifier = Modifier, colors: CardColors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface), content: @Composable ColumnScope.() -> Unit) {
    Card(modifier, shape = MaterialTheme.shapes.medium, colors = colors, border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant), content = content)
}
@Composable fun AtlasCard(onClick: () -> Unit, modifier: Modifier = Modifier, colors: CardColors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface), content: @Composable ColumnScope.() -> Unit) {
    val source = remember { MutableInteractionSource() }
    Card(onClick, modifier.then(pressModifier(source)), shape = MaterialTheme.shapes.medium, colors = colors, border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant), interactionSource = source, content = content)
}
@Composable fun AtlasIcon(imageVector: ImageVector, contentDescription: String?, modifier: Modifier = Modifier, tint: Color = LocalContentColor.current) = Icon(imageVector, contentDescription, modifier, tint)

@Composable fun AtlasSwitch(checked: Boolean, onCheckedChange: (Boolean) -> Unit, enabled: Boolean = true) {
    val feedback = LocalAtlasHaptics.current
    Switch(checked, { feedback?.emit(AtlasFeedback.Selection); onCheckedChange(it) }, enabled = enabled)
}
@Composable fun AtlasFilterChip(selected: Boolean, onClick: () -> Unit, label: @Composable () -> Unit, modifier: Modifier = Modifier, enabled: Boolean = true, leadingIcon: (@Composable () -> Unit)? = null) {
    val feedback = LocalAtlasHaptics.current
    FilterChip(selected, { if (!selected) feedback?.emit(AtlasFeedback.Selection); onClick() }, label, modifier.heightIn(min = 48.dp), enabled = enabled, leadingIcon = leadingIcon, shape = MaterialTheme.shapes.small)
}
@Composable fun AtlasTextField(value: String, onValueChange: (String) -> Unit, modifier: Modifier = Modifier, enabled: Boolean = true,
    label: (@Composable () -> Unit)? = null, placeholder: (@Composable () -> Unit)? = null,
    leadingIcon: (@Composable () -> Unit)? = null, trailingIcon: (@Composable () -> Unit)? = null,
    supportingText: (@Composable () -> Unit)? = null, prefix: (@Composable () -> Unit)? = null,
    isError: Boolean = false, singleLine: Boolean = false, visualTransformation: VisualTransformation = VisualTransformation.None,
    keyboardOptions: KeyboardOptions = KeyboardOptions.Default, keyboardActions: KeyboardActions = KeyboardActions.Default) {
    OutlinedTextField(value, onValueChange, modifier, enabled = enabled, label = label, placeholder = placeholder, leadingIcon = leadingIcon,
        trailingIcon = trailingIcon, supportingText = supportingText, prefix = prefix, isError = isError, singleLine = singleLine,
        visualTransformation = visualTransformation, keyboardOptions = keyboardOptions, keyboardActions = keyboardActions, shape = MaterialTheme.shapes.small)
}
@Composable fun AtlasDialog(onDismissRequest: () -> Unit, confirmButton: @Composable () -> Unit, title: (@Composable () -> Unit)? = null, text: (@Composable () -> Unit)? = null, dismissButton: (@Composable () -> Unit)? = null) {
    AlertDialog(onDismissRequest, confirmButton, dismissButton = dismissButton, title = title, text = text, shape = MaterialTheme.shapes.large, containerColor = MaterialTheme.colorScheme.surface)
}
