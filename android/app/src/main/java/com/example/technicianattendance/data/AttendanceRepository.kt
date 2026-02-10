package com.example.technicianattendance.data

import kotlinx.coroutines.delay

class AttendanceRepository(private val dao: AttendanceDao) {
    suspend fun enqueue(event: AttendanceEntity) {
        dao.upsert(event)
    }

    suspend fun syncPendingEvents(uploader: AttendanceUploader) {
        val pending = dao.getPendingEvents()
        for (event in pending) {
            val result = uploader.upload(event)
            if (result.success) {
                dao.updateStatus(event.id, SyncStatus.SYNCED, null)
            } else {
                dao.updateStatus(event.id, SyncStatus.REJECTED, result.message)
            }
            delay(result.nextDelayMs)
        }
    }
}

data class UploadResult(val success: Boolean, val message: String?, val nextDelayMs: Long)

interface AttendanceUploader {
    suspend fun upload(event: AttendanceEntity): UploadResult
}
