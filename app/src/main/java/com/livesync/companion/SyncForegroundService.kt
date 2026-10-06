package com.livesync.companion

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Intent
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import androidx.core.app.NotificationCompat

class SyncForegroundService : Service() {
    companion object { private const val CHANNEL_ID = "livesync_background"; private const val NOTIFICATION_ID = 1001 }
    private val handler = Handler(Looper.getMainLooper())
    private val statusLoop = object : Runnable { override fun run() { updateNotification("LiveSync host active · core adapter pending"); handler.postDelayed(this, 30_000L) } }
    override fun onCreate() { super.onCreate(); createChannel(); startForeground(NOTIFICATION_ID, notification("Preparing vault synchronization")) }
    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int { handler.removeCallbacks(statusLoop); handler.post(statusLoop); return START_STICKY }
    private fun updateNotification(message: String) { getSystemService(NotificationManager::class.java).notify(NOTIFICATION_ID, notification(message)) }
    private fun notification(message: String): Notification = NotificationCompat.Builder(this, CHANNEL_ID).setSmallIcon(android.R.drawable.stat_sys_upload).setContentTitle("LiveSync Companion").setContentText(message).setOngoing(true).setSilent(true).setPriority(NotificationCompat.PRIORITY_LOW).build()
    private fun createChannel() { getSystemService(NotificationManager::class.java).createNotificationChannel(NotificationChannel(CHANNEL_ID, "Background synchronization", NotificationManager.IMPORTANCE_LOW).apply { setSound(null, null); description = "Required silent channel for Android foreground sync service" }) }
    override fun onDestroy() { handler.removeCallbacks(statusLoop); super.onDestroy() }
    override fun onBind(intent: Intent?): IBinder? = null
}
