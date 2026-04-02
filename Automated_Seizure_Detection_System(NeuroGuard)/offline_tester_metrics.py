import os
import glob
import re
import numpy as np
import joblib
import mne
import tensorflow as tf
import datetime
import matplotlib.pyplot as plt
import seaborn as sns
import warnings
from scipy.signal import welch
from sklearn.metrics import accuracy_score, confusion_matrix, precision_score, recall_score, f1_score

# IGNORE WARNINGS
warnings.filterwarnings("ignore")

# ==========================================
# ⚙️ CONFIGURATION
# ==========================================
TEST_FILE_DIR = r"C:\Users\Albert\Desktop\MINI Project\Dataset\siena-scalp-eeg-database-1.0.0"
WINDOW_DURATION = 5  
TARGET_RATE = 256    
INPUT_LENGTH = int(WINDOW_DURATION * TARGET_RATE)

# 🔥 SENSITIVITY SETTING
THRESHOLD = 0.40  # Lowered from 0.50 to catch more seizures

print(f"🚀 Starting Forensic Exam (Threshold: {THRESHOLD})...")
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

# ==========================================
# 2. HELPER: ROBUST SIENA PARSER
# ==========================================
def get_siena_labels(edf_path):
    base_path = os.path.splitext(edf_path)[0]
    txt_path = base_path + ".txt"
    if not os.path.exists(txt_path): 
        return []

    seizures = []
    reg_start = None
    
    try:
        with open(txt_path, 'r', encoding='latin-1') as f:
            lines = f.readlines()
            
        for line in lines:
            line = line.strip()
            
            # Flexible Parsing for Registration Start
            if "start time" in line.lower():
                try:
                    match = re.search(r'(\d{2})[\.:](\d{2})[\.:](\d{2})', line)
                    if match:
                        h, m, s = map(int, match.groups())
                        reg_start = datetime.datetime(2000, 1, 1, h, m, s)
                except: pass
            
            # Flexible Parsing for Seizures
            if "seizure" in line.lower():
                try:
                    match = re.search(r'(\d{2})[\.:](\d{2})[\.:](\d{2})', line)
                    if match:
                        h, m, s = map(int, match.groups())
                        t_obj = datetime.datetime(2000, 1, 1, h, m, s)
                        
                        if "start" in line.lower():
                            s_obj = t_obj
                        elif "end" in line.lower():
                            e_obj = t_obj
                            
                            if reg_start and 's_obj' in locals():
                                if s_obj < reg_start: s_obj += datetime.timedelta(days=1)
                                if e_obj < reg_start: e_obj += datetime.timedelta(days=1)
                                
                                start = (s_obj - reg_start).total_seconds()
                                end = (e_obj - reg_start).total_seconds()
                                
                                if end > start: seizures.append((start, end))
                except: pass
    except: return []
    return seizures

# ==========================================
# 3. HELPER: FEATURES
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
# 4. MAIN LOOP
# ==========================================
edf_files = glob.glob(os.path.join(TEST_FILE_DIR, "**", "*.edf"), recursive=True)
print(f"🔍 Found {len(edf_files)} EDF files.")

for edf_path in edf_files:
    filename = os.path.basename(edf_path)
    seizures = get_siena_labels(edf_path)
    
    print(f"\n📂 Analyzing: {filename} | Seizures found in txt: {len(seizures)}")
    
    try:
        raw = mne.io.read_raw_edf(edf_path, preload=True, verbose=False)
        if int(raw.info['sfreq']) != TARGET_RATE:
            raw.resample(TARGET_RATE, npad="auto")
            
        raw.filter(0.5, 40.0, verbose=False)
        data = raw.get_data().astype(np.float32) * 1e6
        
        n_samples = data.shape[1]
        labels = np.zeros(n_samples, dtype=np.int8)
        for (start, end) in seizures:
            s, e = int(start * TARGET_RATE), int(end * TARGET_RATE)
            labels[s:min(e, n_samples)] = 1
            
        ch_data = data[0]
        y_true, y_preds = [], {'XGBoost': [], 'RandomForest': [], 'SVM': [], 'CNN': [], 'Ensemble': []}
        
        # Limit to first 300 windows for speed debugging (Optional)
        # remove [:300] to process full file
        windows_to_process = list(range(0, n_samples - INPUT_LENGTH, INPUT_LENGTH))
        
        print(f"   Processing {len(windows_to_process)} windows...", end="\r")

        for start in windows_to_process:
            end = start + INPUT_LENGTH
            window = ch_data[start:end]
            
            # 1. Ground Truth
            is_seizure = 1 if np.sum(labels[start:end]) > 0 else 0
            y_true.append(is_seizure)
            
            # 2. Features
            feats = extract_features(window, TARGET_RATE)
            
            # 3. CNN Input
            cnn_win = (window - np.mean(window)) / (np.std(window) + 1e-6)
            cnn_in = cnn_win.reshape(1, INPUT_LENGTH, 1)
            
            # 4. Predict Probabilities
            p_xgb = models['xgb'].predict_proba(feats)[0][1] if 'xgb' in models else 0
            p_rf  = models['rf'].predict_proba(feats)[0][1]  if 'rf' in models else 0
            p_svm = models['svm'].predict_proba(feats)[0][1] if 'svm' in models else 0
            p_cnn = float(models['cnn'].predict(cnn_in, verbose=0)[0][0]) if 'cnn' in models else 0
            
            # 5. Apply Threshold (0.40)
            y_preds['XGBoost'].append(1 if p_xgb > THRESHOLD else 0)
            y_preds['RandomForest'].append(1 if p_rf > THRESHOLD else 0)
            y_preds['SVM'].append(1 if p_svm > THRESHOLD else 0)
            y_preds['CNN'].append(1 if p_cnn > THRESHOLD else 0)
            
            final_prob = (p_xgb * 0.3) + (p_rf * 0.3) + (p_cnn * 0.3) + (p_svm * 0.1)
            y_preds['Ensemble'].append(1 if final_prob > THRESHOLD else 0)

        # PLOT
        print(f"\n   ✅ Done. Generating Matrix...")
        
        # Check if we have both classes
        unique_labels = np.unique(y_true)
        if len(unique_labels) < 2:
            print(f"   ℹ️ NOTE: Only one class present: {unique_labels}. Matrix might look simple.")

        fig, axes = plt.subplots(1, 5, figsize=(20, 4))
        model_names = ['XGBoost', 'RandomForest', 'SVM', 'CNN', 'Ensemble']

        for i, name in enumerate(model_names):
            cm = confusion_matrix(y_true, y_preds[name])
            sns.heatmap(cm, annot=True, fmt='d', cmap='Blues', ax=axes[i], 
                        xticklabels=['Norm', 'Seiz'], yticklabels=['Norm', 'Seiz'], cbar=False)
            axes[i].set_title(f"{name} (> {THRESHOLD})")
        
        plt.suptitle(f"Confusion Matrices: {filename}", fontsize=14)
        plt.tight_layout()
        plt.show()
        
        input("Press Enter for next file...")

    except Exception as e:
        print(f"❌ Error: {e}")