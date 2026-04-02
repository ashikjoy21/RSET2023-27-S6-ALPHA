import os
import glob
import re
import numpy as np
import joblib
import mne
import tensorflow as tf
import datetime
import matplotlib.pyplot as plt
import warnings
from scipy.signal import welch
from sklearn.metrics import classification_report, accuracy_score, confusion_matrix
import seaborn as sns

# IGNORE VERSION WARNINGS (Clean up output)
warnings.filterwarnings("ignore", category=UserWarning)
warnings.filterwarnings("ignore", category=FutureWarning)

# ==========================================
# ⚙️ CONFIGURATION
# ==========================================
TEST_FILE_DIR = r"C:\Users\Albert\Desktop\MINI Project\Dataset\siena-scalp-eeg-database-1.0.0"
WINDOW_DURATION = 5  
TARGET_RATE = 256    
INPUT_LENGTH = int(WINDOW_DURATION * TARGET_RATE)

print("🚀 Starting Offline Test (Force Run Mode)...")
print(f"📂 Scanning: {TEST_FILE_DIR}")

# ==========================================
# 1. LOAD MODELS
# ==========================================
print("🧠 Loading AI Models...", end=" ")
models = {}
try:
    if os.path.exists('xgboost_seizure_model.json'):
        models['xgb'] = joblib.load('xgboost_seizure_model.json')
    if os.path.exists('rf_chb_model.json'):
        models['rf'] = joblib.load('rf_chb_model.json')
    if os.path.exists('svm_chb_model.json'):
        models['svm'] = joblib.load('svm_chb_model.json')
    if os.path.exists('cnn_chb_model.h5'):
        models['cnn'] = tf.keras.models.load_model('cnn_chb_model.h5')
    print(f"✅ Loaded {len(models)} models.")
except Exception as e:
    print(f"\n❌ Error loading models: {e}")
    # We continue anyway to debug paths, but prediction will fail later if empty
    
if not models:
    print("❌ CRITICAL: No models found. Please put .json/.h5 files in this folder.")
    exit()

# ==========================================
# 2. HELPER: ROBUST SIENA PARSER
# ==========================================
def get_siena_labels(edf_path):
    """Parses .txt file. Prints debug info if it fails."""
    base_path = os.path.splitext(edf_path)[0]
    txt_path = base_path + ".txt"
    
    # DEBUG: Check if txt exists
    if not os.path.exists(txt_path):
        print(f"   ⚠️ Text file missing: {os.path.basename(txt_path)}")
        return []

    seizures = []
    reg_start = None
    
    try:
        with open(txt_path, 'r', encoding='latin-1') as f:
            lines = f.readlines()
            
        for line in lines:
            line = line.strip()
            # 1. Registration Start
            if "Start time" in line or "Registration start" in line:
                try:
                    time_part = line.split("time:")[1].strip()
                    reg_start = datetime.datetime.strptime(time_part, "%H.%M.%S")
                except: pass
            
            # 2. Seizure Start/End
            if "Seizure start" in line:
                try:
                    time_part = line.split("time:")[1].strip()
                    s_obj = datetime.datetime.strptime(time_part, "%H.%M.%S")
                except: pass
            
            if "Seizure end" in line:
                try:
                    time_part = line.split("time:")[1].strip()
                    e_obj = datetime.datetime.strptime(time_part, "%H.%M.%S")
                    
                    if reg_start and 's_obj' in locals():
                        # Fix midnight crossover
                        if s_obj < reg_start: s_obj += datetime.timedelta(days=1)
                        if e_obj < reg_start: e_obj += datetime.timedelta(days=1)
                        
                        start = (s_obj - reg_start).total_seconds()
                        end = (e_obj - reg_start).total_seconds()
                        
                        if end > start:
                            seizures.append((start, end))
                            # print(f"   found seizure: {start}-{end}")
                except: pass
    except Exception as e:
        print(f"   ⚠️ Error reading text file: {e}")
        return []

    return seizures

