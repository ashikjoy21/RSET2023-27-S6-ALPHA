# NeuroGuard: Hybrid AI EEG Seizure Detection Suite 

## Overview
NeuroGuard is an end-to-end Automated Seizure Detection System designed to automate the detection of epileptic seizures from raw EEG recordings. Built to serve as a reliable second opinion for neurologists in Epilepsy Monitoring Units, this suite processes continuous `.edf` files using a localized Hybrid AI inference engine and visualizes the results through a fully interactive, explainable dashboard.

## Key Features
* **End-to-End Pipeline:** Directly ingests raw `.edf` files, resamples to 256Hz, and applies 0.5-60Hz bandpass filtering.
* **Hybrid AI Engine:** * **Machine Learning Branch:** XGBoost, Random Forest, and SVM analyze 1D statistical biomarkers (Line Length, ZCR, Wavelet Entropy).
  * **Deep Learning Branch:** A CNN-BiLSTM network analyzes spatial-temporal patterns in 2D STFT Spectrograms.
  * **Ensemble Fusion:** Combines predictions with temporal smoothing to eliminate false positives.
* **UI Dashboard (PyQt6):** Features real-time waveform rendering, an interactive timeline scrubber, and an "Explainable AI" 5-panel biomarker plot to visually justify the AI's detection zones.
* **Secure Data Management:** Integrated offline SQLite database ensures strict patient data privacy while automatically logging scan histories and seizure timestamps.

## Tech Stack
* **Core:** Python 3.9+
* **Signal Processing:** `mne`, `scipy`, `pywavelets`
* **AI Engine:** `tensorflow/keras`, `scikit-learn`, `xgboost`
* **UI & Visualization:** `PyQt6`, `pyqtgraph`, `matplotlib`
* **Database:** `sqlite3`

## Datasets Used
The models were trained and cross-validated using publicly available databases from PhysioNet to ensure generalization across different demographics:
1. **CHB-MIT Scalp EEG Database** 
2. **Siena Scalp EEG Database** 

## Installation & Setup
1. Clone the repository:
   ```bash
   git clone [https://github.com/yourusername/NeuroGuard.git](https://github.com/yourusername/NeuroGuard.git)
   cd NeuroGuard
