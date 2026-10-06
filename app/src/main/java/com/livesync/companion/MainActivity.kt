package com.livesync.companion

import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.os.Build
import android.provider.Settings
import android.view.Gravity
import android.view.ViewGroup
import android.widget.Button
import android.widget.LinearLayout
import android.widget.TextView
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat

class MainActivity : AppCompatActivity() {
    private val prefs by lazy { getSharedPreferences("companion", MODE_PRIVATE) }
    private lateinit var vaultValue: TextView
    private val pickVault = registerForActivityResult(ActivityResultContracts.OpenDocumentTree()) { uri: Uri? ->
        uri ?: return@registerForActivityResult
        contentResolver.takePersistableUriPermission(uri, Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_GRANT_WRITE_URI_PERMISSION)
        prefs.edit().putString("vault_uri", uri.toString()).apply()
        renderVault()
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.statusBarColor = getColor(R.color.base_background)
        window.navigationBarColor = getColor(R.color.base_background)
        setContentView(buildView())
        renderVault()
    }

    private fun buildView(): LinearLayout {
        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL; setPadding(28, 42, 28, 28); setBackgroundColor(getColor(R.color.base_background))
        }
        fun text(value: String, size: Float, color: Int = R.color.base_text) = TextView(this).apply { this.text = value; textSize = size; setTextColor(getColor(color)); setPadding(0, 6, 0, 6) }
        root.addView(text("LiveSync Companion", 26f), LinearLayout.LayoutParams(-1, -2))
        root.addView(text("Android host for self-hosted vault synchronization", 13f, R.color.base_muted))
        root.addView(text("VAULT", 11f, R.color.base_muted).apply { setPadding(0, 36, 0, 4) })
        vaultValue = text("Not selected", 15f)
        root.addView(vaultValue)
        root.addView(Button(this).apply { text = "Choose vault folder"; setOnClickListener { pickVault.launch(null) } }, LinearLayout.LayoutParams(-1, -2).apply { topMargin = 10 })
        root.addView(text("SYNC ENGINE", 11f, R.color.base_muted).apply { setPadding(0, 30, 0, 4) })
        root.addView(text("Foreground service is ready to host the LiveSync core.", 14f))
        root.addView(Button(this).apply { text = "Start background sync"; setOnClickListener { startSyncService() } }, LinearLayout.LayoutParams(-1, -2).apply { topMargin = 12 })
        root.addView(Button(this).apply { text = "Open Obsidian"; setOnClickListener { openObsidian() } }, LinearLayout.LayoutParams(-1, -2).apply { topMargin = 8 })
        root.addView(Button(this).apply { text = "Protect from battery optimization"; setOnClickListener { requestBatteryExemption() } }, LinearLayout.LayoutParams(-1, -2).apply { topMargin = 8 })
        root.addView(text("The vault permission is stored by Android and survives restarts. The system foreground notification is mandatory for a reliable background service; it is intentionally silent and low priority.", 12f, R.color.base_muted).apply { setPadding(0, 24, 0, 0) })
        return root
    }

    private fun renderVault() { if (::vaultValue.isInitialized) vaultValue.text = prefs.getString("vault_uri", null)?.let { Uri.parse(it).lastPathSegment ?: it } ?: "Not selected" }

    private fun startSyncService() { val intent = Intent(this, SyncForegroundService::class.java); ContextCompat.startForegroundService(this, intent) }

    private fun openObsidian() {
        val intent = packageManager.getLaunchIntentForPackage("md.obsidian")
        if (intent != null) startActivity(intent) else startActivity(Intent(Intent.ACTION_VIEW, Uri.parse("https://obsidian.md/mobile")))
    }

    private fun requestBatteryExemption() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) startActivity(Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, Uri.parse("package:$packageName")))
    }
}
