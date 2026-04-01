using UnityEngine;

public class IMUStepMovement : MonoBehaviour
{
    [Header("Step Settings")]
    public float stepDistance = 0.05f;
    public float stepThreshold = 0.05f;
    public float stepCooldown = 0.35f;

    [Header("Floor References")]
    public GameObject floor0;
    public GameObject floor1;

    [Header("Transition Settings")]
    public float transitionRadius = 0.7f;

    private float lastStepTime = 0f;

    void Start()
    {
        Input.compass.enabled = true;
        Input.gyro.enabled = true;
    }

    void Update()
    {
        DetectStep();
    }

    void DetectStep()
    {
        Vector3 acc = Input.acceleration;
        float magnitude = acc.magnitude - 1f;

        if (magnitude > stepThreshold && Time.time - lastStepTime > stepCooldown)
        {
            lastStepTime = Time.time;

            MoveInDirection();
            CheckForFloorTransition();
        }
    }

    void MoveInDirection()
    {
        float heading = Input.compass.trueHeading;
        float rad = heading * Mathf.Deg2Rad;

        Vector3 direction = new Vector3(Mathf.Sin(rad), Mathf.Cos(rad), 0);

        transform.position += direction * stepDistance;
    }

    void CheckForFloorTransition()
    {
        NavNode[] nodes = FindObjectsOfType<NavNode>();

        foreach (NavNode node in nodes)
        {
            if (!node.isFloorTransitionNode) continue;

            float distance = Vector2.Distance(
                transform.position,
                node.transform.position
            );

            if (distance < transitionRadius)
            {
                SwitchFloor(node.transitionToFloor);
                break;
            }
        }
    }

    void SwitchFloor(int targetFloor)
    {
        // Activate correct floor
        if (targetFloor == 0)
        {
            floor0.SetActive(true);
            floor1.SetActive(false);
        }
        else if (targetFloor == 1)
        {
            floor0.SetActive(false);
            floor1.SetActive(true);
        }

        // Find nearest transition node on new floor
        NavNode[] nodes = FindObjectsOfType<NavNode>();
        NavNode closest = null;
        float minDistance = Mathf.Infinity;

        foreach (NavNode node in nodes)
        {
            if (!node.isFloorTransitionNode) continue;
            if (node.floorNumber != targetFloor) continue;

            float dist = Vector2.Distance(
                transform.position,
                node.transform.position
            );

            if (dist < minDistance)
            {
                minDistance = dist;
                closest = node;
            }
        }

        if (closest != null)
        {
            transform.position = closest.transform.position;
        }

        Debug.Log("Switched to floor: " + targetFloor);
    }
}
