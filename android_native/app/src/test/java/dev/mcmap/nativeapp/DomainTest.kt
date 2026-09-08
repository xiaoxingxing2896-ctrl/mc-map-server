package dev.mcmap.nativeapp

import org.junit.Assert.*
import org.junit.Test
import java.io.ByteArrayInputStream
import java.io.ByteArrayOutputStream

class DomainTest {
    @Test fun fileReadsAreBoundedEvenWithoutProviderSizeMetadata() {
        assertArrayEquals(byteArrayOf(1, 2, 3), readTileBytes(ByteArrayInputStream(byteArrayOf(1, 2, 3)), 3))
        assertTrue(runCatching { readTileBytes(ByteArrayInputStream(ByteArray(4)), 3) }.isFailure)
    }
    @Test fun coordinateNamesStayWithinWorldBounds() {
        assertEquals(-1024 to 0, parseTileName("3_16_x-1024_z0.png"))
        assertEquals(0 to 2048, parseTileName("x0z2048.png"))
        listOf("../x0_z0.png", "x30000001_z0.png", "x0_z0.svg", "x99999999999_z0.png").forEach { assertNull(parseTileName(it)) }
    }
    @Test fun expiredOrMissingLoginTimesNeverRestore() {
        val now = 1000000000L
        val user = User("alice", "admin", "alice@example.com", "token", now)
        assertTrue(user.valid(now))
        assertFalse(user.copy(loginAt = 0).valid(now))
        assertFalse(user.copy(loginAt = now + 1).valid(now))
        assertFalse(user.valid(now + 7 * 86400000L))
    }
    @Test fun endpointsSupportIpv6AndRejectBadPorts() {
        assertEquals(Endpoint("example.com", 25565), Endpoint.parse(" example.com "))
        assertEquals(Endpoint("::1", 25566), Endpoint.parse("[::1]:25566"))
        listOf("", "host:0", "host:65536", "host:abc", "https://host", "host/path", "::1").forEach { assertTrue(runCatching { Endpoint.parse(it) }.isFailure) }
    }
    @Test fun varIntsHandleFragmentationAndRejectTruncationAndOverflow() {
        listOf(0, 127, 128, 25565, 1048576, -1).forEach { n ->
            val out = ByteArrayOutputStream(); MinecraftPing.writeVarInt(out, n)
            assertEquals(n, MinecraftPing.readVarInt(ByteArrayInputStream(out.toByteArray())))
        }
        listOf(byteArrayOf(0x80.toByte()), byteArrayOf(-1, -1, -1, -1, 127), byteArrayOf(-1, -1, -1, -1, -1, 0)).forEach { bytes ->
            assertTrue(runCatching { MinecraftPing.readVarInt(ByteArrayInputStream(bytes)) }.isFailure)
        }
    }
}
