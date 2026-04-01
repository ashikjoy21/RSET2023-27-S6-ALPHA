using UnityEngine;

public class BuildingManager : MonoBehaviour
{
    public Building[] buildings;  // Assign all buildings here

    private int currentBuilding = 0;

    public void SelectBuilding(int buildingIndex)
    {
        currentBuilding = buildingIndex;
    }

    public void ShowFloor(int floorIndex)
    {
        buildings[currentBuilding].ShowFloor(floorIndex);
    }
}

