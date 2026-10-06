package com.livesync.companion

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import androidx.core.content.ContextCompat

class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != Intent.ACTION_BOOT_COMPLETED) return
        try { ContextCompat.startForegroundService(context, Intent(context, SyncForegroundService::class.java)) } catch (_: Exception) { context.getSharedPreferences("companion", Context.MODE_PRIVATE).edit().putBoolean("boot_pending", true).apply() }
    }
}
