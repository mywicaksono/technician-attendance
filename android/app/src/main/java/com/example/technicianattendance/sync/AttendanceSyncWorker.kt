package com.example.technicianattendance.sync

import android.content.Context
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import com.example.technicianattendance.data.AttendanceRepository

class AttendanceSyncWorker(
    appContext: Context,
    params: WorkerParameters,
    private val repository: AttendanceRepository
) : CoroutineWorker(appContext, params) {
    override suspend fun doWork(): Result {
        return try {
            repository.syncPendingEvents(FifoUploader())
            Result.success()
        } catch (ex: Exception) {
            Result.retry()
        }
    }
}

class FifoUploader : com.example.technicianattendance.data.AttendanceUploader {
    override suspend fun upload(event: com.example.technicianattendance.data.AttendanceEntity): com.example.technicianattendance.data.UploadResult {
        return com.example.technicianattendance.data.UploadResult(
            success = false,
            message = "Not yet connected",
            nextDelayMs = 1000L
        )
    }
}
