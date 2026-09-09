package dev.mcmap.nativeapp

/** Subtract in Double before converting to screen pixels (world bounds exceed Float integer precision). */
internal fun mapScreenPosition(world: Double, center: Double, scale: Float, extent: Float): Float =
    ((world - center) * scale + extent / 2).toFloat()

/** Preserve the world point under the gesture centroid, including simultaneous pan. */
internal fun mapGestureCenter(center: Double, centroid: Float, pan: Float, extent: Float, scale: Float, next: Float): Double =
    center + (centroid.toDouble() - extent / 2) / scale - (centroid.toDouble() - extent / 2 + pan) / next

// Overview can contain hundreds of tiles. Avoid retaining a 4 MB bitmap for each.
internal fun mapTileDecodeSize(scale: Float): Int = when {
    scale <= .25f -> 256
    scale <= .5f -> 512
    else -> 1024
}
