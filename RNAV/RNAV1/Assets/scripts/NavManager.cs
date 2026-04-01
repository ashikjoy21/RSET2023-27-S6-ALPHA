using System.Collections.Generic;
using UnityEngine;

public class NavManager : MonoBehaviour
{
    public List<NavNode> allNodes = new List<NavNode>();
    private Dictionary<string, NavNode> nodeLookup = new Dictionary<string, NavNode>();

    void Awake()
    {
        NavNode[] nodes = FindObjectsOfType<NavNode>();
        allNodes = new List<NavNode>(nodes);

        nodeLookup.Clear();

        foreach (NavNode node in allNodes)
        {
            if (!string.IsNullOrEmpty(node.roomName))
            {
                string normalizedName = Normalize(node.roomName);

                if (!nodeLookup.ContainsKey(normalizedName))
                {
                    nodeLookup.Add(normalizedName, node);
                }
                else
                {
                    Debug.LogWarning("Duplicate room name found: " + node.roomName);
                }
            }
        }
    }

    public NavNode GetNodeByName(string roomName)
    {
        if (string.IsNullOrEmpty(roomName))
            return null;

        string normalizedInput = Normalize(roomName);

        if (nodeLookup.ContainsKey(normalizedInput))
            return nodeLookup[normalizedInput];

        Debug.LogError("Room not found: " + roomName);
        return null;
    }

    private string Normalize(string input)
    {
        return input.Trim().ToLower();
    }
}
