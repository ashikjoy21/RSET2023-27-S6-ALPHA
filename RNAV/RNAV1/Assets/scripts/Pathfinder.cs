using System.Collections.Generic;
using UnityEngine;

public class Pathfinder : MonoBehaviour
{
    public float turnPenalty = 2f;   // penalize zig-zag
    public float verticalPenalty = 10f; // stairs/elevator penalty

    public List<NavNode> FindPath(NavNode start, NavNode goal)
    {
        if (start == null || goal == null)
        {
            Debug.LogError("Start or Goal NULL");
            return null;
        }

        var open = new List<NavNode>();
        var closed = new HashSet<NavNode>();

        var cameFrom = new Dictionary<NavNode, NavNode>();
        var gScore = new Dictionary<NavNode, float>();

        open.Add(start);
        gScore[start] = 0f;

        while (open.Count > 0)
        {
            // Sort by F score (REAL A*)
            open.Sort((a, b) => GetF(a, goal, gScore).CompareTo(GetF(b, goal, gScore)));
            NavNode current = open[0];

            if (current == goal)
                return Reconstruct(cameFrom, current);

            open.Remove(current);
            closed.Add(current);

            foreach (var neighbor in current.connectedNodes)
            {
                if (neighbor == null || closed.Contains(neighbor))
                    continue;

                float cost = Vector3.Distance(current.transform.position, neighbor.transform.position);

                // Floor change penalty
                if (current.floorID != neighbor.floorID)
                    cost += verticalPenalty;

                // Turn penalty (prefer straight lines)
                if (cameFrom.ContainsKey(current))
                {
                    Vector3 prevDir = (current.transform.position - cameFrom[current].transform.position).normalized;
                    Vector3 newDir = (neighbor.transform.position - current.transform.position).normalized;
                    float turn = 1 - Vector3.Dot(prevDir, newDir); // 0 straight, 2 opposite
                    cost += turn * turnPenalty;
                }

                float tentativeG = gScore[current] + cost;

                if (!gScore.ContainsKey(neighbor) || tentativeG < gScore[neighbor])
                {
                    cameFrom[neighbor] = current;
                    gScore[neighbor] = tentativeG;

                    if (!open.Contains(neighbor))
                        open.Add(neighbor);
                }
            }
        }

        Debug.LogError("NO PATH FOUND");
        return null;
    }

    float GetF(NavNode node, NavNode goal, Dictionary<NavNode, float> gScore)
    {
        float g = gScore.ContainsKey(node) ? gScore[node] : Mathf.Infinity;

        // Graph heuristic: Manhattan distance (better for corridors)
        Vector3 a = node.transform.position;
        Vector3 b = goal.transform.position;
        float h = Mathf.Abs(a.x - b.x) + Mathf.Abs(a.z - b.z);

        return g + h;
    }

    List<NavNode> Reconstruct(Dictionary<NavNode, NavNode> cameFrom, NavNode current)
    {
        List<NavNode> path = new List<NavNode>();
        while (current != null)
        {
            path.Insert(0, current);
            cameFrom.TryGetValue(current, out current);
        }
        return path;
    }
}
