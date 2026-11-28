package com.oem.dualshoot

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.hardware.camera2.CameraCharacteristics
import android.hardware.camera2.CameraManager
import android.hardware.camera2.params.StreamConfigurationMap
import android.media.MediaRecorder
import android.util.Base64
import android.util.Range
import android.util.Size
import androidx.camera.camera2.interop.Camera2CameraInfo
import androidx.camera.camera2.interop.ExperimentalCamera2Interop
import androidx.camera.core.Camera
import androidx.camera.core.CameraSelector
import androidx.camera.core.ConcurrentCamera
import androidx.camera.core.FocusMeteringAction
import androidx.camera.core.ImageCapture
import androidx.camera.core.ImageCaptureException
import androidx.camera.core.Preview
import androidx.camera.core.SurfaceOrientedMeteringPointFactory
import androidx.camera.core.UseCaseGroup
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.video.FallbackStrategy
import androidx.camera.video.FileOutputOptions
import androidx.camera.video.Quality
import androidx.camera.video.QualitySelector
import androidx.camera.video.Recorder
import androidx.camera.video.Recording
import androidx.camera.video.VideoCapture
import androidx.camera.video.VideoRecordEvent
import androidx.core.content.ContextCompat
import com.getcapacitor.JSObject
import com.getcapacitor.PermissionState
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import com.getcapacitor.annotation.Permission
import com.getcapacitor.annotation.PermissionCallback
import java.io.File
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit

@CapacitorPlugin(
    name = "DualCameraNative",
    permissions = [
        Permission(strings = [Manifest.permission.CAMERA], alias = "camera"),
        Permission(strings = [Manifest.permission.RECORD_AUDIO], alias = "audio")
    ]
)
class DualCameraNativePlugin : Plugin() {

    private var cameraProvider: ProcessCameraProvider? = null
    private var primaryCamera: Camera? = null
    private var secondaryCamera: Camera? = null

    private var primaryImageCapture: ImageCapture? = null
    private var secondaryImageCapture: ImageCapture? = null

    private var primaryVideoCapture: VideoCapture<Recorder>? = null
    private var secondaryVideoCapture: VideoCapture<Recorder>? = null

    private var activeRecordingPrimary: Recording? = null
    private var activeRecordingSecondary: Recording? = null
    private var recordingStartTimeMs: Long = 0L
    private var currentRecordingPortraitFile: File? = null
    private var currentRecordingLandscapeFile: File? = null

    private var currentLensMode: String = "single"
    private var currentFacingMode: String = "environment"
    private var currentVideoQuality: String = "1080p"
    private var currentAudioEnabled: Boolean = true
    private var currentStabilizationEnabled: Boolean = true
    private var currentAutoMaxQuality: Boolean = true
    private var detectedMaxWidth: Int = 1920
    private var detectedMaxHeight: Int = 1080
    private var detectedMaxFps: Int = 60
    private var detectedBitrateBps: Int = 20_000_000

    private val cameraExecutor: ExecutorService = Executors.newSingleThreadExecutor()

    @PluginMethod
    fun initializeDualCamera(call: PluginCall) {
        if (!hasRequiredPermissions()) {
            requestAllPermissions(call, "cameraPermissionsCallback")
            return
        }

        currentLensMode = call.getString("lensMode", "single") ?: "single"
        currentFacingMode = call.getString("facingMode", "environment") ?: "environment"
        currentVideoQuality = call.getString("videoQuality", "1080p") ?: "1080p"
        currentAudioEnabled = call.getBoolean("audioEnabled", true) ?: true
        currentStabilizationEnabled = call.getBoolean("digitalStabilization", true) ?: true
        currentAutoMaxQuality = call.getBoolean("autoMaxQuality", true) ?: true

        bindCameraUseCases(call)
    }

    @PermissionCallback
    private fun cameraPermissionsCallback(call: PluginCall) {
        if (getPermissionState("camera") == PermissionState.GRANTED) {
            bindCameraUseCases(call)
        } else {
            call.reject("Camera permission is required for dual-aspect capture.")
        }
    }

    @PluginMethod
    fun switchLensMode(call: PluginCall) {
        currentLensMode = call.getString("lensMode", "single") ?: "single"
        currentFacingMode = call.getString("facingMode", "environment") ?: "environment"
        bindCameraUseCases(call, respondAsSwitch = true)
    }