# ==========================================
# 3. HELPER: FEATURE EXTRACTION
# ==========================================
def extract_features(window_data, fs):
    if window_data.ndim == 2: ch = window_data[0] 
    else: ch = window_data    
    
    line_len = np.sum(np.abs(np.diff(ch)))
    energy = np.sum(ch ** 2)
    variance = np.var(ch)
    zero_crossings = np.sum(np.diff(np.sign(ch)) != 0)
    peak_to_peak = np.ptp(ch)
    rms = np.sqrt(np.mean(ch**2))
    
    freqs, psd = welch(ch, fs, nperseg=fs)
    delta = np.sum(psd[(freqs >= 0.5) & (freqs < 4)])
    theta = np.sum(psd[(freqs >= 4) & (freqs < 8)])
    alpha = np.sum(psd[(freqs >= 8) & (freqs < 13)])
    beta  = np.sum(psd[(freqs >= 13) & (freqs < 30)])
    gamma = np.sum(psd[(freqs >= 30) & (freqs < 40)])
    
    return np.array([line_len, energy, variance, zero_crossings, 
                     peak_to_peak, rms, delta, theta, alpha, beta, gamma]).reshape(1, -1)

# ==========================================
# 4. MAIN TEST LOOP
# ==========================================
edf_files = glob.glob(os.path.join(TEST_FILE_DIR, "**", "*.edf"), recursive=True)
print(f"🔍 Found {len(edf_files)} EDF files.")

for edf_path in edf_files:
    filename = os.path.basename(edf_path)
    seizures = get_siena_labels(edf_path)
    
    # --- CHANGED: Process EVERYTHING, even if 0 seizures found ---
    # This helps debugging. If it processes but graph is flat, the parser is the issue.
    # If it crashes, the model is the issue.
    
    print(f"\n📂 Analyzing: {filename} | Seizures Found in Text: {len(seizures)}")
    
    try:
        # Load
        raw = mne.io.read_raw_edf(edf_path, preload=True, verbose=False)
        
        # Resample
        if int(raw.info['sfreq']) != TARGET_RATE:
            raw.resample(TARGET_RATE, npad="auto")
            
        raw.filter(0.4, 40.0, verbose=False)
        data = raw.get_data().astype(np.float32) * 1e6
        n_samples = data.shape[1]
        
        # Build Truth Labels
        labels = np.zeros(n_samples, dtype=np.int8)
        for (start, end) in seizures:
            s, e = int(start * TARGET_RATE), int(end * TARGET_RATE)
            labels[s:min(e, n_samples)] = 1
            
        ch_data = data[0]
        
        y_true = []
        y_prob = []
        
        # Process Windows
        for start in range(0, n_samples - INPUT_LENGTH, INPUT_LENGTH):
            end = start + INPUT_LENGTH
            window = ch_data[start:end]
            
            # Ground Truth
            is_seizure = 1 if np.sum(labels[start:end]) > 0 else 0
            y_true.append(is_seizure)
            
            # Features
            feats = extract_features(window, TARGET_RATE)
            
            # CNN Prep
            cnn_win = (window - np.mean(window)) / (np.std(window) + 1e-6)
            cnn_in = cnn_win.reshape(1, INPUT_LENGTH, 1)
            
            # Predictions
            p_xgb = models['xgb'].predict_proba(feats)[0][1] if 'xgb' in models else 0
            p_rf  = models['rf'].predict_proba(feats)[0][1]  if 'rf' in models else 0
            p_svm = models['svm'].predict_proba(feats)[0][1] if 'svm' in models else 0
            p_cnn = float(models['cnn'].predict(cnn_in, verbose=0)[0][0]) if 'cnn' in models else 0
            
            # Ensemble
            final_prob = (p_xgb * 0.3) + (p_rf * 0.3) + (p_cnn * 0.3) + (p_svm * 0.1)
            y_prob.append(final_prob)
            
        # Visualize
        y_probs = np.array(y_prob)
        y_true_arr = np.array(y_true)
        y_preds = (y_probs > 0.5).astype(int)
        
        print("-" * 40)
        # Only print report if we actually have labels (otherwise metrics explode)
        if len(np.unique(y_true_arr)) > 1:
            print(classification_report(y_true_arr, y_preds, target_names=['Normal', 'Seizure'], zero_division=0))
        else:
            print("ℹ️ Note: No seizures found in ground truth (Normal File or Parser Error)")
        
        plt.figure(figsize=(12, 6))
        plt.fill_between(range(len(y_true_arr)), y_true_arr, color='black', alpha=0.2, label='Ground Truth')
        plt.plot(y_probs, color='red', linewidth=2, label='AI Confidence')
        plt.axhline(0.5, color='blue', linestyle='--', label='Threshold')
        plt.title(f"Detection: {filename}")
        plt.legend()
        plt.show()
        
        # Wait for user input
        input("Press Enter for next patient...")
        
    except Exception as e:
        print(f"❌ Skipped {filename}: {e}")