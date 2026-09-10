package live.teamtime.app

import android.content.ContentValues
import android.media.MediaScannerConnection
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.os.ParcelFileDescriptor
import android.provider.MediaStore
import android.provider.OpenableColumns
import android.util.Log
import io.flutter.embedding.android.FlutterActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodChannel
import java.io.File
import java.io.FileOutputStream

class MainActivity : FlutterActivity() {
    private val logger = "TeamTimeDownloads"

    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)
        MethodChannel(flutterEngine.dartExecutor.binaryMessenger, "teamtime/downloads")
            .setMethodCallHandler { call, result ->
                when (call.method) {
                    "saveFile" -> {
                        val bytes = call.argument<ByteArray>("bytes")
                        val fileName = call.argument<String>("fileName")
                        val mimeType = call.argument<String>("mimeType")
                        if (bytes == null || fileName.isNullOrEmpty()) {
                            result.error("invalid_args", "bytes and fileName are required", null)
                            return@setMethodCallHandler
                        }
                        try {
                            result.success(
                                saveFile(bytes, fileName, mimeType ?: "application/octet-stream")
                            )
                        } catch (e: SecurityException) {
                            Log.w(logger, "saveFile denied", e)
                            result.error("permission_required", e.message, null)
                        } catch (e: Exception) {
                            Log.e(logger, "saveFile failed", e)
                            result.error("save_failed", e.message, null)
                        }
                    }
                    else -> result.notImplemented()
                }
            }
    }

    private fun saveFile(bytes: ByteArray, fileName: String, mimeType: String): Map<String, String> {
        val safeName = fileName.replace(Regex("[\\\\/:*?\"<>|]"), "_")
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            saveViaMediaStore(bytes, safeName, mimeType)
        } else {
            saveViaLegacyStorage(bytes, safeName)
        }
    }

    /** API 29+: scoped storage requires going through MediaStore.Downloads. */
    private fun saveViaMediaStore(
        bytes: ByteArray,
        fileName: String,
        mimeType: String
    ): Map<String, String> {
        val resolver = applicationContext.contentResolver
        val values = ContentValues().apply {
            put(MediaStore.Downloads.DISPLAY_NAME, fileName)
            put(MediaStore.Downloads.MIME_TYPE, mimeType)
            put(MediaStore.Downloads.IS_PENDING, 1)
        }
        val uri = resolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values)
            ?: throw IllegalStateException("MediaStore refused entry for $fileName")
        resolver.openFileDescriptor(uri, "w")?.use { pfd ->
            ParcelFileDescriptor.AutoCloseOutputStream(pfd).use { it.write(bytes) }
        } ?: throw IllegalStateException("Could not open stream for $fileName")
        values.clear()
        values.put(MediaStore.Downloads.IS_PENDING, 0)
        resolver.update(uri, values, null, null)

        // MediaStore may rename on collision (e.g. "name (1).ext"); read it back.
        var displayName = fileName
        resolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)?.use { c ->
            if (c.moveToFirst()) {
                val idx = c.getColumnIndex(OpenableColumns.DISPLAY_NAME)
                if (idx >= 0 && !c.isNull(idx)) displayName = c.getString(idx)
            }
        }
        val publicPath =
            Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS)
                .resolve(displayName).absolutePath
        return mapOf("uri" to uri.toString(), "path" to publicPath)
    }

    /** API 26-28: direct write to the public Downloads directory. */
    @Suppress("DEPRECATION")
    private fun saveViaLegacyStorage(bytes: ByteArray, fileName: String): Map<String, String> {
        val downloads =
            Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS)
        if (!downloads.exists()) downloads.mkdirs()
        var target = File(downloads, fileName)
        var i = 1
        while (target.exists()) {
            val dot = fileName.lastIndexOf('.')
            val base = if (dot > 0) fileName.substring(0, dot) else fileName
            val ext = if (dot > 0) fileName.substring(dot) else ""
            target = File(downloads, "$base ($i)$ext")
            i++
        }
        FileOutputStream(target).use { it.write(bytes) }
        MediaScannerConnection.scanFile(applicationContext, arrayOf(target.absolutePath), null, null)
        return mapOf("uri" to Uri.fromFile(target).toString(), "path" to target.absolutePath)
    }
}