    @PluginMethod
    fun setCameraControls(call: PluginCall) {
        val zoom = call.getDouble("zoom", 1.0)?.toFloat() ?: 1.0f
        val exposure = call.getDouble("exposure", 0.0)?.toFloat() ?: 0.0f
        val flashMode = call.getString("flashMode", "off") ?: "off"
        currentStabilizationEnabled = call.getBoolean("digitalStabilization", true) ?: true

        activity.runOnUiThread {
            primaryCamera?.cameraControl?.let { control ->
                val zoomState = primaryCamera?.cameraInfo?.zoomState?.value
                val minZoom = zoomState?.minZoomRatio ?: 1.0f
                val maxZoom = zoomState?.maxZoomRatio ?: 5.0f
                control.setZoomRatio(zoom.coerceIn(minZoom, maxZoom))

                val exposureState = primaryCamera?.cameraInfo?.exposureState
                if (exposureState != null && exposureState.isExposureCompensationSupported) {
                    val step = exposureState.exposureCompensationStep.toFloat()
                    val index = if (step > 0f) (exposure / step).toInt() else 0
                    val range: Range<Int> = exposureState.exposureCompensationRange
                    control.setExposureCompensationIndex(index.coerceIn(range.lower, range.upper))
                }

                if (primaryCamera?.cameraInfo?.hasFlashUnit() == true) {
                    control.enableTorch(flashMode == "on")
                }
            }

            primaryImageCapture?.flashMode = when (flashMode) {
                "on" -> ImageCapture.FLASH_MODE_ON
                "auto" -> ImageCapture.FLASH_MODE_AUTO
                else -> ImageCapture.FLASH_MODE_OFF
            }

            call.resolve()
        }
    }

    @PluginMethod
    fun tapToFocus(call: PluginCall) {
        val x = call.getDouble("x", 0.5)?.toFloat() ?: 0.5f
        val y = call.getDouble("y", 0.5)?.toFloat() ?: 0.5f

        activity.runOnUiThread {
            val camera = primaryCamera
            if (camera == null) {
                call.resolve()
                return@runOnUiThread
            }
            val factory = SurfaceOrientedMeteringPointFactory(1.0f, 1.0f)
            val point = factory.createPoint(x.coerceIn(0f, 1f), y.coerceIn(0f, 1f))
            val action = FocusMeteringAction.Builder(point, FocusMeteringAction.FLAG_AF or FocusMeteringAction.FLAG_AE)
                .setAutoCancelDuration(3, TimeUnit.SECONDS)
                .build()
            camera.cameraControl.startFocusAndMetering(action)
            call.resolve()
        }
    }

    @PluginMethod
    fun captureDualPhoto(call: PluginCall) {
        val primaryCapture = primaryImageCapture
        if (primaryCapture == null) {
            call.reject("Primary ImageCapture is not initialized.")
            return
        }

        val flashMode = call.getString("flashMode", "off") ?: "off"
        primaryCapture.flashMode = when (flashMode) {
            "on" -> ImageCapture.FLASH_MODE_ON
            "auto" -> ImageCapture.FLASH_MODE_AUTO
            else -> ImageCapture.FLASH_MODE_OFF
        }

        val cacheDir = context.cacheDir
        val ts = System.currentTimeMillis()
        val portraitFile = File(cacheDir, "dual_portrait_$ts.jpg")
        val landscapeFile = File(cacheDir, "dual_landscape_$ts.jpg")

        val primaryOutput = ImageCapture.OutputFileOptions.Builder(portraitFile).build()
        primaryCapture.takePicture(
            primaryOutput,
            cameraExecutor,
            object : ImageCapture.OnImageSavedCallback {
                override fun onImageSaved(outputFileResults: ImageCapture.OutputFileResults) {
                    val secondaryCapture = secondaryImageCapture
                    if (currentLensMode == "dual" && secondaryCapture != null) {
                        val secondaryOutput = ImageCapture.OutputFileOptions.Builder(landscapeFile).build()
                        secondaryCapture.takePicture(
                            secondaryOutput,
                            cameraExecutor,
                            object : ImageCapture.OnImageSavedCallback {
                                override fun onImageSaved(secondaryResults: ImageCapture.OutputFileResults) {
                                    resolveDualPhotoResult(call, portraitFile, landscapeFile)
                                }

                                override fun onError(exception: ImageCaptureException) {
                                    createLandscapeCropFromPortrait(portraitFile, landscapeFile)
                                    resolveDualPhotoResult(call, portraitFile, landscapeFile)
                                }
                            }
                        )
                    } else {
                        createLandscapeCropFromPortrait(portraitFile, landscapeFile)
                        resolveDualPhotoResult(call, portraitFile, landscapeFile)
                    }
                }

                override fun onError(exception: ImageCaptureException) {
                    call.reject("Failed to capture dual photo: ${exception.message}", exception)
                }
            }
        )
    }

