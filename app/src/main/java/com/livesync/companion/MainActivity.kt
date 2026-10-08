package com.livesync.companion

import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.util.Base64
import android.webkit.JavascriptInterface
import android.webkit.WebView
import android.webkit.WebViewClient
import android.graphics.Color
import android.graphics.drawable.GradientDrawable
import android.view.Gravity
import android.widget.Button
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.TextView
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import androidx.documentfile.provider.DocumentFile
import org.json.JSONArray
import org.json.JSONObject
import java.io.FileNotFoundException

class MainActivity : AppCompatActivity() {
    private lateinit var webView: WebView
    private val prefs by lazy { getSharedPreferences("companion", MODE_PRIVATE) }
    private var pendingPickerCallback: String? = null
    private val pickVault = registerForActivityResult(ActivityResultContracts.OpenDocumentTree()) { uri: Uri? ->
        val callback = pendingPickerCallback
        pendingPickerCallback = null
        if (uri != null) {
            contentResolver.takePersistableUriPermission(uri, Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_GRANT_WRITE_URI_PERMISSION)
            prefs.edit().putString("vault_uri", uri.toString()).apply()
            startSyncService()
            showLiveSyncScreen()
        } else if (callback != null && ::webView.isInitialized) webView.evaluateJavascript("window.__nativeVaultPicked('$callback', false)", null)
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        if (root() == null) {
            showVaultSetupScreen()
            return
        }
        showLiveSyncScreen()
    }

