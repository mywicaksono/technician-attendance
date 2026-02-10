package com.example.technicianattendance.data

import androidx.room.Entity
import androidx.room.PrimaryKey

@Entity(tableName = "attendance_events")
data class AttendanceEntity(
    @PrimaryKey val id: String,
    val type: AttendanceType,
    val siteId: String,
    val qrPayload: String?,
    val selfiePath: String,
    val selfieEncrypted: Boolean,
    val latitude: Double,
    val longitude: Double,
    val accuracy: Double,
    val deviceId: String?,
    val deviceModel: String?,
    val osVersion: String?,
    val appVersion: String?,
    val status: SyncStatus,
    val rejectionReason: String?,
    val createdAt: Long
)

enum class AttendanceType {
    CHECK_IN,
    CHECK_OUT
}

enum class SyncStatus {
    PENDING,
    SYNCED,
    REJECTED
}
