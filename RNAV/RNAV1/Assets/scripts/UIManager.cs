using System.Collections.Generic;
using UnityEngine;
using TMPro;
using ZXing;


public class UIManager : MonoBehaviour
{
    [Header("Panels")]
    public GameObject homePanel;
    public GameObject campusPanel;
    public GameObject eventPanel;
    public GameObject navigationOverlay;
    public SimpleQRScanner qrScanner;

    [Header("Campus Dropdowns")]
    public TMP_Dropdown startDropdown;
    public TMP_Dropdown destinationDropdown;

    [Header("Event Dropdown")]
    public TMP_Dropdown eventStartDropdown;
    public TMP_Text scannedDestinationText;

    [Header("Overlay Text")]
    public TMP_Text buildingText;
    public TMP_Text floorText;
    public TMP_Text destinationText;

    [Header("Optional Navigation")]
    public NavigationController navigationController;

    private string scannedDestination = "";

    public List<string> allLocations = new List<string>()
    {
        "Select Location",
        "Library",
        "LH 28",
        "Office",
        "LH 7",
        "Reception",
        "Physics Lab",
        "Chemistry Lab",
        "Canteen",
        "Stage",
        "Basketball Court",
        "Main Building Entrance",
        "PG Block Entrance",
        "KE Block Entrance"
    };

    void Start()
    {
        ShowHome();

        if (navigationOverlay != null)
            navigationOverlay.SetActive(false);

        if (scannedDestinationText != null)
            scannedDestinationText.text = "Event Destination: Not scanned yet";

        PopulateDropdown(startDropdown, "Select Start Location");
        PopulateDropdown(destinationDropdown, "Select Destination");
        PopulateDropdown(eventStartDropdown, "Select Nearby Start Location");
    }

    void PopulateDropdown(TMP_Dropdown dropdown, string firstOption)
    {
        if (dropdown == null) return;

        List<string> options = new List<string>();
        options.Add(firstOption);

        for (int i = 1; i < allLocations.Count; i++)
            options.Add(allLocations[i]);

        dropdown.ClearOptions();
        dropdown.AddOptions(options);
        dropdown.value = 0;
        dropdown.RefreshShownValue();
    }

    public void ShowHome()
    {
        if (homePanel != null) homePanel.SetActive(true);
        if (campusPanel != null) campusPanel.SetActive(false);
        if (eventPanel != null) eventPanel.SetActive(false);
    }
    public void SetScannedDestination(string destinationFromQR)
{
    scannedDestination = destinationFromQR;

    if (scannedDestinationText != null)
        scannedDestinationText.text = "Event Destination: " + scannedDestination;
}

    public void ShowCampusPanel()
    {
        if (homePanel != null) homePanel.SetActive(false);
        if (campusPanel != null) campusPanel.SetActive(true);
        if (eventPanel != null) eventPanel.SetActive(false);
    }

    public void ShowEventPanel()
    {
        if (homePanel != null) homePanel.SetActive(false);
        if (campusPanel != null) campusPanel.SetActive(false);
        if (eventPanel != null) eventPanel.SetActive(true);
    }

    public void ShowError(string message)
    {
        Debug.LogError(message);
    }

    public void OnShowPathClicked()
{
    if (startDropdown == null || destinationDropdown == null)
    {
        ShowError("Dropdown references are missing.");
        return;
    }

    if (startDropdown.value == 0)
    {
        ShowError("Please select the start location.");
        return;
    }

    if (destinationDropdown.value == 0)
    {
        ShowError("Please select the destination.");
        return;
    }

    string startLocation = startDropdown.options[startDropdown.value].text;
    string destination = destinationDropdown.options[destinationDropdown.value].text;

    if (startLocation == destination)
    {
        ShowError("Start location and destination cannot be the same.");
        return;
    }

    homePanel.SetActive(false);
    campusPanel.SetActive(false);
    eventPanel.SetActive(false);

    if (navigationOverlay != null)
        navigationOverlay.SetActive(true);

    if (destinationText != null)
        destinationText.text = "Destination: " + destination;

    Debug.Log("Campus Navigation Requested: " + startLocation + " -> " + destination);

    if (navigationController != null)
    {
        navigationController.Navigate(startLocation, destination);
    }
    else
    {
        Debug.LogError("NavigationController is not assigned in UIManager.");
    }
}

   public void OnScanQRClicked()
{
    if (qrScanner != null)
    {
        qrScanner.StartScan();
    }
    else
    {
        Debug.LogError("QR Scanner is not assigned.");
    }
}

    
    public void OnNavigateEventClicked()
{
    if (eventStartDropdown == null)
    {
        ShowError("Event start dropdown reference is missing.");
        return;
    }

    if (eventStartDropdown.value == 0)
    {
        ShowError("Please select the nearby start location.");
        return;
    }

    if (string.IsNullOrEmpty(scannedDestination))
    {
        ShowError("Please scan the event QR first.");
        return;
    }

    string startLocation = eventStartDropdown.options[eventStartDropdown.value].text;

    homePanel.SetActive(false);
    campusPanel.SetActive(false);
    eventPanel.SetActive(false);

    if (navigationOverlay != null)
        navigationOverlay.SetActive(true);

    if (destinationText != null)
        destinationText.text = "Destination: " + scannedDestination;

    Debug.Log("Event Navigation Requested: " + startLocation + " -> " + scannedDestination);

    if (navigationController != null)
    {
        navigationController.Navigate(startLocation, scannedDestination);
    }
    else
    {
        Debug.LogError("NavigationController is not assigned in UIManager.");
    }
}}