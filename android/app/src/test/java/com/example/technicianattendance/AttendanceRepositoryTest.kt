package com.example.technicianattendance

import com.example.technicianattendance.data.AttendanceDao
import com.example.technicianattendance.data.AttendanceEntity
import com.example.technicianattendance.data.AttendanceRepository
import com.example.technicianattendance.data.AttendanceType
import com.example.technicianattendance.data.SyncStatus
import com.example.technicianattendance.data.UploadResult
import com.example.technicianattendance.data.AttendanceUploader
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Test

class AttendanceRepositoryTest {
    @Test
    fun `sync updates status in FIFO order`() = runTest {
        val updates = mutableListOf<Pair<String, SyncStatus>>()
        val dao = object : AttendanceDao {
            override suspend fun upsert(event: AttendanceEntity) = Unit

            override suspend fun getPendingEvents(): List<AttendanceEntity> {
                return listOf(
                    AttendanceEntity(
                        id = "1",
                        type = AttendanceType.CHECK_IN,
                        siteId = "site",
                        qrPayload = "qr",
                        selfiePath = "path",
                        selfieEncrypted = true,
                        latitude = 0.0,
                        longitude = 0.0,
                        accuracy = 1.0,
                        deviceId = null,
                        deviceModel = null,
                        osVersion = null,
                        appVersion = null,
                        status = SyncStatus.PENDING,
                        rejectionReason = null,
                        createdAt = 1L
                    ),
                    AttendanceEntity(
                        id = "2",
                        type = AttendanceType.CHECK_OUT,
                        siteId = "site",
                        qrPayload = null,
                        selfiePath = "path",
                        selfieEncrypted = true,
                        latitude = 0.0,
                        longitude = 0.0,
                        accuracy = 1.0,
                        deviceId = null,
                        deviceModel = null,
                        osVersion = null,
                        appVersion = null,
                        status = SyncStatus.PENDING,
                        rejectionReason = null,
                        createdAt = 2L
                    )
                )
            }

            override suspend fun updateStatus(id: String, status: SyncStatus, reason: String?) {
                updates.add(id to status)
            }
        }

        val repository = AttendanceRepository(dao)
        val uploader = object : AttendanceUploader {
            override suspend fun upload(event: AttendanceEntity): UploadResult {
                return UploadResult(success = true, message = null, nextDelayMs = 0)
            }
        }

        repository.syncPendingEvents(uploader)

        assertEquals(listOf("1" to SyncStatus.SYNCED, "2" to SyncStatus.SYNCED), updates)
    }
}