    @PluginMethod
    fun startDualRecording(call: PluginCall) {
        val primaryVideo = primaryVideoCapture
        if (primaryVideo == null) {
            call.reject("VideoCapture is not initialized.")
            return
        }

        val audioEnabled = call.getBoolean("audioEnabled", currentAudioEnabled) ?: true
        val cacheDir = context.cacheDir
        val ts = System.currentTimeMillis()
        val portraitFile = File(cacheDir, "dual_video_9_16_$ts.mp4")
        val landscapeFile = File(cacheDir, "dual_video_16_9_$ts.mp4")

        currentRecordingPortraitFile = portraitFile
        currentRecordingLandscapeFile = landscapeFile
        recordingStartTimeMs = System.currentTimeMillis()

        val hasAudioPerm = ContextCompat.checkSelfPermission(
            context,
            Manifest.permission.RECORD_AUDIO
        ) == PackageManager.PERMISSION_GRANTED

        var primaryPending = primaryVideo.output.prepareRecording(
            context,
            FileOutputOptions.Builder(portraitFile).build()
        )
        if (audioEnabled && hasAudioPerm) {
            primaryPending = primaryPending.withAudioEnabled()
        }

        activeRecordingPrimary = primaryPending.start(ContextCompat.getMainExecutor(context)) { event ->
            if (event is VideoRecordEvent.Finalize && event.hasError()) {
                activeRecordingPrimary = null
            }
        }

        val secondaryVideo = secondaryVideoCapture
        if (currentLensMode == "dual" && secondaryVideo != null) {
            val secondaryPending = secondaryVideo.output.prepareRecording(
                context,
                FileOutputOptions.Builder(landscapeFile).build()
            )
            activeRecordingSecondary = secondaryPending.start(ContextCompat.getMainExecutor(context)) { event ->
                if (event is VideoRecordEvent.Finalize && event.hasError()) {
                    activeRecordingSecondary = null
                }
            }
        }

        val res = JSObject()
        res.put("started", true)
        call.resolve(res)
    }

    @PluginMethod
    fun stopDualRecording(call: PluginCall) {
        val portraitFile = currentRecordingPortraitFile
        val landscapeFile = currentRecordingLandscapeFile
        val durationSec = ((System.currentTimeMillis() - recordingStartTimeMs) / 1000L).coerceAtLeast(1L)

        activeRecordingPrimary?.stop()
        activeRecordingPrimary = null

        activeRecordingSecondary?.stop()
        activeRecordingSecondary = null

        if (portraitFile == null) {
            call.reject("No active recording found.")
            return
        }

        val resolvedLandscape = if (landscapeFile != null && landscapeFile.exists() && landscapeFile.length() > 0L) {
            landscapeFile
        } else {
            portraitFile
        }

        val res = JSObject()
        res.put("portraitPath", portraitFile.absolutePath)
        res.put("landscapePath", resolvedLandscape.absolutePath)
        res.put("duration", durationSec)
        res.put("portraitSize", portraitFile.length())
        res.put("landscapeSize", resolvedLandscape.length())
        call.resolve(res)
    }

    @PluginMethod
    fun stopDualCamera(call: PluginCall) {
        activity.runOnUiThread {
            activeRecordingPrimary?.stop()
            activeRecordingSecondary?.stop()
            cameraProvider?.unbindAll()
            primaryCamera = null
            secondaryCamera = null
            call.resolve()
        }
    }

    @androidx.annotation.OptIn(ExperimentalCamera2Interop::class)
    private fun queryHardwareMaxCapabilities(lensFacing: Int) {
        try {
            val cameraManager = context.getSystemService(Context.CAMERA_SERVICE) as CameraManager
            val targetFacing = if (lensFacing == CameraSelector.LENS_FACING_FRONT) {
                CameraCharacteristics.LENS_FACING_FRONT
            } else {
                CameraCharacteristics.LENS_FACING_BACK
            }

            for (cameraId in cameraManager.cameraIdList) {
                val chars = cameraManager.getCameraCharacteristics(cameraId)
                if (chars.get(CameraCharacteristics.LENS_FACING) == targetFacing) {
                    val map: StreamConfigurationMap? = chars.get(CameraCharacteristics.SCALER_STREAM_CONFIGURATION_MAP)
                    val videoSizes: Array<Size>? = map?.getOutputSizes(MediaRecorder::class.java)
                    val maxVideo = videoSizes?.maxByOrNull { it.width * it.height }
                    if (maxVideo != null) {
                        detectedMaxWidth = maxVideo.width.coerceAtMost(3840)
                        detectedMaxHeight = maxVideo.height.coerceAtMost(2160)
                    }

                    val fpsRanges = chars.get(CameraCharacteristics.CONTROL_AE_AVAILABLE_TARGET_FPS_RANGES)
                    val supports60 = fpsRanges?.any { it.upper >= 60 } == true
                    detectedMaxFps = if (supports60) 60 else 30
                    detectedBitrateBps = when {
                        detectedMaxWidth >= 3840 -> 24_000_000
                        detectedMaxFps >= 60 -> 20_000_000
                        else -> 16_000_000
                    }
                    break
                }
            }
        } catch (_: Exception) {
            detectedMaxWidth = 1920
            detectedMaxHeight = 1080
            detectedMaxFps = 30
            detectedBitrateBps = 16_000_000
        }
    }

