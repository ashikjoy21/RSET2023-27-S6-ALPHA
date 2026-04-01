using System.Collections.Generic;
using UnityEngine;

public enum NodeType
{
    Corridor,
    RoomEntrance,
    Stair,
    Elevator,
    Landmark
}

public class NavNode : MonoBehaviour
{
    [Header("Node Info")]
    public string nodeID;
    public string verticalGroup;
    public NodeType nodeType;

    [Header("Location")]
    public int floorID;   // 0,1,2,3...
    public int buildingID;

    // Compatibility for scripts using floorNumber
    public int floorNumber { get { return floorID; } }

    [Header("Transition")]
    public bool isFloorTransitionNode = false;
    public bool isEntranceTransitionNode = false;

    public int transitionToBuilding = -1;
    public int transitionToFloor = -1;

    [Header("Room Info (Only for RoomEntrance)")]
    public string roomName;

    [Header("Connections")]
    public List<NavNode> connectedNodes = new List<NavNode>();

    void Awake()
    {
        if (nodeType == NodeType.Stair || nodeType == NodeType.Elevator)
        {
            isFloorTransitionNode = true;
        }
    }

    private void OnDrawGizmos()
    {
        switch (nodeType)
        {
            case NodeType.Corridor:
                Gizmos.color = Color.blue;
                break;

            case NodeType.RoomEntrance:
                Gizmos.color = Color.yellow;
                break;

            case NodeType.Stair:
                Gizmos.color = Color.red;
                break;

            case NodeType.Elevator:
                Gizmos.color = Color.magenta;
                break;

            case NodeType.Landmark:
                Gizmos.color = Color.cyan;
                break;
        }

        Gizmos.DrawSphere(transform.position, 0.1f);

        if (connectedNodes != null)
        {
            Gizmos.color = Color.green;

            foreach (NavNode node in connectedNodes)
            {
                if (node != null)
                {
                    Gizmos.DrawLine(transform.position, node.transform.position);
                }
            }
        }
    }
}