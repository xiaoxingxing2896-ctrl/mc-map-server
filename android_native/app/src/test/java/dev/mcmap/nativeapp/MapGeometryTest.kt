package dev.mcmap.nativeapp

import org.junit.Assert.assertEquals
import org.junit.Test

class MapGeometryTest {
    @Test fun overviewUsesBoundedResolutionAndZoomKeepsNativeDetail() {
        assertEquals(256, mapTileDecodeSize(.125f))
        assertEquals(256, mapTileDecodeSize(.25f))
        assertEquals(512, mapTileDecodeSize(.5f))
        assertEquals(1024, mapTileDecodeSize(1f))
        assertEquals(1024, mapTileDecodeSize(8f))
    }
    @Test fun oddCoordinatesNearWorldBorderRemainAtExactCenter() {
        for (world in listOf(-29999999.0, -1.0, 0.0, 29999999.0)) {
            for (scale in listOf(.125f, .5f, 1f, 8f)) {
                assertEquals(540f, mapScreenPosition(world, world, scale, 1080f), 0f)
                assertEquals(540f + scale, mapScreenPosition(world + 1, world, scale, 1080f), 0f)
            }
        }
    }
    @Test fun pinchAndPanKeepAnchorUnderMovingFingers() {
        val center = 29999999.0
        val world = center + (230.0 - 540) / .5
        val next = mapGestureCenter(center, 230f, 17f, 1080f, .5f, 2f)
        assertEquals(247f, mapScreenPosition(world, next, 2f, 1080f), .001f)
    }
    @Test fun repeatedZoomCyclesDoNotDriftAtWorldBorder() {
        var center = -29999999.0
        repeat(1000) {
            center = mapGestureCenter(center, 123.5f, 0f, 1080f, .125f, 8f)
            center = mapGestureCenter(center, 123.5f, 0f, 1080f, 8f, .125f)
        }
        assertEquals(-29999999.0, center, .000001)
    }
    @Test fun adjacentTileEdgesMatchAcrossZoomLevels() {
        for (scale in listOf(.125f, .7f, 1f, 8f)) {
            val left = mapScreenPosition(-1024.0, -17.25, scale, 1080f)
            val right = mapScreenPosition(0.0, -17.25, scale, 1080f)
            assertEquals(right, left + 1024 * scale, .001f)
        }
    }
}
