using UnityEngine;

public class FloorManager : MonoBehaviour
{
    [System.Serializable]
    public class Building
    {
        public GameObject[] floors;
    }

    public Building[] buildings;

    public void ShowFloor(int buildingIndex, int floorIndex)
    {
        if (buildingIndex < 0 || buildingIndex >= buildings.Length) return;
        if (floorIndex < 0 || floorIndex >= buildings[buildingIndex].floors.Length) return;
        Debug.Log("Building: " + buildingIndex + " FloorIndex: " + floorIndex);
        for (int b = 0; b < buildings.Length; b++)
        {
            for (int f = 0; f < buildings[b].floors.Length; f++)
            {
                buildings[b].floors[f].SetActive(false);
            }
        }

        buildings[buildingIndex].floors[floorIndex].SetActive(true);
    }
}

