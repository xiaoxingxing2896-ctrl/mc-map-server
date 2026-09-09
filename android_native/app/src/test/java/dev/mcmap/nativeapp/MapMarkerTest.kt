package dev.mcmap.nativeapp

import org.junit.Assert.*
import org.junit.Test

class MapMarkerTest {
    private fun marker(id: Int, x: Int, z: Int) = Marker(id, "标记$id", "", x, z, "building", "", "", "overworld")
    @Test fun nearbyPinsMergeAndZoomRevealsIndividuals() {
        val markers = listOf(marker(1, 0, 0), marker(2, 10, 0), marker(3, 20, 0))
        assertEquals(1, groupMapMarkers(markers, 32f).size)
        assertEquals(3, groupMapMarkers(markers, 8f).size)
    }
    @Test fun duplicatesRemainReachableAsAGroup() {
        val markers = (1..120).map { marker(it, -100, 200) }
        val group = groupMapMarkers(markers, 1f).single()
        assertEquals(120, group.members.size)
        assertEquals(markers.map { it.id }, group.members.map { it.id })
    }
    @Test fun groupingIsStableAcrossResponseOrderAndNegativeGridEdges() {
        val markers = listOf(marker(3, -33, -1), marker(1, -31, -1), marker(2, 100, 100))
        assertEquals(groupMapMarkers(markers, 32f), groupMapMarkers(markers.reversed(), 32f))
        assertEquals(listOf(1, 3), groupMapMarkers(markers, 32f).first().members.map { it.id })
    }
    @Test fun everyMarkerOccursOnceAndDisplayedAnchorsDoNotOverlap() {
        val markers = (0..999).map { marker(it, (it * 73) % 997 - 500, (it * 137) % 991 - 500) }
        val groups = groupMapMarkers(markers, 32f)
        assertEquals(markers.map { it.id }.sorted(), groups.flatMap { it.members }.map { it.id }.sorted())
        groups.forEachIndexed { index, a -> groups.drop(index + 1).forEach { b ->
            val dx = a.x.toDouble() - b.x; val dz = a.z.toDouble() - b.z
            assertTrue(dx * dx + dz * dz > 32.0 * 32)
        } }
    }
    @Test fun handlesWorldBoundsAndRejectsInvalidScale() {
        assertEquals(2, groupMapMarkers(listOf(marker(1, -30000000, -30000000), marker(2, 30000000, 30000000)), 800f).size)
        assertTrue(groupMapMarkers(emptyList(), 32f).isEmpty())
        assertThrows(IllegalArgumentException::class.java) { groupMapMarkers(emptyList(), 0f) }
        assertThrows(IllegalArgumentException::class.java) { groupMapMarkers(emptyList(), Float.NaN) }
    }
}
