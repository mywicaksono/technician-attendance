package com.example.technicianattendance.data

import androidx.room.Database
import androidx.room.RoomDatabase

@Database(entities = [AttendanceEntity::class], version = 1)
abstract class AttendanceDatabase : RoomDatabase() {
    abstract fun attendanceDao(): AttendanceDao
}