    private fun bindCameraUseCases(call: PluginCall, respondAsSwitch: Boolean = false) {
        val providerFuture = ProcessCameraProvider.getInstance(context)
        providerFuture.addListener({
            try {
                val provider = providerFuture.get()
                cameraProvider = provider
                provider.unbindAll()

                val primaryLensFacing = if (currentFacingMode == "user") {
                    CameraSelector.LENS_FACING_FRONT
                } else {
                    CameraSelector.LENS_FACING_BACK
                }
                val secondaryLensFacing = if (primaryLensFacing == CameraSelector.LENS_FACING_BACK) {
                    CameraSelector.LENS_FACING_FRONT
                } else {
                    CameraSelector.LENS_FACING_BACK
                }

                queryHardwareMaxCapabilities(primaryLensFacing)

                val qualitySelector = if (currentAutoMaxQuality) {
                    QualitySelector.fromOrderedList(
                        listOf(Quality.HIGHEST, Quality.UHD, Quality.FHD, Quality.HD),
                        FallbackStrategy.higherQualityOrLowerThan(Quality.FHD)
                    )
                } else {
                    val requested = when (currentVideoQuality) {
                        "4K" -> Quality.UHD
                        "720p" -> Quality.HD
                        else -> Quality.FHD
                    }
                    QualitySelector.from(requested, FallbackStrategy.lowerQualityOrHigherThan(Quality.FHD))
                }

                val primaryPreview = Preview.Builder().build()
                val primaryImgCap = ImageCapture.Builder()
                    .setCaptureMode(ImageCapture.CAPTURE_MODE_MAXIMIZE_QUALITY)
                    .setJpegQuality(95)
                    .build()

                val primaryRec = Recorder.Builder()
                    .setQualitySelector(qualitySelector)
                    .setTargetVideoEncodingBitRate(detectedBitrateBps)
                    .build()

                val primaryVidCap = VideoCapture.Builder(primaryRec)
                    .setVideoStabilizationEnabled(currentStabilizationEnabled)
                    .setTargetFrameRate(Range(30, detectedMaxFps))
                    .build()

                primaryImageCapture = primaryImgCap
                primaryVideoCapture = primaryVidCap

                var concurrentBound = false

                // Attempt AndroidX CameraX ConcurrentCamera (simultaneous Front + Rear hardware streams)
                if (currentLensMode == "dual") {
                    val concurrentInfos = provider.availableConcurrentCameraInfos
                    val matchingPair = concurrentInfos.firstOrNull { pair ->
                        val hasPrimary = pair.any { it.lensFacing == primaryLensFacing }
                        val hasSecondary = pair.any { it.lensFacing == secondaryLensFacing }
                        hasPrimary && hasSecondary
                    }

                    if (matchingPair != null) {
                        // Step secondary stream gracefully to FHD/HD to fit hardware ISP bandwidth during concurrent streaming
                        val concurrentSelector = QualitySelector.fromOrderedList(
                            listOf(Quality.FHD, Quality.HD, Quality.SD),
                            FallbackStrategy.lowerQualityOrHigherThan(Quality.HD)
                        )
                        val secondaryPreview = Preview.Builder().build()
                        val secondaryImgCap = ImageCapture.Builder()
                            .setCaptureMode(ImageCapture.CAPTURE_MODE_MAXIMIZE_QUALITY)
                            .setJpegQuality(95)
                            .build()
                        val secondaryRec = Recorder.Builder()
                            .setQualitySelector(concurrentSelector)
                            .setTargetVideoEncodingBitRate(16_000_000)
                            .build()
                        val secondaryVidCap = VideoCapture.Builder(secondaryRec)
                            .setVideoStabilizationEnabled(currentStabilizationEnabled)
                            .build()

                        secondaryImageCapture = secondaryImgCap
                        secondaryVideoCapture = secondaryVidCap

                        val primaryGroup = UseCaseGroup.Builder()
                            .addUseCase(primaryPreview)
                            .addUseCase(primaryImgCap)
                            .addUseCase(primaryVidCap)
                            .build()

                        val secondaryGroup = UseCaseGroup.Builder()
                            .addUseCase(secondaryPreview)
                            .addUseCase(secondaryImgCap)
                            .addUseCase(secondaryVidCap)
                            .build()

                        val primaryConfig = ConcurrentCamera.SingleCameraConfig(
                            CameraSelector.Builder().requireLensFacing(primaryLensFacing).build(),
                            primaryGroup,
                            activity
                        )
                        val secondaryConfig = ConcurrentCamera.SingleCameraConfig(
                            CameraSelector.Builder().requireLensFacing(secondaryLensFacing).build(),
                            secondaryGroup,
                            activity
                        )

                        val concurrentCamera = provider.bindToLifecycle(
                            listOf(primaryConfig, secondaryConfig)
                        )
                        if (concurrentCamera.cameras.size >= 2) {
                            primaryCamera = concurrentCamera.cameras[0]
                            secondaryCamera = concurrentCamera.cameras[1]
                            concurrentBound = true
                        }
                    }
                }

                if (!concurrentBound) {
                    val selector = CameraSelector.Builder()
                        .requireLensFacing(primaryLensFacing)
                        .build()
                    primaryCamera = provider.bindToLifecycle(
                        activity,
                        selector,
                        primaryPreview,
                        primaryImgCap,
                        primaryVidCap
                    )
                    secondaryCamera = null
                    secondaryImageCapture = null
                    secondaryVideoCapture = null
                }

                val res = JSObject()
                if (respondAsSwitch) {
                    res.put("success", true)
                    res.put("concurrentSupported", concurrentBound)
                } else {
                    res.put("initialized", true)
                    res.put("concurrentSupported", concurrentBound)
                    res.put("sequentialFallbackActive", currentLensMode == "dual" && !concurrentBound)
                    res.put("maxWidth", detectedMaxWidth)
                    res.put("maxHeight", detectedMaxHeight)
                    res.put("activeFps", detectedMaxFps)
                    res.put("bitrateBps", detectedBitrateBps)
                }
                call.resolve(res)
            } catch (e: Exception) {
                call.reject("Failed to bind CameraX ConcurrentCamera: ${e.message}", e)
            }
        }, ContextCompat.getMainExecutor(context))
    }

