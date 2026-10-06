package com.livesync.companion

import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.util.Base64
import android.webkit.JavascriptInterface
import android.webkit.WebView
import android.webkit.WebViewClient
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
            callback?.let { webView.evaluateJavascript("window.__nativeVaultPicked('$it', true)", null) }
            startSyncService()
        } else callback?.let { webView.evaluateJavascript("window.__nativeVaultPicked('$it', false)", null) }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        webView = WebView(this).apply {
            settings.javaScriptEnabled = true
            settings.domStorageEnabled = true
            settings.allowFileAccess = true
            settings.allowContentAccess = true
            webViewClient = object : WebViewClient() {
                override fun onPageFinished(view: WebView?, url: String?) { super.onPageFinished(view, url); evaluateJavascript(NATIVE_FS_POLYFILL, null) }
            }
            addJavascriptInterface(AndroidFsBridge(), "AndroidBridge")
            setBackgroundColor(0xFF111111.toInt())
        }
        setContentView(webView)
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
}
