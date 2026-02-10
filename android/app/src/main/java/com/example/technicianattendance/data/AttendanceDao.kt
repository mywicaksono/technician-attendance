package com.example.technicianattendance.data

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query

@Dao
interface AttendanceDao {
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsert(event: AttendanceEntity)

    @Query("SELECT * FROM attendance_events WHERE status = 'PENDING' ORDER BY createdAt ASC")
    suspend fun getPendingEvents(): List<AttendanceEntity>

    @Query("UPDATE attendance_events SET status = :status, rejectionReason = :reason WHERE id = :id")
    suspend fun updateStatus(id: String, status: SyncStatus, reason: String?)
}
