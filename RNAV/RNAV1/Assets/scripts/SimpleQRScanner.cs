using UnityEngine;
using UnityEngine.UI;
using ZXing;
using System.Collections;

public class SimpleQRScanner : MonoBehaviour
{
    [Header("References")]
    public UIManager uiManager;
    public RawImage cameraPreview;

    private WebCamTexture camTexture;
    private bool isScanning = false;
    private BarcodeReader barcodeReader;

    void Start()
    {
        barcodeReader = new BarcodeReader();
    }

    public void StartScan()
    {
        if (!isScanning)
            StartCoroutine(StartCameraAndScan());
    }

    IEnumerator StartCameraAndScan()
    {
#if UNITY_ANDROID
        if (!Application.HasUserAuthorization(UserAuthorization.WebCam))
        {
            yield return Application.RequestUserAuthorization(UserAuthorization.WebCam);
        }

        if (!Application.HasUserAuthorization(UserAuthorization.WebCam))
        {
            Debug.LogError("Camera permission denied.");
            yield break;
        }
#endif

        WebCamDevice[] devices = WebCamTexture.devices;

        if (devices.Length == 0)
        {
            Debug.LogError("No camera found.");
            yield break;
        }

        string backCameraName = null;

        for (int i = 0; i < devices.Length; i++)
        {
            Debug.Log("Camera found: " + devices[i].name + " FrontFacing: " + devices[i].isFrontFacing);

            if (!devices[i].isFrontFacing)
            {
                backCameraName = devices[i].name;
                break;
            }
        }

        if (string.IsNullOrEmpty(backCameraName))
        {
            backCameraName = devices[0].name;
        }

        camTexture = new WebCamTexture(backCameraName, 1280, 720);
        camTexture.Play();

        float timeout = 5f;
        while (camTexture.width < 100 && timeout > 0f)
        {
            timeout -= Time.deltaTime;
            yield return null;
        }

        if (camTexture.width < 100)
        {
            Debug.LogError("Camera failed to start properly.");
            yield break;
        }

        if (cameraPreview != null)
        {
            cameraPreview.texture = camTexture;
            cameraPreview.material.mainTexture = camTexture;
        }

        isScanning = true;
        Debug.Log("QR scanning started using camera: " + backCameraName);
    }

    void Update()
    {
        if (!isScanning || camTexture == null || !camTexture.isPlaying)
            return;

        try
        {
            Color32[] pixels = camTexture.GetPixels32();

            if (pixels == null || pixels.Length == 0)
                return;

            var result = barcodeReader.Decode(pixels, camTexture.width, camTexture.height);

            if (result != null)
            {
                string scannedText = result.Text.Trim();
                Debug.Log("QR detected: " + scannedText);

                if (uiManager != null)
                {
                    uiManager.SetScannedDestination(scannedText);
                }
                else
                {
                    Debug.LogError("UIManager is not assigned.");
                }

                StopScan();
            }
        }
        catch (System.Exception e)
        {
            Debug.LogError("QR scan error: " + e.Message);
        }
    }

    public void StopScan()
    {
        isScanning = false;

        if (camTexture != null)
        {
            if (camTexture.isPlaying)
                camTexture.Stop();

            camTexture = null;
        }

        Debug.Log("QR scanning stopped.");
    }

    void OnDisable()
    {
        StopScan();
    }
}