    private fun createLandscapeCropFromPortrait(portraitFile: File, landscapeFile: File) {
        val src = BitmapFactory.decodeFile(portraitFile.absolutePath) ?: return
        val cropWidth = src.width
        val cropHeight = (cropWidth * 9f / 16f).toInt().coerceAtMost(src.height)
        val topOffset = ((src.height - cropHeight) / 2).coerceAtLeast(0)
        val cropped = Bitmap.createBitmap(src, 0, topOffset, cropWidth, cropHeight)
        landscapeFile.outputStream().use { out ->
            cropped.compress(Bitmap.CompressFormat.JPEG, 95, out)
        }
        cropped.recycle()
        src.recycle()
    }

    private fun resolveDualPhotoResult(call: PluginCall, portraitFile: File, landscapeFile: File) {
        val pBytes = portraitFile.readBytes()
        val lBytes = landscapeFile.readBytes()
        val pDataUrl = "data:image/jpeg;base64," + Base64.encodeToString(pBytes, Base64.NO_WRAP)
        val lDataUrl = "data:image/jpeg;base64," + Base64.encodeToString(lBytes, Base64.NO_WRAP)

        val pOpts = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        BitmapFactory.decodeByteArray(pBytes, 0, pBytes.size, pOpts)

        val lOpts = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        BitmapFactory.decodeByteArray(lBytes, 0, lBytes.size, lOpts)

        val res = JSObject()
        res.put("portraitDataUrl", pDataUrl)
        res.put("landscapeDataUrl", lDataUrl)
        res.put("portraitWidth", pOpts.outWidth)
        res.put("portraitHeight", pOpts.outHeight)
        res.put("landscapeWidth", lOpts.outWidth)
        res.put("landscapeHeight", lOpts.outHeight)
        call.resolve(res)

        portraitFile.delete()
        landscapeFile.delete()
    }

    override fun handleOnDestroy() {
        super.handleOnDestroy()
        cameraExecutor.shutdown()
    }
}
