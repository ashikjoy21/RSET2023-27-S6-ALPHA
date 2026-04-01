using System.Collections.Generic;
using UnityEngine;

public class NavigationController : MonoBehaviour
{
    [Header("References")]
    public NavManager navManager;
    public Pathfinder pathfinder;
    public FloorManager floorManager;

    [Header("Line Renderer")]
    public LineRenderer lineRenderer;
    public float lineWidth = 0.2f;

    [Header("Room Name Navigation (Optional Inspector Test)")]
    public string startRoomName;
    public string destinationRoomName;

    [Header("Path")]
    public List<NavNode> currentPath = new List<NavNode>();

    [Header("User / Walker")]
    public Transform walker;

    [Header("Movement")]
    public bool autoWalk = false;
    public float moveSpeed = 2f;
    public float nodeReachThreshold = 0.4f;

    // Index of next node to reach
    private int walkIndex = 0;

    // Track currently displayed building/floor
    private int currentDisplayBuilding = -1;
    private int currentDisplayFloor = -1;

    void Start()
    {
        if (lineRenderer != null)
        {
            lineRenderer.useWorldSpace = true;
            lineRenderer.startWidth = lineWidth;
            lineRenderer.endWidth = lineWidth;
        }

        // Optional inspector testing only
        if (!string.IsNullOrEmpty(startRoomName) &&
            !string.IsNullOrEmpty(destinationRoomName))
        {
            Navigate(startRoomName, destinationRoomName);
        }
    }

    void Update()
    {
        if (currentPath == null || currentPath.Count == 0) return;
        if (walker == null) return;
        if (walkIndex >= currentPath.Count) return;

        if (autoWalk)
            AutoWalk();
        else
            IMUNavigation();
    }

    // ---------------- IMU MODE ----------------
    void IMUNavigation()
    {
        if (walkIndex >= currentPath.Count) return;

        NavNode targetNode = currentPath[walkIndex];
        float dist = Vector3.Distance(walker.position, targetNode.transform.position);

        if (dist <= nodeReachThreshold)
        {
            OnReachNode(walkIndex);
            walkIndex++;
        }
    }

    // ---------------- AUTO WALK MODE ----------------
    void AutoWalk()
    {
        if (walkIndex >= currentPath.Count) return;

        NavNode targetNode = currentPath[walkIndex];

        // If building changes, snap walker directly
        if (walkIndex > 0)
        {
            NavNode previousNode = currentPath[walkIndex - 1];

            if (previousNode.buildingID != targetNode.buildingID)
            {
                walker.position = targetNode.transform.position;
            }
            else
            {
                walker.position = Vector3.MoveTowards(
                    walker.position,
                    targetNode.transform.position,
                    moveSpeed * Time.deltaTime
                );
            }
        }
        else
        {
            walker.position = Vector3.MoveTowards(
                walker.position,
                targetNode.transform.position,
                moveSpeed * Time.deltaTime
            );
        }

        if (Vector3.Distance(walker.position, targetNode.transform.position) <= nodeReachThreshold)
        {
            OnReachNode(walkIndex);
            walkIndex++;
        }
    }

    // ---------------- NODE REACHED LOGIC ----------------
    void OnReachNode(int reachedIndex)
    {
        if (reachedIndex < 0 || reachedIndex >= currentPath.Count) return;

        NavNode reachedNode = currentPath[reachedIndex];
        bool hasNext = reachedIndex + 1 < currentPath.Count;

        if (hasNext)
        {
            NavNode nextNode = currentPath[reachedIndex + 1];

            bool floorChanged = reachedNode.floorID != nextNode.floorID;
            bool buildingChanged = reachedNode.buildingID != nextNode.buildingID;

            bool isVerticalTransition =
                reachedNode.nodeType == NodeType.Stair ||
                reachedNode.nodeType == NodeType.Elevator;

            bool isEntranceTransition = reachedNode.isEntranceTransitionNode;

            // Case 1: stair/elevator transition
            if ((floorChanged || buildingChanged) && isVerticalTransition)
            {
                ShowFloorAndPath(nextNode.buildingID, nextNode.floorID);
                return;
            }

            // Case 2: outdoor entrance -> building ground floor
            if ((floorChanged || buildingChanged) && isEntranceTransition)
            {
                ShowFloorAndPath(nextNode.buildingID, nextNode.floorID);
                return;
            }
        }

        // Default: stay/update on current node's floor/building
        ShowFloorAndPath(reachedNode.buildingID, reachedNode.floorID);
    }

    // ---------------- NAVIGATION ----------------
    public void Navigate(string startRoom, string destinationRoom)
    {
        Debug.Log("NavigationController.Navigate called: " + startRoom + " -> " + destinationRoom);

        if (navManager == null || pathfinder == null || floorManager == null)
        {
            Debug.LogError("NavigationController references are missing.");
            ClearLine();
            return;
        }

        NavNode startNode = navManager.GetNodeByName(startRoom);
        NavNode endNode = navManager.GetNodeByName(destinationRoom);

        if (startNode == null || endNode == null)
        {
            Debug.LogError("Invalid start or destination room name");
            ClearLine();
            return;
        }

        currentPath = pathfinder.FindPath(startNode, endNode);

        if (currentPath == null || currentPath.Count == 0)
        {
            Debug.LogError("Path not found");
            ClearLine();
            return;
        }

        if (walker != null)
            walker.position = startNode.transform.position;

        // Show starting floor first
        ShowFloorAndPath(startNode.buildingID, startNode.floorID);

        // Since walker starts at node 0, next target is node 1
        walkIndex = (currentPath.Count > 1) ? 1 : 0;
    }

    // ---------------- SHOW FLOOR + DRAW PATH ----------------
    void ShowFloorAndPath(int buildingID, int floorID)
    {
        if (currentDisplayBuilding == buildingID && currentDisplayFloor == floorID)
            return;

        currentDisplayBuilding = buildingID;
        currentDisplayFloor = floorID;

        if (floorManager != null)
            floorManager.ShowFloor(buildingID, floorID);

        DrawPathForFloor(buildingID, floorID);
    }

    // ---------------- DRAW PATH ----------------
    void DrawPathForFloor(int buildingID, int floorID)
    {
        if (lineRenderer == null || currentPath == null || currentPath.Count == 0)
            return;

        List<Vector3> positions = new List<Vector3>();

        for (int i = 0; i < currentPath.Count - 1; i++)
        {
            NavNode current = currentPath[i];
            NavNode next = currentPath[i + 1];

            if (current.buildingID == buildingID &&
                next.buildingID == buildingID &&
                current.floorID == floorID &&
                next.floorID == floorID)
            {
                if (positions.Count == 0)
                    positions.Add(current.transform.position);

                positions.Add(next.transform.position);
            }
        }

        if (positions.Count < 2)
        {
            lineRenderer.positionCount = 0;
            return;
        }

        lineRenderer.positionCount = positions.Count;
        lineRenderer.SetPositions(positions.ToArray());
    }

    void ClearLine()
    {
        if (lineRenderer != null)
            lineRenderer.positionCount = 0;
    }
}