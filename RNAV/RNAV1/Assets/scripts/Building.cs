using UnityEngine;

public class Building : MonoBehaviour
{
    public GameObject[] floors; // Assign floors of THIS building only

    public void ShowFloor(int floorIndex)
    {
        for (int i = 0; i < floors.Length; i++)
        {
            floors[i].SetActive(i == floorIndex);
        }
    }
}
