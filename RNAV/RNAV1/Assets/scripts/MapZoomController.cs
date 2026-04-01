using UnityEngine;

public class MapZoomController : MonoBehaviour
{
    public float zoomSpeed = 0.005f;
    public float minZoom = 5f;
    public float maxZoom = 60f;

    private Camera cam;

    void Start()
    {
        cam = Camera.main;
    }

    void Update()
    {
        if (Input.touchCount == 2)
        {
            Touch t1 = Input.GetTouch(0);
            Touch t2 = Input.GetTouch(1);

            Vector2 prevPos1 = t1.position - t1.deltaPosition;
            Vector2 prevPos2 = t2.position - t2.deltaPosition;

            float prevMagnitude = (prevPos1 - prevPos2).magnitude;
            float currentMagnitude = (t1.position - t2.position).magnitude;

            float difference = currentMagnitude - prevMagnitude;

            // Midpoint between fingers
            Vector2 midPoint = (t1.position + t2.position) / 2f;

            ZoomTowardPoint(midPoint, difference * zoomSpeed);
        }
    }

    void ZoomTowardPoint(Vector2 screenPoint, float zoomAmount)
    {
        Vector3 beforeZoom = cam.ScreenToWorldPoint(
            new Vector3(screenPoint.x, screenPoint.y, cam.nearClipPlane)
        );

        cam.orthographicSize -= zoomAmount;
        cam.orthographicSize = Mathf.Clamp(cam.orthographicSize, minZoom, maxZoom);

        Vector3 afterZoom = cam.ScreenToWorldPoint(
            new Vector3(screenPoint.x, screenPoint.y, cam.nearClipPlane)
        );

        Vector3 difference = beforeZoom - afterZoom;

        cam.transform.position += difference;
    }
}