    private fun showVaultSetupScreen() {
        val screen = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER
            setPadding(36, 36, 36, 36)
            setBackgroundColor(Color.rgb(15, 15, 15))
        }
        val title = TextView(this).apply {
            text = "LiveSync Companion"
            textSize = 26f
            setTextColor(Color.WHITE)
            gravity = Gravity.CENTER
        }
        val message = TextView(this).apply {
            text = "Choose your Obsidian vault to start synchronization.\n\nAccess stays on this device and can be changed later."
            textSize = 15f
            setTextColor(Color.rgb(210, 210, 210))
            gravity = Gravity.CENTER
            setPadding(0, 18, 0, 26)
        }
        val button = Button(this).apply {
            text = "Choose vault folder"
            textSize = 16f
            isAllCaps = false
            setTextColor(Color.WHITE)
            isClickable = true
            background = GradientDrawable().apply { setColor(Color.rgb(38, 38, 38)); setStroke(1, Color.rgb(140, 140, 140)); cornerRadius = 18f }
            setOnClickListener { pendingPickerCallback = null; pickVault.launch(null) }
        }
        screen.addView(title, LinearLayout.LayoutParams(-1, -2))
        screen.addView(message, LinearLayout.LayoutParams(-1, -2))
        screen.addView(button, LinearLayout.LayoutParams(-1, 58))
        setContentView(screen)
    }

    private fun showLiveSyncScreen() {
        webView = WebView(this).apply {
            settings.javaScriptEnabled = true
            settings.domStorageEnabled = true
            settings.allowFileAccess = true
            settings.allowContentAccess = true
            webViewClient = object : WebViewClient() {
                override fun onPageFinished(view: WebView?, url: String?) { super.onPageFinished(view, url); evaluateJavascript(NATIVE_FS_POLYFILL + DARK_THEME_CSS, null) }
            }
            addJavascriptInterface(AndroidFsBridge(), "AndroidBridge")
            setBackgroundColor(0xFF111111.toInt())
        }
        val container = FrameLayout(this)
        container.addView(webView, FrameLayout.LayoutParams(-1, -1))
        setContentView(container)
        webView.loadUrl("file:///android_asset/livesync-webapp/webapp.html")
    }

    private fun startSyncService() { ContextCompat.startForegroundService(this, Intent(this, SyncForegroundService::class.java)) }
    private fun root(): DocumentFile? = prefs.getString("vault_uri", null)?.let { DocumentFile.fromTreeUri(this, Uri.parse(it)) }
    private fun fileAt(path: String, create: Boolean = false, directory: Boolean = false): DocumentFile? {
        var current = root() ?: return null
        val parts = path.trim('/').split('/').filter { it.isNotEmpty() }
        for (part in parts) {
            var next = current.findFile(part)
            if (next == null && create) next = if (directory) current.createDirectory(part) else current.createFile("application/octet-stream", part)
            current = next ?: return null
        }
        return current
    }
    private fun parentAt(path: String, create: Boolean): Pair<DocumentFile, String>? {
        val parts = path.trim('/').split('/').filter { it.isNotEmpty() }
        if (parts.isEmpty()) return null
        val name = parts.last(); var current = root() ?: return null
        for (part in parts.dropLast(1)) { var next = current.findFile(part); if (next == null && create) next = current.createDirectory(part); current = next ?: return null }
        return current to name
    }
    private fun list(path: String): JSONArray { val result = JSONArray(); val directory = if (path.trim('/').isEmpty()) root() else fileAt(path, false, true); directory?.listFiles()?.forEach { child -> result.put(JSONObject().apply { put("name", child.name ?: ""); put("kind", if (child.isDirectory) "directory" else "file"); put("path", if (path.trim('/').isEmpty()) child.name ?: "" else "${path.trim('/')}/${child.name}") }) }; return result }
    private fun bytesToBase64(bytes: ByteArray): String = Base64.encodeToString(bytes, Base64.NO_WRAP)
    private fun base64ToBytes(value: String): ByteArray = Base64.decode(value, Base64.DEFAULT)

    inner class AndroidFsBridge {
        @JavascriptInterface fun pickVault(callbackId: String) { pendingPickerCallback = callbackId; pickVault.launch(null) }
        @JavascriptInterface fun hasVault(): Boolean = root() != null
        @JavascriptInterface fun rootName(): String = root()?.name ?: "Vault"
        @JavascriptInterface fun list(path: String): String = list(path).toString()
        @JavascriptInterface fun stat(path: String): String { val file = fileAt(path) ?: return "{}"; return JSONObject().apply { put("size", file.length()); put("mtime", file.lastModified()); put("ctime", file.lastModified()); put("kind", if (file.isDirectory) "directory" else "file") }.toString() }
        @JavascriptInterface fun read(path: String): String { val file = fileAt(path) ?: throw FileNotFoundException(path); return contentResolver.openInputStream(file.uri)?.use { bytesToBase64(it.readBytes()) } ?: "" }
        @JavascriptInterface fun write(path: String, data: String): Boolean { val pair = parentAt(path, true) ?: return false; val file = pair.first.findFile(pair.second) ?: pair.first.createFile("application/octet-stream", pair.second) ?: return false; contentResolver.openOutputStream(file.uri, "wt")?.use { it.write(base64ToBytes(data)) } ?: return false; return true }
        @JavascriptInterface fun mkdir(path: String): Boolean = fileAt(path, true, true) != null
        @JavascriptInterface fun delete(path: String): Boolean = fileAt(path)?.delete() == true
        @JavascriptInterface fun rename(path: String, newPath: String): Boolean { val source = fileAt(path) ?: return false; val pair = parentAt(newPath, true) ?: return false; if (source.parentFile?.uri == pair.first.uri) return source.renameTo(pair.second); if (!source.isFile) return false; val data = read(path); if (!write(newPath, data)) return false; return source.delete() }
    }

    private val NATIVE_FS_POLYFILL = """
        (() => {
          const b64 = (s) => { const raw = atob(s || ''); const out = new Uint8Array(raw.length); for (let i=0;i<raw.length;i++) out[i]=raw.charCodeAt(i); return out; };
          const toB64 = async (value) => { const buf = value instanceof ArrayBuffer ? value : await value.arrayBuffer(); let bin=''; const bytes=new Uint8Array(buf); for (let i=0;i<bytes.length;i++) bin += String.fromCharCode(bytes[i]); return btoa(bin); };
          class NativeFileHandle { constructor(path,name){this.path=path;this.name=name;this.kind='file';} async queryPermission(){return 'granted';} async requestPermission(){return 'granted';} async getFile(){const st=JSON.parse(AndroidBridge.stat(this.path));return new File([b64(AndroidBridge.read(this.path))],this.name,{lastModified:Number(st.mtime)||Date.now()});} async createWritable(){const self=this;return {write:async(data)=>AndroidBridge.write(self.path,await toB64(data)),close:async()=>{}};} }
          class NativeDirectoryHandle { constructor(path,name){this.path=path;this.name=name;this.kind='directory';} async queryPermission(){return 'granted';} async requestPermission(){return 'granted';} async getDirectoryHandle(name,options={}){const path=this.path?this.path+'/'+name:name;if(options.create)AndroidBridge.mkdir(path);return new NativeDirectoryHandle(path,name);} async getFileHandle(name,options={}){const path=this.path?this.path+'/'+name:name;if(options.create&&JSON.parse(AndroidBridge.stat(path)).size===undefined)AndroidBridge.write(path,'');return new NativeFileHandle(path,name);} async removeEntry(name){AndroidBridge.delete(this.path?this.path+'/'+name:name);} async *entries(){for(const item of JSON.parse(AndroidBridge.list(this.path))){yield [item.name,item.kind==='directory'?new NativeDirectoryHandle(item.path,item.name):new NativeFileHandle(item.path,item.name)];}} }
          window.__nativePickerCallbacks={}; window.__nativeVaultPicked=(id,ok)=>{const cb=window.__nativePickerCallbacks[id];delete window.__nativePickerCallbacks[id];if(ok)cb(new NativeDirectoryHandle('',AndroidBridge.rootName()));else cb(null);};
          window.getNativeVaultHandle=async()=>AndroidBridge.hasVault()?new NativeDirectoryHandle('',AndroidBridge.rootName()):null;
          window.showDirectoryPicker=async()=>new Promise(resolve=>{const id=String(Date.now())+String(Math.random());window.__nativePickerCallbacks[id]=resolve;AndroidBridge.pickVault(id);});
        })();
    """

    private val DARK_THEME_CSS = """
        (() => { const s=document.createElement('style'); s.textContent=`
          :root{--background-primary:#111111!important;--background-primary-alt:#1b1b1b!important;--background-secondary:#171717!important;--background-secondary-alt:#202020!important;--background-modifier-border:#363636!important;--text-normal:#f2f2f2!important;--text-warning:#ffffff!important;--text-accent:#ffffff!important;--text-on-accent:#000000!important}
          body{background:#0b0b0b!important;color:#f2f2f2!important;font-family:system-ui,sans-serif!important}
          .container,.vault-selector,.p2p-control,.info-section{background:#151515!important;color:#f2f2f2!important;border-color:#333!important;box-shadow:none!important}
          h1,h2,.vault-selector h2,.vault-item-name{color:#ffffff!important}.subtitle,.vault-selector p,.empty-note,.vault-item-meta,.info-section{color:#bdbdbd!important}
          .vault-item{background:#1d1d1d!important;border-color:#3b3b3b!important}.info{background:#202020!important;color:#eeeeee!important;border-color:#444!important}
          button{background:#eeeeee!important;color:#111111!important;border:1px solid #ffffff!important}button:hover{background:#ffffff!important}
        `;document.head.appendChild(s) })();
    """
}
