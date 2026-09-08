package dev.mcmap.nativeapp

import java.io.IOException
import java.net.SocketTimeoutException
import java.net.UnknownHostException
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.async
import kotlinx.coroutines.runBlocking
import org.junit.Assert.*
import org.junit.Test

class AuthStateTest {
    @Test fun emailAndMissingPasswordAreCheckedWithoutRejectingExistingPasswords() {
        assertEquals("请输入注册邮箱", loginInputError("  ", "password"))
        assertEquals("请输入有效的邮箱地址", loginInputError("alice", "password"))
        assertEquals("请输入有效的邮箱地址", loginInputError("a b@example.com", "password"))
        assertEquals("请输入密码", loginInputError("alice@example.com", ""))
        assertNull(loginInputError(" Alice@Example.com ", "old"))
        assertNull(loginInputError("alice@example.com", "  password  "))
    }

    @Test fun actionableLoginResponsesKeepTheirServerMessage() {
        assertEquals("邮箱或密码错误", loginFailureMessage(ApiException(401, "邮箱或密码错误")))
        assertEquals("邮箱未验证，请先验证邮箱", loginFailureMessage(ApiException(403, "邮箱未验证，请先验证邮箱")))
        assertEquals("登录尝试过于频繁，请稍后再试", loginFailureMessage(ApiException(429, "Rate limited")))
        assertEquals("登录服务暂时不可用，请稍后重试", loginFailureMessage(ApiException(502, "Bad gateway")))
    }

    @Test fun networkFailuresHaveUsefulMessagesWithoutExposingRawExceptionDetails() {
        assertEquals("登录请求超时，请检查网络后重试", loginFailureMessage(SocketTimeoutException("timeout")))
        assertEquals("无法连接登录服务，请检查网络", loginFailureMessage(UnknownHostException("internal host")))
        assertEquals("网络连接中断，请检查网络后重试", loginFailureMessage(IOException("stream reset")))
    }

    @Test fun loginResponseArrivingAfterLogoutCannotRestoreSavedSession() = runBlocking {
        val changes = SessionChanges()
        val loginRevision = changes.revision
        var saved: String? = "old session"
        val logoutRevision = changes.next()
        assertTrue(changes.commit(logoutRevision) { saved = null })
        assertFalse(changes.commit(loginRevision) { saved = "late login" })
        assertNull(saved)
    }

    @Test fun logoutWaitsForInFlightSessionWriteThenRemovesIt() = runBlocking {
        val changes = SessionChanges()
        val loginRevision = changes.revision
        val writeStarted = CompletableDeferred<Unit>()
        val releaseWrite = CompletableDeferred<Unit>()
        var saved: String? = null
        val login = async {
            changes.commit(loginRevision) {
                writeStarted.complete(Unit)
                releaseWrite.await()
                saved = "late saved session"
            }
        }
        writeStarted.await()
        val logoutRevision = changes.next()
        val logout = async { changes.commit(logoutRevision) { saved = null } }
        releaseWrite.complete(Unit)
        assertFalse(login.await())
        assertTrue(logout.await())
        assertNull(saved)
    }

    @Test fun freshLoginCannotBeOverwrittenByAnOldProfileValidation() = runBlocking {
        val changes = SessionChanges()
        val validationRevision = changes.revision
        val currentRevision = changes.next()
        var saved: String? = "old account"
        changes.commit(currentRevision) { saved = null }
        changes.commit(currentRevision) { saved = "new account" }
        assertFalse(changes.commit(validationRevision) { saved = "old account" })
        assertEquals("new account", saved)
    }
}
